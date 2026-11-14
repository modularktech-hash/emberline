/**
 * Data contracts for the static files in web/public/data/.
 *
 * Read path: static Parquet over HTTP range requests (ADR 0001). Only
 * src/lib/queries.ts reads the files; everything else consumes these types.
 */

/** A sensor family. The whole project exists because these two are not directly comparable. */
export type Sensor = "MODIS" | "VIIRS";

/** Which series the calendar is showing. */
export type Series = "raw" | "harmonized";

/** How calendar rows are keyed: by country name or by H3 res-2 parent cell id. */
export type CalendarScope = "country" | "h3_parent";

/* ------------------------------------------------------------------ */
/* params.json -- the published fit (scripts/fit_harmonization.py)    */
/* ------------------------------------------------------------------ */

export type YearSpan = [number, number];
export type Ci95 = [number, number];

/** Agreement of one predictor with observed Aqua, over cell x month. */
export interface ValidationStats {
  r2: number;
  bias_pct: number;
  rmse: number;
  n_cell_months: number;
  obs_total: number;
  pred_total: number;
}

/** The fitted model and its two baselines, scored on the same cell-months. */
export interface ValidationSet {
  model: ValidationStats;
  raw_viirs: ValidationStats;
  threshold: ValidationStats;
}

export interface LogisticFit {
  b0: number;
  b1: number;
  feature: string;
  b0_ci95: Ci95;
  b1_ci95: Ci95;
}

export interface NullControl {
  spliced_raw_step_ratio_2012: number;
  aqua_only_step_ratio_2012: number;
  harmonized_step_ratio_2012: number;
  definition: string;
}

export interface DriftEraYear {
  year: number;
  aqua: number;
  aqua_eq: number;
  obs_over_pred: number;
  aqua_lst: number;
}

export interface FrozenEraYear {
  year: number;
  obs_over_pred: number;
  aqua_lst: number;
}

export interface CountryFit {
  /** "own": fitted on this country's matches. "pooled": too few training matches, borrows the pooled curve. */
  fit_source?: "own" | "pooled";
  kappa_source?: "own" | "pooled";
  /**
   * World file only. true: logistic and FRP-at-50% intervals are bootstrap
   * intervals. false (pooled fits): resampling was skipped and the "interval"
   * is the point value twice -- uncertainty not estimated, never draw it.
   */
  coef_ci_estimated?: boolean;
  logistic: LogisticFit;
  frp_at_p50_mw: number;
  frp_at_p50_ci95_mw: Ci95;
  kappa: number;
  threshold_baseline_mw: number;
  train_match_rate: number;
  n_train_viirs_detections: number;
  validation_train: ValidationSet;
  validation_test: ValidationSet;
  validation_test_ci95: { r2: Ci95; bias_pct: Ci95 };
  null_control: NullControl;
  drift_era: DriftEraYear[];
  frozen_era_obs_over_pred: FrozenEraYear[];
}

export interface Params {
  fit_version: string;
  unit: string;
  train_years: YearSpan;
  test_years: YearSpan;
  drift_years: YearSpan;
  match_rule: string;
  countries: Record<string, CountryFit>;
  /** Countries the fit could not be run for (too sparse), with the fitter's error. World file only. */
  failed?: Record<string, string>;
  pooled_model?: { b0: number; b1: number; kappa: number; from_countries: string[] };
  pooled_rule?: string;
  /** Set by queries.ts: which file this came from. */
  dataset?: "world" | "four";
}

/* ------------------------------------------------------------------ */
/* Calendar (calendar_raw.parquet, calendar_harmonized.parquet)       */
/* ------------------------------------------------------------------ */

/**
 * Where a calendar value comes from.
 * - "MODIS" / "VIIRS": raw counts from that sensor (raw mode).
 * - "observed_aqua": harmonized, before 2012 -- observed Aqua MODIS.
 * - "predicted_from_viirs": harmonized, 2012 on -- Aqua-equivalent predicted
 *   from Suomi-NPP VIIRS with the published fit.
 */
export type CalendarBasis = "MODIS" | "VIIRS" | "observed_aqua" | "predicted_from_viirs";

export interface CalendarRow {
  year: number;
  month: number; // 1-12
  /** Summed across the requested keys. Null means no data, which is not the same as 0. */
  value: number | null;
  basis: CalendarBasis;
}

export interface CalendarResult {
  scope: CalendarScope;
  mode: Series;
  /** Unit of `value`. */
  unit: string;
  /** Requested keys that exist in the data. */
  keys: string[];
  /** Requested keys not present in any processed table ("not processed yet"). */
  unknownKeys: string[];
  /**
   * Harmonized mode only: requested keys with a raw calendar but no
   * harmonized one (too sparse to fit). They contribute nothing to `rows`.
   */
  uncorrectedKeys: string[];
  /** Which file set the calendar came from. */
  dataset: "world" | "four";
  /** Inclusive year range of the grid; every (year, month) in it has a row. */
  years: YearSpan;
  /** One row per (year, month), year-major. */
  rows: CalendarRow[];
  /** The (year, month) cells whose value is null. */
  missing: Array<{ year: number; month: number }>;
}

/* ------------------------------------------------------------------ */
/* cell_day.parquet -- H3 res-5 x UTC day x platform, demo AOIs only   */
/* ------------------------------------------------------------------ */

export interface CellDayRow {
  h3: string;
  h3_parent: string;
  /** UTC acquisition date, YYYY-MM-DD. */
  acq_date: string;
  year: number;
  month: number;
  doy: number;
  sensor: Sensor;
  platform: string;
  n_detections: number;
  frp_sum_mw: number;
  frp_mean_mw: number;
  frp_max_mw: number;
  mean_pixel_area_km2: number;
  /** Mean local solar time of the detections, hours. */
  mean_lst_hours: number;
}

/* ------------------------------------------------------------------ */
/* Legacy view contracts, still consumed by components awaiting rebuild */
/* ------------------------------------------------------------------ */

/** One day of activity for an area of interest. Used by CalendarHeatmap. */
export interface CalendarDay {
  acq_date: string;
  year: number;
  doy: number;
  sensor_mix: string;
  n_detections: number;
  frp_raw_mw: number | null;
  frp_harmonized_mw: number | null;
  uncorrected_cells: number;
}

/** One day against its day-of-year climatology. Used by AnomalyChart. */
export interface AnomalyDay {
  acq_date: string;
  doy: number;
  observed_mw: number | null;
  p50_mw: number | null;
  p75_mw: number | null;
  p90_mw: number | null;
  p95_mw: number | null;
  exceeds_p90: boolean | null;
  exceeds_p95: boolean | null;
}

/** A user-drawn or preset area of interest. */
export interface AoiSelection {
  name: string;
  bbox: [number, number, number, number];
  cells: string[];
}
