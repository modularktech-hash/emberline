/**
 * Row contracts for the Supabase RPCs defined in db/migrations/0002_rpc.sql.
 *
 * These are hand-written rather than generated so the app compiles before the
 * database exists. Regenerate against the live project once it is provisioned
 * (`supabase gen types typescript`) and reconcile any drift.
 */

/** A sensor family. The whole project exists because these two are not directly comparable. */
export type Sensor = "MODIS" | "VIIRS";

export type ConfidenceClass = "low" | "nominal" | "high";

/** Which series the calendar is showing. */
export type Series = "raw" | "harmonized";

/** One day of activity for an area of interest. `calendar_for_aoi`. */
export interface CalendarDay {
  acq_date: string;
  year: number;
  doy: number;
  sensor_mix: string;
  n_detections: number;
  frp_raw_mw: number | null;
  frp_harmonized_mw: number | null;
  /** Cells in the AOI with no fitted correction factor, surfaced rather than hidden. */
  uncorrected_cells: number;
}

/** One day against its day-of-year climatology. `anomaly_for_aoi`. */
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

/** An individual hotspot. `detections_in_bbox`. Demo AOIs only. */
export interface Detection {
  lat: number;
  lon: number;
  acq_ts: string;
  sensor: Sensor;
  platform: string;
  frp_mw: number | null;
  confidence_class: ConfidenceClass | null;
  event_id: number | null;
}

/** One fitted correction and the statistics that justify it. `harmonization_report`. */
export interface HarmonizationRow {
  fit_version: string;
  landcover_class: number;
  landcover_name: string;
  frp_threshold_mw: number;
  slope: number;
  intercept: number;
  r2: number;
  bias: number;
  rmse: number;
  n_cells: number;
  holdout_r2: number | null;
  is_active: boolean;
}

/** A saved area of interest. `list_aois`. */
export interface Aoi {
  id: string;
  name: string;
  h3_cells: string[];
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  is_demo: boolean;
}

/** A user-drawn or preset area of interest, before it has been saved. */
export interface AoiSelection {
  name: string;
  bbox: [number, number, number, number];
  cells: string[];
}
