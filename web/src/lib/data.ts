/**
 * Loaders for the JSON tables in web/public/data/. Each file is fetched once
 * per session. Parquet stays behind queries.ts; these are small summaries.
 */

export interface LiveWindow {
  totals: Record<string, number>;
  dates: string[];
  columns: string[];
  /** [lat, lon, detections, frp_sum_mw, frp_max_mw, satellites] */
  cells: Array<[number, number, number, number, number, string]>;
}
export interface Live { fetched_utc: string; cell_deg: number; windows: Record<"24h" | "7d", LiveWindow> }

export interface Tle { name: string; norad: number; instrument: string; overpass: string; epoch: string; line1: string; line2: string }
export interface TleFile { source: string; fetched: string; satellites: Tle[] }

export interface SeasonYear {
  year: number;
  raw_onset?: number | null; raw_peak?: number | null; raw_end?: number | null; raw_length?: number | null; raw_total?: number;
  harm_onset?: number | null; harm_peak?: number | null; harm_end?: number | null; harm_length?: number | null; harm_total?: number;
}
export interface SeasonCountry { fire_year_start_month: number; years: SeasonYear[]; trend_days_per_decade: Record<string, number | null> }
export interface SeasonFile { fit_version: string; unit: string; countries: Record<string, SeasonCountry> }

export interface DriftRow { platform: string; year: number; lst: number; n: number }
export interface DriftFile { fit_version: string; countries: Record<string, DriftRow[]> }

export interface CountryRow {
  country: string; detections_filtered: number; raw_2025: number; harm_2025: number; harm_mean_2003_2025: number;
  peak_year: number | null; step_raw: number; step_aqua: number; step_harm: number; r2_model: number; r2_raw: number;
  bias_pct: number; frp_p50: number; fit_source: string; onset_trend_raw: number | null; onset_trend_harm: number | null;
  annual: Array<{ year: number; raw: number; harm: number }>;
}
export interface CountriesFile { fit_version: string; unit: string; countries: CountryRow[] }

const cache = new Map<string, Promise<unknown>>();
function load<T>(name: string): Promise<T> {
  let p = cache.get(name) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`/data/${name}`).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}

export const getLive = () => load<Live>("live.json");
export const getTle = () => load<TleFile>("tle.json");
export const getSeason = () => load<SeasonFile>("season.json");
export const getDrift = () => load<DriftFile>("drift.json");
export const getCountryTable = () => load<CountriesFile>("countries.json");

/** Fire-year day (1 = first day of the quietest month) to a short date label. */
export function fireDayLabel(day: number | null | undefined, startMonth: number): string {
  if (day == null) return "—";
  const d = new Date(Date.UTC(2001, startMonth - 1, 1) + (day - 1) * 86_400_000);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Hours (e.g. 13.75) to "13:45". */
export function clock(h: number): string {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
