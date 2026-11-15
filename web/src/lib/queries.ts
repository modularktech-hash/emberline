import type { AsyncBuffer, FileMetaData } from "hyparquet";
// Type-only imports, relative, so this module also runs under plain Node
// (web/scripts/verify-queries.ts) without the "@/" path alias.
import type {
  CalendarBasis,
  CalendarResult,
  CalendarRow,
  CalendarScope,
  CellDayRow,
  CoverageStatusFile,
  Params,
  ParamsFull,
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
 *
 * Slices. web/scripts/build-slices.mjs cuts the published files into small
 * JSON files under data/slices/ (one country's calendar, the fit without its
 * Method-only fields, ...). They hold the same values as their sources. The
 * country views read those (a few KB) and never open a Parquet file; drawn
 * areas still read the world Parquet files by range. If a slice cannot be
 * loaded the reader falls back to the source file.
 *
 * hyparquet (and its decompressors, ~100 KB of JS) is imported on first use,
 * so pages that only read JSON never download it.
 */

/** hyparquet + decompressors, loaded once, on the first Parquet read. */
let parquetLib: Promise<{ hp: typeof import("hyparquet"); compressors: typeof import("hyparquet-compressors").compressors }> | null = null;
function parquet() {
  if (!parquetLib) {
    parquetLib = Promise.all([import("hyparquet"), import("hyparquet-compressors")]).then(([hp, c]) => ({ hp, compressors: c.compressors }));
    parquetLib.catch(() => { parquetLib = null; });
  }
  return parquetLib;
}

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
  rawOpen = null;
  harmOpen = null;
  rawTable = null;
  harmonizedTable = null;
  paramsPromise = null;
  paramsFullPromise = null;
  calIndexPromise = null;
  countrySlices.clear();
  coveragePromise = null;
  cellDayParentsPromise = null;
}

/**
 * One version tag for everything under /data, set at build time by
 * next.config.ts from a hash of the data directory. Requests carry it as
 * `?v=`, and those responses are served as immutable (next.config.ts), so a
 * returning visitor re-downloads nothing until the data actually changes.
 * Unset under plain Node (scripts), where URLs stay bare.
 */
const DATA_V = process.env.NEXT_PUBLIC_DATA_V ?? "";

