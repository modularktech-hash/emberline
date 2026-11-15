import { PARENT_RESOLUTION, bboxCrossesAntimeridian, cellsExtent, type Bbox } from "@/lib/aoi";
import type { CalendarResult } from "@/lib/types";

/**
 * E14/E15: the actual spatial scope of a custom area. A box is resolved to
 * every H3 res-2 cell it touches (lib/aoi.ts bboxToParents) and each cell
 * with data is summed whole, so the effective area is the union of those
 * cells, not the box.
 */
export interface BoxScope {
  /** Requested bounds exactly as applied (W, S, E, N), unrounded. */
  requested: Bbox;
  antimeridian: boolean;
  resolution: number;
  /** Every res-2 cell the box touches (the selection). */
  touched: string[];
  /** Touched cells summed in the shown series. */
  summed: string[];
  /** Touched cells with a raw record. */
  withRaw: string[];
  /** Touched cells with a raw record but no harmonized one (left out of the harmonized series). */
  rawOnly: string[];
  /** Touched cells with no processed data at all. */
  noData: string[];
  /** Bounding extent of the summed cells (W, S, E, N), or null if none. */
  effective: Bbox | null;
}

export const SELECTION_RULE = "every H3 resolution-2 cell touched by the box (lib/aoi.ts bboxToParents); each cell with data is summed whole";
export const CELL_SIZE_NOTE = "~300 km cells";

export function boxScope(bbox: Bbox, parents: string[], raw: CalendarResult, shown: CalendarResult): BoxScope {
  const rawSet = new Set(raw.keys);
  const summedSet = new Set(shown.keys);
  return {
    requested: bbox,
    antimeridian: bboxCrossesAntimeridian(bbox),
    resolution: PARENT_RESOLUTION,
    touched: parents,
    summed: parents.filter((c) => summedSet.has(c)),
    withRaw: parents.filter((c) => rawSet.has(c)),
    rawOnly: shown.mode === "harmonized" ? parents.filter((c) => rawSet.has(c) && !summedSet.has(c)) : [],
    noData: parents.filter((c) => !rawSet.has(c)),
    effective: cellsExtent(parents.filter((c) => summedSet.has(c))),
  };
}

/** Bounds as "W, S, E, N" with the given decimals (null = full precision). */
export function fmtBounds(b: Bbox, dp: number | null = null): string {
  return b.map((v) => (dp == null ? String(v) : v.toFixed(dp))).join(", ");
}

/** E15: header lines that let the selection be rebuilt exactly. */
export function scopeCsvHeader(s: BoxScope): Record<string, string> {
  return {
    requested_bounds_wsen: fmtBounds(s.requested),
    crosses_antimeridian: s.antimeridian ? "yes (west > east)" : "no",
    selection: SELECTION_RULE,
    h3_resolution: `${s.resolution} (${CELL_SIZE_NOTE})`,
    effective_bounds_wsen: s.effective ? `${fmtBounds(s.effective, 4)} (extent of the summed cells)` : "none (no cell summed)",
    cells_touched: String(s.touched.length),
    cells_summed: String(s.summed.length),
    cells_with_raw_record: String(s.withRaw.length),
    cells_without_data: String(s.noData.length),
    ...(s.rawOnly.length ? { cells_raw_only_excluded: String(s.rawOnly.length) } : {}),
    cell_ids_touched: s.touched.join(" "),
    cell_ids_summed: s.summed.join(" "),
    cell_ids_without_data: s.noData.join(" ") || "none",
    ...(s.rawOnly.length ? { cell_ids_raw_only_excluded: s.rawOnly.join(" ") } : {}),
    fit_origins: "not listed: the published calendars do not map res-2 cells to countries, so the fits behind a cell's harmonized values cannot be named here",
  };
}
