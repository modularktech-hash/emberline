import { AREA_RESOLUTION, bboxCrossesAntimeridian, cellsExtent, geomBbox, ringToParam, type Bbox, type Ring } from "@/lib/aoi";
import type { AreaData, CalendarResult } from "@/lib/types";

/**
 * E14/E15: the actual spatial scope of a drawn area. The area is resolved to
 * every H3 res-4 cell whose centre lies inside it (lib/aoi.ts geomCells) and
 * each cell with data is summed whole, so the effective area is the union of
 * those cells (~1,770 km² each), not the exact outline.
 */
export interface BoxScope {
  /** Requested bounds (W, S, E, N), unrounded; for a polygon, its bounding box. */
  requested: Bbox;
  /** Polygon corners when the area is a polygon. */
  ring: Ring | null;
  antimeridian: boolean;
  resolution: number;
  /** Every cell selected (the selection). */
  touched: string[];
  /** Selected cells summed in the shown series. */
  summed: string[];
  /** Selected cells with a raw record. */
  withRaw: string[];
  /** Selected cells with a raw record but no harmonized one (left out of the harmonized series). */
  rawOnly: string[];
  /** Selected cells with no processed data at all. */
  noData: string[];
  /** Bounding extent of the summed cells (W, S, E, N), or null if none. */
  effective: Bbox | null;
  /** The area held no cell centre; the cell under its centre is used. */
  fallback: boolean;
  /** FIRMS country files contributing detections, with fit status. */
  countries: AreaData["countries"];
}

export const SELECTION_RULE = "every H3 resolution-4 cell whose centre lies inside the area (lib/aoi.ts geomCells); each cell with data is summed whole";
export const CELL_SIZE_NOTE = "~1,770 km² cells, about 45 km across";

export function boxScope(
  area: { bbox?: Bbox; ring?: Ring; cells: string[]; fallback: boolean },
  data: AreaData | null, raw: CalendarResult, shown: CalendarResult,
): BoxScope {
  const rawSet = new Set(raw.keys);
  const summedSet = new Set(shown.keys);
  const cells = area.cells;
  const requested = area.bbox ?? geomBbox({ kind: "polygon", ring: area.ring! });
  return {
    requested, ring: area.ring ?? null,
    antimeridian: !!area.bbox && bboxCrossesAntimeridian(area.bbox),
    resolution: AREA_RESOLUTION,
    touched: cells,
    summed: cells.filter((c) => summedSet.has(c)),
    withRaw: cells.filter((c) => rawSet.has(c)),
    rawOnly: shown.mode === "harmonized" ? cells.filter((c) => rawSet.has(c) && !summedSet.has(c)) : [],
    noData: cells.filter((c) => !rawSet.has(c)),
    effective: cellsExtent(cells.filter((c) => summedSet.has(c))),
    fallback: area.fallback,
    countries: data?.countries ?? [],
  };
}

/** Bounds as "W, S, E, N" with the given decimals (null = full precision). */
export function fmtBounds(b: Bbox, dp: number | null = null): string {
  return b.map((v) => (dp == null ? String(v) : v.toFixed(dp))).join(", ");
}

/** E15: header lines that let the selection be rebuilt exactly. Cell IDs are in the cell-level CSV. */
export function scopeCsvHeader(s: BoxScope): Record<string, string> {
  return {
    ...(s.ring ? { polygon_lon_lat: ringToParam(s.ring) } : { requested_bounds_wsen: fmtBounds(s.requested) }),
    crosses_antimeridian: s.antimeridian ? "yes (west > east)" : "no",
    selection: SELECTION_RULE + (s.fallback ? " (area smaller than one cell: the cell under its centre is used)" : ""),
    h3_resolution: `${s.resolution} (${CELL_SIZE_NOTE})`,
    effective_bounds_wsen: s.effective ? `${fmtBounds(s.effective, 4)} (extent of the summed cells)` : "none (no cell summed)",
    cells_selected: String(s.touched.length),
    cells_summed: String(s.summed.length),
    cells_with_raw_record: String(s.withRaw.length),
    cells_without_data: String(s.noData.length),
    ...(s.rawOnly.length ? { cells_raw_only_excluded: String(s.rawOnly.length) } : {}),
    fit_origins: s.countries.map((c) => `${c.country} (${c.fitted ? "fitted" : "no fit, uncorrected"})`).join("; ") || "none",
  };
}
