import {
  asyncBufferFromUrl,
  cachedAsyncBuffer,
  parquetMetadataAsync,
  parquetReadObjects,
  type AsyncBuffer,
  type FileMetaData,
} from "hyparquet";
import { compressors } from "hyparquet-compressors";
// Type-only imports, relative, so this module also runs under plain Node
// (web/scripts/verify-queries.ts) without the "@/" path alias.
import type {
  CalendarBasis,
  CalendarResult,
  CalendarRow,
  CalendarScope,
  CellDayRow,
  Params,
  Sensor,
  Series,
} from "./types";

/**
 * The data layer. The ONLY module allowed to import hyparquet (ADR 0001).
 *
 * Read path: static files under web/public/data/, fetched over HTTP range
 * requests. No database, no API server, no credentials.
 *
 * - The calendars: the world files (calendar_*_global.parquet, every FIRMS
 *   country) are read by HTTP range, country rows first and H3 rows only for
 *   the row groups a drawn area needs; the four-country files are the
 *   fallback and are read whole. Both are held in module scope.
 * - cell_day.parquet is sorted by H3 res-2 parent then day. It is only ever
 *   filtered on `h3_parent`, which is what lets row-group statistics skip
 *   most of the file. Never filter it on a raw cell-id range: H3 ids of a
 *   contiguous map area are not a contiguous range.
 *
 * All parquet files are ZSTD-compressed, hence hyparquet-compressors.
 */

/* ------------------------------------------------------------------ */
/* File access                                                        */
/* ------------------------------------------------------------------ */

let dataBaseUrl = "/data";

/**
 * Override where the data files are served from. The browser default is
 * "/data" (Next serves web/public/ at the site root). Node scripts must pass
 * an absolute URL, since fetch has no page origin to resolve against.
 */
export function setDataBaseUrl(url: string): void {
  dataBaseUrl = url.replace(/\/+$/, "");
  files.clear();
  rawTable = null;
  harmonizedTable = null;
  paramsPromise = null;
  cellDayParentsPromise = null;
}

/**
 * The world files (every FIRMS country, fit v1-20261114T1240) and the
 * four-country files they replace. Every reader tries the world file first
 * and falls back to the four-country one if it cannot be loaded.
 */
const FILESETS = {
  raw: ["calendar_raw_global.parquet", "calendar_raw.parquet"],
  harmonized: ["calendar_harmonized_global.parquet", "calendar_harmonized.parquet"],
  params: ["params_global.json", "params.json"],
} as const;

/** Which file set actually loaded: "world" or the four-country fallback. */
export type DataSet = "world" | "four";
const setOf = (name: string): DataSet => (name.includes("_global") ? "world" : "four");

interface OpenFile {
  file: AsyncBuffer;
  metadata: FileMetaData;
}

const files = new Map<string, Promise<OpenFile>>();

/**
 * Small files (the four-country calendars, < 0.5 MB) are fetched whole in ONE
 * request. The world calendars (2.5-4 MB) are read by range: one request for
 * the file's tail (size + footer), then only the row groups a view needs. The
 * country rows sit at the front of each file (sorted by scope, then key), so
 * the country views read ~0.8 MB and never touch the H3 rows.
 */
const WHOLE_FILES = new Set(["calendar_raw.parquet", "calendar_harmonized.parquet"]);

/**
 * Bytes read from the end of a world file in its first request: covers the
 * footer (33 KB raw, 10 KB harmonized for fit v1-20261114T1240). A larger
 * footer still works, at the cost of one more range read.
 */
export const TAIL_BYTES = 40960;

/**
 * A download already started by the page's inline prefetch script
 * (components/DataPreload.tsx), if any. Each is consumed once.
 */
function takePrefetched<T>(url: string): Promise<T> | null {
  if (typeof window === "undefined") return null;
  const store = (window as unknown as { __emberlinePrefetch?: Record<string, Promise<T>> }).__emberlinePrefetch;
  const hit = store?.[url];
  if (hit) delete store[url];
  return hit ?? null;
}

/** What the tail request returned: the file's size and its last bytes, or the whole file. */
interface Tail { total: number; start: number; bytes: ArrayBuffer }