/** URL of a file under the data directory (e.g. "live.json", "slices/calendar/Chile.json"). */
export function dataUrl(name: string): string {
  return `${dataBaseUrl}/${name}${DATA_V ? `?v=${DATA_V}` : ""}`;
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
 * (components/DataPreload.tsx) or by prefetchData(), if any. Each is consumed once.
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
      const url = dataUrl(name);
      const { hp: { asyncBufferFromUrl, cachedAsyncBuffer, parquetMetadataAsync } } = await parquet();
      if (WHOLE_FILES.has(name)) {
        const file = await fetch(url).then((r) => {
          if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
          return r.arrayBuffer();
        });
        return { file, metadata: await parquetMetadataAsync(file) };
      }
      if (name.includes("_global")) {
        const tail = await fetchTail(url);
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

/* ------------------------------------------------------------------ */
/* JSON files and early requests                                       */
/* ------------------------------------------------------------------ */

async function fetchJson<T>(name: string): Promise<T> {
  const url = dataUrl(name);
  const early = takePrefetched<T>(url);
  if (early) {
    try { return await early; } catch { /* the early request failed: fetch again below */ }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** Fetch one JSON file under the data directory (uncached here; lib/data.ts keeps its own cache). */
export function loadJson<T>(name: string): Promise<T> {
  return fetchJson<T>(name);
}

/** The slice files a country view reads first: the calendar index, the fit, and each country's calendar. */
function countryViewFiles(countries: string[]): string[] {
  return ["slices/calendar_index.json", "slices/params_core.json", ...countries.map((c) => `slices/calendar/${c}.json`)];
}

/**
 * URLs the inline script in components/DataPreload.tsx fetches on a real page
 * load, in parallel with the JS bundle: the small JSON slices a country view
 * needs (a few KB each, plus the ~58 KB fit). `extra` names further files.
 */
export function dataPreloads(countries: string[], extra: string[] = []): string[] {
  return [...countryViewFiles(countries), ...extra].map(dataUrl);
}

/**
 * Start downloading data files now (e.g. when a nav link is hovered), so the
 * page that needs them finds them already in flight. Each file is requested at
 * most once per page load; the loaders pick the responses up by URL.
 */
const prefetched = new Set<string>();
export function prefetchData(names: string[]): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __emberlinePrefetch?: Record<string, Promise<unknown>> };
  const store = (w.__emberlinePrefetch ??= {});
  for (const name of names) {
    const url = dataUrl(name);
    if (prefetched.has(url) || url in store) continue;
    prefetched.add(url);
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => { delete store[url]; prefetched.delete(url); });
    store[url] = p;
  }
}

/** Warm the files a country view of `countries` needs (hover on a nav link, picker open). */
export function prefetchCountryView(countries: string[]): void {
  if (paramsPromise && calIndexPromise) prefetchData(countries.filter((c) => !countrySlices.has(c)).map((c) => `slices/calendar/${c}.json`));
  else prefetchData(countryViewFiles(countries.filter((c) => !countrySlices.has(c))));
}

/* ------------------------------------------------------------------ */
/* params.json                                                         */
/* ------------------------------------------------------------------ */

let paramsPromise: Promise<Params> | null = null;
let paramsFullPromise: Promise<ParamsFull> | null = null;

/**
 * The published fit with every field: params_global.json (every fitted
 * country), or params.json (four countries) if the world file cannot be
 * loaded. `dataset` records which one it is. Only the Method page's drift
 * table needs this; everything else reads getParams().
 */
export function getParamsFull(): Promise<ParamsFull> {
  if (!paramsFullPromise) {
    paramsFullPromise = (async () => {
      let lastError: unknown;
      for (const name of FILESETS.params) {
        try {
          const p = await fetchJson<ParamsFull>(name);
          return { ...p, failed: p.failed ?? {}, dataset: setOf(name) };
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("params: not available");
    })();
    paramsFullPromise.catch(() => {
      paramsFullPromise = null;
    });
  }
  return paramsFullPromise;
}

/**
 * The published fit as the pages use it: slices/params_core.json, which is
 * params_global.json minus three per-country fields only the Method page
 * reads (same values otherwise, ~58 KB instead of ~141 KB compressed). Falls
 * back to the full file. If the full file is already loaded it is returned.
 */
export function getParams(): Promise<Params> {
  if (paramsFullPromise) return paramsFullPromise.catch(() => { paramsPromise = null; return getParams(); });
  if (!paramsPromise) {
    paramsPromise = fetchJson<Params>("slices/params_core.json")
      .then((p): Params => ({ ...p, failed: p.failed ?? {}, dataset: "world" }))
      .catch(() => getParamsFull());
    paramsPromise.catch(() => {
      paramsPromise = null;
    });
  }
  return paramsPromise;
}

/* ------------------------------------------------------------------ */
/* coverage_status.json                                                */
/* ------------------------------------------------------------------ */

let coveragePromise: Promise<CoverageStatusFile> | null = null;

/**
 * Reason-coded coverage for every FIRMS country (world fit only): own fit,
 * borrowed fit, or the data-sufficiency reason it has no fit, with counts.
 * There is no four-country fallback; callers treat a rejection as "reasons
 * not available" and keep their generic wording.
 */
export function getCoverageStatus(): Promise<CoverageStatusFile> {
  if (!coveragePromise) {
    coveragePromise = fetchJson<CoverageStatusFile>("coverage_status.json");
    coveragePromise.catch(() => {
      coveragePromise = null;
    });
  }
  return coveragePromise;
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

async function openTableNow<V>(kind: "raw" | "harmonized"): Promise<Table<V>> {
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
    const p = parquet().then(({ hp, compressors }) => hp.parquetReadObjects({
      file, metadata: t.open.metadata, compressors, columns,
      rowStart: first.rowStart, rowEnd: last.rowEnd,
    })).then((rows) => {
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
/** The opened files (footer read, no rows yet), shared by the country and drawn-area paths. */
let rawOpen: Promise<Table<string>> | null = null;
let harmOpen: Promise<Table<number>> | null = null;

function openRaw(): Promise<Table<string>> {
  if (!rawOpen) {
    rawOpen = openTableNow<string>("raw");
    rawOpen.catch(() => { rawOpen = null; });
  }
  return rawOpen;
}
function openHarmonized(): Promise<Table<number>> {
  if (!harmOpen) {
    harmOpen = openTableNow<number>("harmonized");
    harmOpen.catch(() => { harmOpen = null; });
  }
  return harmOpen;
}

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
      const t = await openRaw();
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
      const t = await openHarmonized();
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

/* ------------------------------------------------------------------ */
/* Country calendar slices                                             */
/* ------------------------------------------------------------------ */

/** slices/calendar_index.json: what the world calendars hold, without opening them. */
interface CalIndex {
  countries: string[];
  harmonized: string[];
  first_year: number;
  last_year: number;
  viirs_first_year: number;
  first_ym: number;
  last_ym: number;
}
/** slices/calendar/<Country>.json: flat [ym, value, ym, value, ...] lists per sensor (raw) and for the harmonized series. */
interface CountrySliceFile { r: Record<string, number[]>; h: number[] | null }
interface CountrySlice { raw: Map<string, number>; harm: Map<number, number> | null }

let calIndexPromise: Promise<CalIndex | null> | null = null;
const countrySlices = new Map<string, Promise<CountrySlice>>();

/** The calendar index, or null when the slices are not available (then every reader uses the Parquet files). */
function calIndex(): Promise<CalIndex | null> {
  if (!calIndexPromise) {
    calIndexPromise = fetchJson<CalIndex>("slices/calendar_index.json")
      .then((i) => (Array.isArray(i.countries) && Array.isArray(i.harmonized) && Number.isFinite(i.first_year) ? i : null))
      .catch(() => null);
  }
  return calIndexPromise;
}

function countrySlice(key: string): Promise<CountrySlice> {
  let p = countrySlices.get(key);
  if (!p) {
    p = fetchJson<CountrySliceFile>(`slices/calendar/${encodeURIComponent(key)}.json`).then((f) => {
      const raw = new Map<string, number>();
      for (const [sensor, list] of Object.entries(f.r)) for (let i = 0; i < list.length; i += 2) raw.set(`${sensor}|${list[i]}`, list[i + 1]);
      let harm: Map<number, number> | null = null;
      if (f.h) {
        harm = new Map();
        for (let i = 0; i < f.h.length; i += 2) harm.set(f.h[i], f.h[i + 1]);
      }
      return { raw, harm };
    });
    p.catch(() => countrySlices.delete(key));
    countrySlices.set(key, p);
  }
  return p;
}

/** Which file set the calendars came from ("world", or the four-country fallback). */
export async function calendarDataset(): Promise<DataSet> {
  return (await calIndex()) ? "world" : (await loadRaw()).dataset;
}

/** Country keys (FIRMS spellings, underscores) with a raw calendar, sorted. Includes countries without a fit. */
export async function listCountries(): Promise<string[]> {
  const idx = await calIndex();
  if (idx) return [...idx.countries].sort();
  const raw = await loadRaw();
  return [...(raw.index.get("country")?.keys() ?? [])].sort();
}

/** Country keys with a harmonized (fitted) calendar, sorted. */
export async function listHarmonizedCountries(): Promise<string[]> {
  const idx = await calIndex();
  if (idx) return [...idx.harmonized].sort();
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
  const raw = await openRaw();
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

/** Everything getCalendar needs, whichever files it came from. */
interface CalendarSource {
  rawKeys: Map<string, Map<string, number>>;
  /** undefined in raw mode (the harmonized series is not read). */
  harmKeys: Map<string, Map<number, number>> | undefined;
  firstYear: number;
  lastYear: number;
  viirsFirstYear: number;
  /** Inclusive month coverage of the harmonized record; null in raw mode. */
  harmYm: [number, number] | null;
  dataset: DataSet;
}

/** Country rows from the slices: one small file per requested country. Null when the slices are unavailable. */
async function sourceFromSlices(requested: string[], mode: Series): Promise<CalendarSource | null> {
  const idx = await calIndex();
  if (!idx) return null;
  const inRaw = new Set(idx.countries), inHarm = new Set(idx.harmonized);
  const want = requested.filter((k) => inRaw.has(k) || inHarm.has(k));
  const slices = await Promise.all(want.map(countrySlice));
  const rawKeys = new Map<string, Map<string, number>>();
  const harmKeys = new Map<string, Map<number, number>>();
  want.forEach((k, i) => {
    if (inRaw.has(k)) rawKeys.set(k, slices[i].raw);
    const h = slices[i].harm;
    if (inHarm.has(k) && h) harmKeys.set(k, h);
  });
  return {
    rawKeys, harmKeys: mode === "harmonized" ? harmKeys : undefined,
    firstYear: idx.first_year, lastYear: idx.last_year, viirsFirstYear: idx.viirs_first_year,
    harmYm: mode === "harmonized" ? [idx.first_ym, idx.last_ym] : null, dataset: "world",
  };
}

/** Rows read from the Parquet calendars: drawn areas (H3 parents), and countries when the slices are unavailable. */
async function sourceFromParquet(scope: CalendarScope, requested: string[], mode: Series): Promise<CalendarSource> {
  // The year coverage comes from the slice index when there is one, so a drawn
  // area reads only its own H3 row groups; otherwise from the country rows.
  const idx = scope === "country" ? null : await calIndex();
  if (idx) {
    const [raw, harm] = await Promise.all([openRaw(), mode === "harmonized" ? openHarmonized() : null]);
    if (raw.dataset === "world" && (!harm || harm.dataset === "world")) {
      await Promise.all([
        ensureRows(raw, scope, requested, RAW_COLUMNS, addRaw),
        harm ? ensureRows(harm, scope, requested, HARM_COLUMNS, addHarm) : null,
      ]);
      return {
        rawKeys: raw.index.get(scope) ?? new Map(), harmKeys: harm ? harm.index.get(scope) ?? new Map() : undefined,
        firstYear: idx.first_year, lastYear: idx.last_year, viirsFirstYear: idx.viirs_first_year,
        harmYm: harm ? [idx.first_ym, idx.last_ym] : null, dataset: "world",
      };
    }
  }
  // Both tables load in parallel.
  const [raw, harm] = await Promise.all([loadRaw(), mode === "harmonized" ? loadHarmonized() : null]);
  if (scope !== "country") {
    await Promise.all([
      ensureRows(raw, scope, requested, RAW_COLUMNS, addRaw),
      harm ? ensureRows(harm, scope, requested, HARM_COLUMNS, addHarm) : null,
    ]);
  }
  return {
    rawKeys: raw.index.get(scope) ?? new Map(), harmKeys: harm ? harm.index.get(scope) ?? new Map() : undefined,
    firstYear: raw.firstYear, lastYear: raw.lastYear, viirsFirstYear: raw.viirsFirstYear,
    harmYm: harm ? [harm.firstYm, harm.lastYm] : null, dataset: raw.dataset,
  };
}

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
 *
 * Countries are read from their slice files (same rows as the world Parquet
 * calendars, a few KB each); drawn areas, and countries if the slices cannot
 * be loaded, from the Parquet files.
 */
export async function getCalendar(query: CalendarQuery): Promise<CalendarResult> {
  const { scope, mode } = query;
  const requested = [...new Set(query.keys)];
  const src =
    (scope === "country" ? await sourceFromSlices(requested, mode).catch(() => null) : null) ??
    (await sourceFromParquet(scope, requested, mode));

  const { rawKeys, harmKeys } = src;
  const inRaw = requested.filter((k) => rawKeys.has(k));
  const known = mode === "raw" ? inRaw : requested.filter((k) => harmKeys?.has(k));
  const uncorrectedKeys = mode === "raw" ? [] : inRaw.filter((k) => !harmKeys?.has(k));
  // Sets, not Array.includes: a continental box asks for thousands of cells.
  const knownSet = new Set(known), uncorrectedSet = new Set(uncorrectedKeys);
  const unknownKeys = requested.filter((k) => !knownSet.has(k) && !uncorrectedSet.has(k));

  const rows: CalendarRow[] = [];
  const missing: Array<{ year: number; month: number }> = [];

  for (let year = src.firstYear; year <= src.lastYear; year += 1) {
    const viirsEra = year >= src.viirsFirstYear;
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
        if (src.harmYm && known.length > 0 && t >= src.harmYm[0] && t <= src.harmYm[1]) {
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
    years: [src.firstYear, src.lastYear],
    rows,
    missing,
    dataset: src.dataset,
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
      const { hp, compressors } = await parquet();
      const rows = await hp.parquetReadObjects({
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
  const { hp, compressors } = await parquet();
  const rows = await hp.parquetReadObjects({
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
