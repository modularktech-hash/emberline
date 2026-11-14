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
 * - The two calendar tables are small (< 0.5 MB each) and are read whole,
 *   once, then held in module scope.
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

interface OpenFile {
  file: AsyncBuffer;
  metadata: FileMetaData;
}

const files = new Map<string, Promise<OpenFile>>();

/** Open a parquet file once: one HEAD for its size, one range read for its footer. */
function openParquet(name: string): Promise<OpenFile> {
  let entry = files.get(name);
  if (!entry) {
    entry = (async () => {
      const remote = await asyncBufferFromUrl({ url: `${dataBaseUrl}/${name}` });
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
/* params.json                                                         */
/* ------------------------------------------------------------------ */

let paramsPromise: Promise<Params> | null = null;

/** The published fit. Throws if the file is missing or not JSON. */
export function getParams(): Promise<Params> {
  if (!paramsPromise) {
    paramsPromise = (async () => {
      const response = await fetch(`${dataBaseUrl}/params.json`);
      if (!response.ok) {
        throw new Error(`params.json: HTTP ${response.status}`);
      }
      return (await response.json()) as Params;
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

interface RawTable {
  /** scope -> key -> "sensor|ym" -> n_detections */
  index: Map<CalendarScope, Map<string, Map<string, number>>>;
  firstYear: number;
  lastYear: number;
  /** First year with any VIIRS row; the splice point of the naive record. */
  viirsFirstYear: number;
}

interface HarmonizedTable {
  /** scope -> key -> ym -> n_harmonized */
  index: Map<CalendarScope, Map<string, Map<number, number>>>;
  /** Inclusive month coverage of the harmonized record (ym units). */
  firstYm: number;
  lastYm: number;
}

let rawTable: Promise<RawTable> | null = null;
let harmonizedTable: Promise<HarmonizedTable> | null = null;

function loadRaw(): Promise<RawTable> {
  if (!rawTable) {
    rawTable = (async () => {
      const { file, metadata } = await openParquet("calendar_raw.parquet");
      const rows = await parquetReadObjects({
        file,
        metadata,
        compressors,
        columns: ["scope", "key", "year", "month", "sensor", "n_detections"],
      });
      const index: RawTable["index"] = new Map();
      let firstYear = Infinity;
      let lastYear = -Infinity;
      let viirsFirstYear = Infinity;
      for (const r of rows) {
        const scope = r.scope as CalendarScope;
        const year = num(r.year);
        const month = num(r.month);
        let byKey = index.get(scope);
        if (!byKey) index.set(scope, (byKey = new Map()));
        let cells = byKey.get(r.key);
        if (!cells) byKey.set(r.key, (cells = new Map()));
        cells.set(`${r.sensor}|${ym(year, month)}`, num(r.n_detections));
        if (year < firstYear) firstYear = year;
        if (year > lastYear) lastYear = year;
        if (r.sensor === "VIIRS" && year < viirsFirstYear) viirsFirstYear = year;
      }
      if (!Number.isFinite(firstYear)) throw new Error("calendar_raw.parquet is empty");
      return { index, firstYear, lastYear, viirsFirstYear };
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
      const { file, metadata } = await openParquet("calendar_harmonized.parquet");
      const rows = await parquetReadObjects({
        file,
        metadata,
        compressors,
        columns: ["scope", "key", "year", "month", "n_harmonized"],
      });
      const index: HarmonizedTable["index"] = new Map();
      let firstYm = Infinity;
      let lastYm = -Infinity;
      for (const r of rows) {
        const scope = r.scope as CalendarScope;
        const t = ym(num(r.year), num(r.month));
        let byKey = index.get(scope);
        if (!byKey) index.set(scope, (byKey = new Map()));
        let cells = byKey.get(r.key);
        if (!cells) byKey.set(r.key, (cells = new Map()));
        cells.set(t, num(r.n_harmonized));
        if (t < firstYm) firstYm = t;
        if (t > lastYm) lastYm = t;
      }
      if (!Number.isFinite(firstYm)) throw new Error("calendar_harmonized.parquet is empty");
      return { index, firstYm, lastYm };
    })();
    harmonizedTable.catch(() => {
      harmonizedTable = null;
    });
  }
  return harmonizedTable;
}

/** Country names with a calendar, sorted. */
export async function listCountries(): Promise<string[]> {
  const raw = await loadRaw();
  return [...(raw.index.get("country")?.keys() ?? [])].sort();
}

/**
 * H3 res-2 parent cells with a calendar, sorted. A parent not in this list
 * has not been processed -- that is "no data", not "no fires".
 */
export async function listParentCells(): Promise<string[]> {
  const raw = await loadRaw();
  return [...(raw.index.get("h3_parent")?.keys() ?? [])].sort();
}

export interface CalendarQuery {
  scope: CalendarScope;
  keys: string[];
  mode: Series;
}

const RAW_UNIT =
  "detections (MODIS Terra+Aqua before the VIIRS start year, Suomi-NPP VIIRS from it)";

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
 * inside its coverage a processed key with no row contributes 0.
 */
export async function getCalendar(query: CalendarQuery): Promise<CalendarResult> {
  const { scope, mode } = query;
  const requested = [...new Set(query.keys)];
  const raw = await loadRaw();
  const harm = mode === "harmonized" ? await loadHarmonized() : null;

  const rawKeys = raw.index.get(scope) ?? new Map<string, Map<string, number>>();
  const harmKeys = harm?.index.get(scope);
  const known = requested.filter((k) => rawKeys.has(k) || harmKeys?.has(k));
  const unknownKeys = requested.filter((k) => !known.includes(k));

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
    years: [raw.firstYear, raw.lastYear],
    rows,
    missing,
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
