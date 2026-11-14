import {
  DEMO_DATA_ENABLED,
  demoAnomaly,
  demoCalendar,
  demoDetections,
  demoHarmonizationReport,
} from "@/lib/fixtures";
import { getSupabase } from "@/lib/supabase";
import type {
  AnomalyDay,
  Aoi,
  CalendarDay,
  Detection,
  HarmonizationRow,
} from "@/lib/types";

/**
 * Typed wrappers over the Postgres functions in db/migrations/0002_rpc.sql.
 *
 * Every wrapper returns a discriminated result rather than throwing. A missing
 * database and an empty table are different states and the UI says so
 * differently: "not connected yet" is a setup problem, "no detections in this
 * area" is a finding.
 */

export type QueryResult<T> =
  | { status: "ok"; rows: T[] }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<QueryResult<T>> {
  const supabase = getSupabase();
  if (!supabase) return { status: "unconfigured" };

  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { status: "error", message: error.message };
  return { status: "ok", rows: (data ?? []) as T[] };
}

export function fetchCalendar(
  cells: string[],
  from?: string,
  to?: string,
): Promise<QueryResult<CalendarDay>> {
  if (DEMO_DATA_ENABLED) {
    return Promise.resolve({ status: "ok", rows: demoCalendar(cells.join(",")) });
  }
  return rpc<CalendarDay>("calendar_for_aoi", {
    p_cells: cells,
    ...(from ? { p_from: from } : {}),
    ...(to ? { p_to: to } : {}),
  });
}

export function fetchAnomaly(
  cells: string[],
  from?: string,
  to?: string,
): Promise<QueryResult<AnomalyDay>> {
  if (DEMO_DATA_ENABLED) {
    return Promise.resolve({ status: "ok", rows: demoAnomaly(cells.join(",")) });
  }
  return rpc<AnomalyDay>("anomaly_for_aoi", {
    p_cells: cells,
    ...(from ? { p_from: from } : {}),
    ...(to ? { p_to: to } : {}),
  });
}

export function fetchDetections(
  bbox: [number, number, number, number],
  from: string,
  to: string,
  limit = 5000,
): Promise<QueryResult<Detection>> {
  if (DEMO_DATA_ENABLED) {
    return Promise.resolve({ status: "ok", rows: demoDetections(bbox) });
  }
  const [west, south, east, north] = bbox;
  return rpc<Detection>("detections_in_bbox", {
    p_west: west,
    p_south: south,
    p_east: east,
    p_north: north,
    p_from: from,
    p_to: to,
    p_limit: limit,
  });
}

export function fetchHarmonizationReport(): Promise<
  QueryResult<HarmonizationRow>
> {
  if (DEMO_DATA_ENABLED) {
    return Promise.resolve({ status: "ok", rows: demoHarmonizationReport() });
  }
  return rpc<HarmonizationRow>("harmonization_report", {});
}

export function fetchAois(demoOnly = false): Promise<QueryResult<Aoi>> {
  return rpc<Aoi>("list_aois", { p_demo_only: demoOnly });
}
