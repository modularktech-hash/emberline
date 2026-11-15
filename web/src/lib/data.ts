/**
 * Loaders for the JSON tables in web/public/data/. Each file is fetched once
 * per session. Parquet stays behind queries.ts; these are small summaries.
 * Every request goes through queries.loadJson (versioned URL, early-request pickup).
 */
import { loadJson } from "./queries";

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
export interface SeasonCountry {
  fire_year_start_month: number;
  /** "daily": from point detections. "monthly": estimated from the monthly calendars (see resolution_note). */
  resolution?: "daily" | "monthly";
  years: SeasonYear[];
  trend_days_per_decade: Record<string, number | null>;
}
export interface SeasonFile {
  fit_version: string; unit: string; resolution_note?: string;
  monthly_vs_daily?: { countries: number; trend_abs_diff_median: number | null; trend_abs_diff_max: number | null; definition: string };
  countries: Record<string, SeasonCountry>;
}

export interface DriftRow { platform: string; year: number; lst: number; n: number }
export interface DriftFile { fit_version: string; countries: Record<string, DriftRow[]> }

export interface CountryRow {
  country: string; detections_filtered: number; raw_2025: number; harm_2025: number; harm_mean_2003_2025: number;
  peak_year: number | null; step_raw: number; step_aqua: number; step_harm: number; r2_model: number; r2_raw: number;
  bias_pct: number; frp_p50: number; fit_source: string; onset_trend_raw: number | null; onset_trend_harm: number | null;
  season_resolution?: "daily" | "monthly";
  annual: Array<{ year: number; raw: number; harm: number }>;
}
export interface NotFittedRow { country: string; detections_filtered: number; has_raw_calendar: boolean }
export interface CountriesFile {
  fit_version: string; unit: string; train_years?: [number, number]; test_years?: [number, number]; pooled_rule?: string;
  countries: CountryRow[];
  /** Countries the fit could not be run for (too sparse): raw record only. */
  not_fitted?: NotFittedRow[];
}

const cache = new Map<string, Promise<unknown>>();
function load<T>(name: string): Promise<T> {
  let p = cache.get(name) as Promise<T> | undefined;
  if (!p) {
    p = loadJson<T>(name);
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}
/** A slice (web/scripts/build-slices.mjs), or what `fallback` derives from the source file if the slice cannot be loaded. */
function slice<T>(name: string, fallback: () => Promise<T>): Promise<T> {
  return load<T>(`slices/${name}`).catch(fallback);
}

export const getLive = () => load<Live>("live.json");
export const getTle = () => load<TleFile>("tle.json");
export const getSeason = () => load<SeasonFile>("season.json");
export const getDrift = () => load<DriftFile>("drift.json");
export const getCountryTable = () => load<CountriesFile>("countries.json");

/** live.json without the per-cell lists (totals, dates, fetch time): a few hundred bytes. */
export type LiveSummary = Omit<Live, "windows"> & { windows: Record<"24h" | "7d", Omit<LiveWindow, "cells">> };
export const getLiveSummary = () => slice<LiveSummary>("live_summary.json", getLive);
/** season.json with Chile only (the country the home page quotes). */
export const getSeasonHome = () => slice<SeasonFile>("season_home.json", getSeason);
/** season.json without the per-year rows: every country's trends, resolution and fire-year start. */
export type SeasonTrendsFile = Omit<SeasonFile, "countries"> & { countries: Record<string, Omit<SeasonCountry, "years">> };
export const getSeasonTrends = () => slice<SeasonTrendsFile>("season_trends.json", getSeason);
/** One country's entry of season.json (its per-year rows included). */
export const getSeasonCountry = (country: string) =>
  slice<SeasonCountry | undefined>(`season/${encodeURIComponent(country)}.json`, () => getSeason().then((s) => s.countries[country]));

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

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * Axis ticks for a fire year that starts on day 1 of `startMonth`: one tick per
 * real month boundary (day of the fire year, 1-based), in order. `refYear` is
 * the calendar year the fire year starts in; the default (2001) has no 29 Feb,
 * matching fireDayLabel. In a leap fire year every month after February starts
 * one day later.
 */
export function fireYearMonthTicks(startMonth: number, refYear = 2001): Array<{ day: number; label: string }> {
  const origin = Date.UTC(refYear, startMonth - 1, 1);
  return Array.from({ length: 12 }, (_, i) => {
    const m = (startMonth - 1 + i) % 12;
    const y = refYear + Math.floor((startMonth - 1 + i) / 12);
    return { day: Math.round((Date.UTC(y, m, 1) - origin) / 86_400_000) + 1, label: MONTH_SHORT[m] };
  });
}
