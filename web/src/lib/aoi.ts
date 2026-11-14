import { cellToLatLng, polygonToCells } from "h3-js";
import type { AoiSelection } from "@/lib/types";

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
 * Preset areas, chosen to span the regimes the correction has to survive:
 * a savanna fire season, a boreal one, a tropical deforestation frontier, a
 * Mediterranean-climate one, and an agricultural burning region -- the last
 * being where MODIS and VIIRS disagree most, because most of those fires are
 * small enough that only VIIRS resolves them.
 */
export const PRESET_AOIS: Array<{ name: string; bbox: Bbox; note: string }> = [
  {
    name: "Top End, Australia",
    bbox: [130.0, -16.0, 137.0, -11.0],
    note: "Tropical savanna; the most regular fire season on Earth",
  },
  {
    name: "Central Siberia",
    bbox: [88.0, 58.0, 104.0, 68.0],
    note: "Boreal forest; large, high-energy fires",
  },
  {
    name: "Rondônia, Brazil",
    bbox: [-66.0, -13.0, -59.0, -8.0],
    note: "Deforestation frontier; strong year-to-year swings",
  },
  {
    name: "Northern California",
    bbox: [-124.0, 38.0, -119.0, 42.0],
    note: "Mediterranean climate; extreme individual events",
  },
  {
    name: "Punjab, India",
    bbox: [73.5, 29.5, 77.0, 32.5],
    note: "Post-harvest crop residue burning; the hardest case for MODIS",
  },
];

export function presetToSelection(
  preset: (typeof PRESET_AOIS)[number],
  resolution: number = DEFAULT_RESOLUTION,
): AoiSelection {
  return {
    name: preset.name,
    bbox: preset.bbox,
    cells: bboxToCells(preset.bbox, resolution).cells,
  };
}
