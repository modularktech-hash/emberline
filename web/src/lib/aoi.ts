import { cellToLatLng, latLngToCell, polygonToCells } from "h3-js";

/**
 * Area-of-interest helpers.
 *
 * The data layer is keyed by H3 cells rather than geometry, so the
 * conversion happens here on the client. A drawn area is mapped to its H3
 * parent cells, which is what the static Parquet files are filtered on.
 */

export type Bbox = [number, number, number, number];

/** Matches the resolution the offline pipeline aggregates at. */
export const DEFAULT_RESOLUTION = 4;

/**
 * A drawn box can cover an enormous area, and every cell becomes a value in
 * the query's array parameter. This cap keeps a whole-continent drag from
 * producing a request too large to send.
 */
export const MAX_CELLS = 4000;

export interface CellsResult {
  cells: string[];
  /** True when the AOI was clipped to MAX_CELLS, so the UI can say so. */
  truncated: boolean;
}

export function bboxToCells(
  bbox: Bbox,
  resolution: number = DEFAULT_RESOLUTION,
): CellsResult {
  const [west, south, east, north] = bbox;

  // h3-js takes [lat, lng] pairs and a closed or open ring.
  const ring: Array<[number, number]> = [
    [south, west],
    [south, east],
    [north, east],
    [north, west],
  ];

  const cells = polygonToCells([ring], resolution);
  return {
    cells: cells.slice(0, MAX_CELLS),
    truncated: cells.length > MAX_CELLS,
  };
}

export function bboxArea(bbox: Bbox): number {
  const [west, south, east, north] = bbox;
  return Math.abs(east - west) * Math.abs(north - south);
}

export function cellCentroid(cell: string): [number, number] {
  const [lat, lng] = cellToLatLng(cell);
  return [lng, lat];
}

export function formatBbox(bbox: Bbox): string {
  return bbox.map((v) => v.toFixed(2)).join(", ");
}

/**
 * H3 res-2 parent cells a box touches. The calendar tables are keyed on these
 * (~86,000 km2 each), so a drawn area resolves to the coarse cells it overlaps.
 * Sampled on a grid, because a small box may contain no res-2 cell centre.
 */
export function bboxToParents(bbox: Bbox, samples = 14): string[] {
  const [west, south, east, north] = bbox;
  const out = new Set<string>();
  for (let i = 0; i <= samples; i += 1) {
    for (let j = 0; j <= samples; j += 1) {
      out.add(latLngToCell(south + ((north - south) * i) / samples, west + ((east - west) * j) / samples, 2));
    }
  }
  return [...out];
}