/** Shared with DataPreload.tsx (same request, same parsing), so either can start it. */
async function fetchTail(url: string): Promise<Tail> {
  const r = await fetch(url, { headers: { Range: `bytes=-${TAIL_BYTES}` } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const bytes = await r.arrayBuffer();
  const m = /\/(\d+)\s*$/.exec(r.headers.get("content-range") ?? "");
  if (r.status === 206 && m) {
    const total = Number(m[1]);
    return { total, start: total - bytes.byteLength, bytes };
  }
  if (r.status === 200) return { total: bytes.byteLength, start: 0, bytes }; // server ignored the range: whole file
  throw new Error(`${url}: unexpected range response`);
}

/**
 * An AsyncBuffer over HTTP range requests that keeps every byte range it has
 * fetched, so a slice inside an earlier range (the footer inside the tail, a
 * column chunk inside a prefetched row-group span) costs no request.
 */
function rangeBuffer(url: string, tail: Tail): AsyncBuffer & { prefetch(start: number, end: number): void } {
  const chunks: Array<{ start: number; end: number; buf: Promise<ArrayBuffer> }> = [
    { start: tail.start, end: tail.total, buf: Promise.resolve(tail.bytes) },
  ];
  const get = (start: number, end: number): Promise<ArrayBuffer> => {
    const hit = chunks.find((c) => c.start <= start && end <= c.end);
    if (hit) return hit.buf.then((b) => b.slice(start - hit.start, end - hit.start));
    const entry = {
      start, end,
      buf: fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } }).then(async (r) => {
        if (r.status === 206) return r.arrayBuffer();
        if (r.ok) return (await r.arrayBuffer()).slice(start, end);
        throw new Error(`${url}: HTTP ${r.status}`);
      }),
    };
    entry.buf.catch(() => chunks.splice(chunks.indexOf(entry), 1));
    chunks.push(entry);
    return entry.buf;
  };
  return {
    byteLength: tail.total,
    slice: (start: number, end?: number) => get(start, end ?? tail.total),
    prefetch: (start: number, end: number) => { void get(start, end).catch(() => {}); },
  };
}

/** Open a parquet file once. */
function openParquet(name: string): Promise<OpenFile> {
  let entry = files.get(name);
  if (!entry) {
    entry = (async () => {
      const url = `${dataBaseUrl}/${name}`;
      if (WHOLE_FILES.has(name)) {
        const file = await (takePrefetched<ArrayBuffer>(url) ?? fetch(url).then((r) => {
          if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
          return r.arrayBuffer();
        }));
        return { file, metadata: await parquetMetadataAsync(file) };
      }
      if (name.includes("_global")) {
        const tail = await (takePrefetched<Tail>(`${url}#tail`) ?? fetchTail(url));
        const file = rangeBuffer(url, tail);
        // Footer read from the tail already fetched (a larger footer costs one more range read).
        return { file, metadata: await parquetMetadataAsync(file, { initialFetchSize: tail.total - tail.start }) };
      }
      const remote = await asyncBufferFromUrl({ url });
      // Keeps fetched byte ranges, so repeat reads of the same row group are free.
      const file = cachedAsyncBuffer(remote);
      const metadata = await parquetMetadataAsync(file);
      return { file, metadata };
    })();
    // A failed open must not poison the cache; the next call retries.
    entry.catch(() => files.delete(name));
    files.set(name, entry);
  }
  return entry;
}

/** int64 columns arrive as bigint. Every count here fits a double. */
function num(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : (value as number);
}

const ym = (year: number, month: number) => year * 12 + (month - 1);

/**
 * What the inline script in components/DataPreload.tsx starts on a real page
 * load, in parallel with the JS bundle: `tail` URLs get the ranged tail request
 * (see fetchTail), `json` URLs a plain fetch.
 */
export function dataPreloads(): { tail: string[]; json: string[]; tailBytes: number } {
  return {
    tail: ["/data/calendar_raw_global.parquet", "/data/calendar_harmonized_global.parquet"],
    json: ["/data/params_global.json"],
    tailBytes: TAIL_BYTES,
  };
}

/* ------------------------------------------------------------------ */
/* params.json                                                         */
/* ------------------------------------------------------------------ */

let paramsPromise: Promise<Params> | null = null;

async function fetchJson<T>(name: string): Promise<T> {
  const url = `${dataBaseUrl}/${name}`;
  const early = takePrefetched<T>(url);
  if (early) return early;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * The published fit: params_global.json (every fitted country), or
 * params.json (four countries) if the world file cannot be loaded.
 * `dataset` records which one it is.
 */
export function getParams(): Promise<Params> {
  if (!paramsPromise) {
    paramsPromise = (async () => {
      let lastError: unknown;
      for (const name of FILESETS.params) {
        try {
          const p = await fetchJson<Params>(name);
          return { ...p, failed: p.failed ?? {}, dataset: setOf(name) };
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("params: not available");
    })();
    paramsPromise.catch(() => {
      paramsPromise = null;
    });
  }
  return paramsPromise;
}

/* ------------------------------------------------------------------ */
/* Calendar tables                                                     */
/* ------------------------------------------------------------------ */

/** Row-group statistics, used to read only the row groups a query needs. */
interface GroupInfo {
  rowStart: number;
  rowEnd: number;
  byteStart: number;
  byteEnd: number;
  /** Byte range of each column chunk, by column name. */
  colBytes: Map<string, [number, number]>;
  scopeMin?: string;
  scopeMax?: string;
  keyMin?: string;
  keyMax?: string;
}

interface Table<V> {
  name: string;
  dataset: DataSet;
  open: OpenFile;
  groups: GroupInfo[];
  loaded: Map<number, Promise<void>>;
  /** scope -> key -> cell -> value */
  index: Map<CalendarScope, Map<string, Map<V, number>>>;
}

function groupInfo(metadata: FileMetaData): GroupInfo[] {
  const cols = metadata.row_groups[0]?.columns.map((c) => c.meta_data?.path_in_schema.join(".")) ?? [];
  const si = cols.indexOf("scope"), ki = cols.indexOf("key");
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  let row = 0;
  return metadata.row_groups.map((rg) => {
    let byteStart = Infinity, byteEnd = 0;
    const colBytes = new Map<string, [number, number]>();
    for (const c of rg.columns) {
      const m = c.meta_data;
      if (!m) continue;
      const s = Number(m.dictionary_page_offset ?? m.data_page_offset);
      const e = s + Number(m.total_compressed_size);
      colBytes.set(m.path_in_schema.join("."), [s, e]);
      byteStart = Math.min(byteStart, s);
      byteEnd = Math.max(byteEnd, e);
    }
    const stat = (i: number) => (i >= 0 ? rg.columns[i].meta_data?.statistics : undefined);
    const s = stat(si), k = stat(ki);
    const info: GroupInfo = {
      rowStart: row, rowEnd: row + Number(rg.num_rows), byteStart, byteEnd, colBytes,
      scopeMin: str(s?.min_value ?? s?.min), scopeMax: str(s?.max_value ?? s?.max),
      keyMin: str(k?.min_value ?? k?.min), keyMax: str(k?.max_value ?? k?.max),
    };
    row = info.rowEnd;
    return info;
  });
}

/** Could this row group hold rows of `scope` (and, if given, one of `keys`)? Missing statistics mean yes. */
function mayHold(g: GroupInfo, scope: CalendarScope, keys: string[] | null): boolean {
  if (g.scopeMin !== undefined && scope < g.scopeMin) return false;
  if (g.scopeMax !== undefined && scope > g.scopeMax) return false;
  if (!keys || g.keyMin === undefined || g.keyMax === undefined) return true;
  return keys.some((k) => k >= g.keyMin! && k <= g.keyMax!);
}

async function openTable<V>(kind: "raw" | "harmonized"): Promise<Table<V>> {
  let lastError: unknown;
  for (const name of FILESETS[kind]) {
    try {
      const open = await openParquet(name);
      return { name, dataset: setOf(name), open, groups: groupInfo(open.metadata), loaded: new Map(), index: new Map() };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${kind} calendar: not available`);
}

/**
 * Read (once) every row group that may hold `scope` rows for `keys` (all keys
 * of the scope when null), and add their rows to the table's index.
 * Consecutive row groups are fetched as one byte range.
 */
async function ensureRows<V>(t: Table<V>, scope: CalendarScope, keys: string[] | null, columns: string[],
  add: (index: Table<V>["index"], r: Record<string, unknown>) => void): Promise<void> {
  const need = t.groups.map((g, i) => (mayHold(g, scope, keys) ? i : -1)).filter((i) => i >= 0);
  const waits: Promise<void>[] = [];
  const todo = need.filter((i) => {
    const p = t.loaded.get(i);
    if (p) waits.push(p);
    return !p;
  });
  // Runs of consecutive row groups: one range request and one read each.
  const runs: number[][] = [];
  for (const i of todo) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else runs.push([i]);
  }
  for (const run of runs) {
    const first = t.groups[run[0]], last = t.groups[run[run.length - 1]];
    const file = t.open.file as AsyncBuffer & { prefetch?: (s: number, e: number) => void };
    // Prefetch only the column chunks this read decodes (the raw file's
    // frp_sum_mw is ~2/3 of each row group and never shown here), as one range
    // per stretch of near-adjacent chunks; hyparquet's own slices then hit them.
    if (file.prefetch && Number.isFinite(first.byteStart)) {
      const spans: Array<[number, number]> = [];
      for (const i of run) {
        for (const c of columns) {
          const r = t.groups[i].colBytes.get(c);
          if (!r) continue;
          const prev = spans[spans.length - 1];
          // Chunks sit a few bytes apart (page indexes); bridge gaps under 4 KB.
          if (prev && r[0] <= prev[1] + 4096) prev[1] = Math.max(prev[1], r[1]);
          else spans.push([r[0], r[1]]);
        }
      }
      for (const [s0, e0] of spans) file.prefetch(s0, e0);
    }
    const p = parquetReadObjects({
      file, metadata: t.open.metadata, compressors, columns,
      rowStart: first.rowStart, rowEnd: last.rowEnd,
    }).then((rows) => {
      for (const r of rows) add(t.index, r);
    });
    p.catch(() => run.forEach((i) => t.loaded.delete(i))); // retry on the next query
    for (const i of run) t.loaded.set(i, p);
    waits.push(p);
  }
  await Promise.all(waits);
}

function cellsOf<V>(index: Table<V>["index"], scope: CalendarScope, key: string): Map<V, number> {
  let byKey = index.get(scope);
  if (!byKey) index.set(scope, (byKey = new Map()));
  let cells = byKey.get(key);
  if (!cells) byKey.set(key, (cells = new Map()));
  return cells;
}

interface RawTable extends Table<string> {
  firstYear: number;
  lastYear: number;
  /** First year with any VIIRS row; the splice point of the naive record. */
  viirsFirstYear: number;
}

interface HarmonizedTable extends Table<number> {
  /** Inclusive month coverage of the harmonized record (ym units). */
  firstYm: number;
  lastYm: number;
}

let rawTable: Promise<RawTable> | null = null;
let harmonizedTable: Promise<HarmonizedTable> | null = null;

const RAW_COLUMNS = ["scope", "key", "year", "month", "sensor", "n_detections"];
const HARM_COLUMNS = ["scope", "key", "year", "month", "n_harmonized"];

const addRaw = (index: RawTable["index"], r: Record<string, unknown>) =>
  cellsOf(index, r.scope as CalendarScope, r.key as string).set(`${r.sensor}|${ym(num(r.year), num(r.month))}`, num(r.n_detections));
const addHarm = (index: HarmonizedTable["index"], r: Record<string, unknown>) =>
  cellsOf(index, r.scope as CalendarScope, r.key as string).set(ym(num(r.year), num(r.month)), num(r.n_harmonized));

/** Opens the raw calendar and reads its country rows (the only rows most views need). */
function loadRaw(): Promise<RawTable> {
  if (!rawTable) {
    rawTable = (async () => {
      const t = await openTable<string>("raw");
      await ensureRows(t, "country", null, RAW_COLUMNS, addRaw);
      let firstYear = Infinity, lastYear = -Infinity, viirsFirstYear = Infinity;
      for (const cells of t.index.get("country")?.values() ?? []) {
        for (const cell of cells.keys()) {
          const [sensor, t0] = cell.split("|");
          const year = Math.floor(Number(t0) / 12);
          if (year < firstYear) firstYear = year;
          if (year > lastYear) lastYear = year;
          if (sensor === "VIIRS" && year < viirsFirstYear) viirsFirstYear = year;
        }
      }
      if (!Number.isFinite(firstYear)) throw new Error(`${t.name} is empty`);
      return Object.assign(t, { firstYear, lastYear, viirsFirstYear });
    })();
    rawTable.catch(() => {
      rawTable = null;
    });
  }
  return rawTable;
}

function loadHarmonized(): Promise<HarmonizedTable> {
  if (!harmonizedTable) {
    harmonizedTable = (async () => {
      const t = await openTable<number>("harmonized");
      await ensureRows(t, "country", null, HARM_COLUMNS, addHarm);
      let firstYm = Infinity, lastYm = -Infinity;
      for (const cells of t.index.get("country")?.values() ?? []) {
        for (const m of cells.keys()) {
          if (m < firstYm) firstYm = m;
          if (m > lastYm) lastYm = m;
        }
      }
      if (!Number.isFinite(firstYm)) throw new Error(`${t.name} is empty`);
      return Object.assign(t, { firstYm, lastYm });
    })();
    harmonizedTable.catch(() => {
      harmonizedTable = null;
    });
  }
  return harmonizedTable;
}

/** Which file set the calendars came from ("world", or the four-country fallback). */
export async function calendarDataset(): Promise<DataSet> {
  return (await loadRaw()).dataset;
}

/** Country keys (FIRMS spellings, underscores) with a raw calendar, sorted. Includes countries too sparse to fit. */
export async function listCountries(): Promise<string[]> {
  const raw = await loadRaw();
  return [...(raw.index.get("country")?.keys() ?? [])].sort();
}

/** Country keys with a harmonized (fitted) calendar, sorted. */
export async function listHarmonizedCountries(): Promise<string[]> {
  const harm = await loadHarmonized();
  return [...(harm.index.get("country")?.keys() ?? [])].sort();
}

/**
 * H3 res-2 parent cells with a calendar, sorted. A parent not in this list
 * has not been processed -- that is "no data", not "no fires". Reads every
 * H3 row group of the raw calendar (~3.5 MB for the world file), so only call
 * it when the whole list is really needed.
 */
export async function listParentCells(): Promise<string[]> {
  const raw = await loadRaw();
  await ensureRows(raw, "h3_parent", null, RAW_COLUMNS, addRaw);
  return [...(raw.index.get("h3_parent")?.keys() ?? [])].sort();
}

export interface CalendarQuery {
  scope: CalendarScope;
  keys: string[];
  mode: Series;
}

const RAW_UNIT =
  "detections (MODIS Terra+Aqua before the VIIRS start year, Suomi-NPP VIIRS from it) — raw, uncorrected";

/**
 * Monthly calendar summed across `keys`.
 *
 * raw        -- what a naive user sees: MODIS counts before VIIRS exists,
 *               VIIRS counts after. The splice is the fake step change.
 * harmonized -- n_harmonized for every month in the harmonized record's
 *               coverage; observed Aqua before the splice, Aqua-equivalent
 *               predicted from VIIRS after.
 *
 * Returns a full year x month grid. `value: null` (and an entry in
 * `missing`) means no data for that month, which the UI must show
 * differently from 0. The harmonized table only stores non-zero months, so
 * inside its coverage a key it holds contributes 0 for a month with no row.
 * A key with a raw calendar but no harmonized one (a country too sparse to
 * fit, or a cell with none of the detections the fit uses) is listed in
 * `uncorrectedKeys` and contributes nothing to the harmonized series: it is
 * never counted as zero and never passed off as corrected.
 */
export async function getCalendar(query: CalendarQuery): Promise<CalendarResult> {
  const { scope, mode } = query;
  const requested = [...new Set(query.keys)];
  // Both tables load in parallel.
  const [raw, harm] = await Promise.all([loadRaw(), mode === "harmonized" ? loadHarmonized() : null]);
  if (scope !== "country") {
    await Promise.all([
      ensureRows(raw, scope, requested, RAW_COLUMNS, addRaw),
      harm ? ensureRows(harm, scope, requested, HARM_COLUMNS, addHarm) : null,
    ]);
  }

  const rawKeys = raw.index.get(scope) ?? new Map<string, Map<string, number>>();
  const harmKeys = harm?.index.get(scope);
  const inRaw = requested.filter((k) => rawKeys.has(k));
  const known = mode === "raw" ? inRaw : requested.filter((k) => harmKeys?.has(k));
  const uncorrectedKeys = mode === "raw" ? [] : inRaw.filter((k) => !harmKeys?.has(k));
  // Sets, not Array.includes: a continental box asks for thousands of cells.
  const knownSet = new Set(known), uncorrectedSet = new Set(uncorrectedKeys);
  const unknownKeys = requested.filter((k) => !knownSet.has(k) && !uncorrectedSet.has(k));

  const rows: CalendarRow[] = [];
  const missing: Array<{ year: number; month: number }> = [];

  for (let year = raw.firstYear; year <= raw.lastYear; year += 1) {
    const viirsEra = year >= raw.viirsFirstYear;
    for (let month = 1; month <= 12; month += 1) {
      const t = ym(year, month);
      let value: number | null = null;
      let basis: CalendarBasis;

      if (mode === "raw") {
        const sensor: Sensor = viirsEra ? "VIIRS" : "MODIS";
        basis = sensor;
        const cellKey = `${sensor}|${t}`;
        for (const key of known) {
          const v = rawKeys.get(key)?.get(cellKey);
          if (v !== undefined) value = (value ?? 0) + v;
        }
      } else {
        basis = viirsEra ? "predicted_from_viirs" : "observed_aqua";
        if (harm && known.length > 0 && t >= harm.firstYm && t <= harm.lastYm) {
          value = 0;
          for (const key of known) value += harmKeys?.get(key)?.get(t) ?? 0;
        }
      }

      rows.push({ year, month, value, basis });
      if (value === null) missing.push({ year, month });
    }
  }

  const unit = mode === "raw" ? RAW_UNIT : (await getParams()).unit;

  return {
    scope,
    mode,
    unit,
    keys: known,
    unknownKeys,
    uncorrectedKeys,
    years: [raw.firstYear, raw.lastYear],
    rows,
    missing,
    dataset: raw.dataset,
  };
}

/* ------------------------------------------------------------------ */
/* cell_day.parquet                                                    */
/* ------------------------------------------------------------------ */

const CELL_DAY = "cell_day.parquet";

/** Dates as YYYY-MM-DD strings rather than Date objects (UTC days). */
const dateParsers = {
  dateFromDays: (days: number) => new Date(days * 86_400_000).toISOString().slice(0, 10),
};

let cellDayParentsPromise: Promise<string[]> | null = null;

/** H3 res-2 parents that have cell-day (point-level) data. Demo AOIs only. */
export function listCellDayParents(): Promise<string[]> {
  if (!cellDayParentsPromise) {
    cellDayParentsPromise = (async () => {
      const { file, metadata } = await openParquet(CELL_DAY);
      const rows = await parquetReadObjects({
        file,
        metadata,
        compressors,
        columns: ["h3_parent"],
      });
      return [...new Set(rows.map((r) => r.h3_parent as string))].sort();
    })();
    cellDayParentsPromise.catch(() => {
      cellDayParentsPromise = null;
    });
  }
  return cellDayParentsPromise;
}

export interface CellDayQuery {
  /** H3 res-2 parent cells. The only column the file is filtered on. */
  parents: string[];
  /** Inclusive UTC date bounds, YYYY-MM-DD. Applied in memory. */
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Cell-day rows for the given parents. The `$in` filter on h3_parent lets
 * hyparquet skip every row group whose parent min/max excludes them, so
 * only the matching byte ranges are fetched.
 */
export async function getCellDay(query: CellDayQuery): Promise<CellDayRow[]> {
  const parents = [...new Set(query.parents)];
  if (parents.length === 0) return [];
  const { file, metadata } = await openParquet(CELL_DAY);
  const rows = await parquetReadObjects({
    file,
    metadata,
    compressors,
    parsers: dateParsers,
    filter: { h3_parent: { $in: parents } },
  });

  const { dateFrom, dateTo } = query;
  const out: CellDayRow[] = [];
  for (const r of rows) {
    const date = r.acq_date as string;
    if (dateFrom && date < dateFrom) continue;
    if (dateTo && date > dateTo) continue;
    out.push({
      h3: r.h3,
      h3_parent: r.h3_parent,
      acq_date: date,
      year: num(r.year),
      month: num(r.month),
      doy: num(r.doy),
      sensor: r.sensor as Sensor,
      platform: r.platform,
      n_detections: num(r.n_detections),
      frp_sum_mw: num(r.frp_sum_mw),
      frp_mean_mw: num(r.frp_mean_mw),
      frp_max_mw: num(r.frp_max_mw),
      mean_pixel_area_km2: num(r.mean_pixel_area_km2),
      mean_lst_hours: num(r.mean_lst_hours),
    });
  }
  return out;
}

export interface RowGroupInfo {
  rows: number;
  parentMin: string | null;
  parentMax: string | null;
}

/** Row-group layout of cell_day.parquet (from the cached footer). */
export async function cellDayRowGroups(): Promise<RowGroupInfo[]> {
  const { metadata } = await openParquet(CELL_DAY);
  const col = metadata.row_groups[0]?.columns.findIndex(
    (c) => c.meta_data?.path_in_schema.join(".") === "h3_parent",
  );
  return metadata.row_groups.map((rg) => {
    const stats = col !== undefined && col >= 0 ? rg.columns[col].meta_data?.statistics : undefined;
    const min = stats?.min_value ?? stats?.min;
    const max = stats?.max_value ?? stats?.max;
    return {
      rows: Number(rg.num_rows),
      parentMin: typeof min === "string" ? min : null,
      parentMax: typeof max === "string" ? max : null,
    };
  });
}
