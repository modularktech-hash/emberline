import { cellToBoundary, getHexagonAreaAvg, latLngToCell, polygonToCells } from "h3-js";

/**
 * Area-of-interest helpers: a lat/lon box -> the H3 res-2 parent cells the
 * calendar tables are keyed by.
 *
 * The calendar is aggregated per H3 res-2 parent, so a box can only ever be
 * resolved to whole res-2 cells. A cell is selected when any part of it
 * touches the box -- not only when its centre is inside -- so a box smaller
 * than one cell still selects the cell that contains it.
 */

/** The resolution of the `h3_parent` keys in calendar_raw / calendar_harmonized. */
export const PARENT_RES = 2;

/** [west, south, east, north], degrees. west < east (no antimeridian boxes). */
export type Bbox = [number, number, number, number];

/** Average area of one res-2 cell, from h3-js (not hard-coded). */
export const PARENT_CELL_AREA_KM2 = getHexagonAreaAvg(PARENT_RES, "km2");

/**
 * Res-2 cells covering the box: cells whose centre is inside (polygonToCells)
 * plus every cell containing a point of the box outline. A cell that
 * intersects the box either contains part of its outline or lies wholly
 * inside it (so its centre is inside), so the union is the intersecting set.
 * The outline is sampled every 0.05 deg, far finer than a res-2 edge
 * (~180 km), so no cell is skipped.
 */
export function bboxToParentCells(bbox: Bbox): string[] {
  const [west, south, east, north] = bbox;
  const ring: Array<[number, number]> = [
    [south, west],
    [south, east],
    [north, east],
    [north, west],
  ];
  const cells = new Set(polygonToCells([ring], PARENT_RES));
  const STEP = 0.05;
  const along = (a: number, b: number) => {
    const n = Math.max(1, Math.ceil(Math.abs(b - a) / STEP));
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  };
  for (const lng of along(west, east)) {
    cells.add(latLngToCell(south, lng, PARENT_RES));
    cells.add(latLngToCell(north, lng, PARENT_RES));
  }
  for (const lat of along(south, north)) {
    cells.add(latLngToCell(lat, west, PARENT_RES));
    cells.add(latLngToCell(lat, east, PARENT_RES));
  }
  return [...cells].sort();
}

/**
 * Cell outline as a GeoJSON ring ([lng, lat], closed). Longitudes are
 * unwrapped so a cell straddling the antimeridian draws as one hexagon
 * instead of a band across the whole map.
 */
export function cellRing(cell: string): Array<[number, number]> {
  const ring = cellToBoundary(cell, true) as Array<[number, number]>;
  const lngs = ring.map((p) => p[0]);
  if (Math.max(...lngs) - Math.min(...lngs) > 180) {
    return ring.map(([lng, lat]) => [lng < 0 ? lng + 360 : lng, lat]);
  }
  return ring;
}

export function cellsToFeatureCollection(cells: string[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => ({
      type: "Feature",
      properties: { cell },
      geometry: { type: "Polygon", coordinates: [cellRing(cell)] },
    })),
  };
}

export function bboxToFeature(bbox: Bbox): GeoJSON.Feature<GeoJSON.Polygon> {
  const [west, south, east, north] = bbox;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

/** Compact coordinate: at most 2 decimals, no trailing zeros. */
export const fmtCoord = (v: number) => String(Number(v.toFixed(2)));

/** "Box S,W – N,E" */
export function boxLabel(bbox: Bbox): string {
  const [west, south, east, north] = bbox;
  return `Box ${fmtCoord(south)},${fmtCoord(west)} – ${fmtCoord(north)},${fmtCoord(east)}`;
}

export interface BoundsInput {
  south: string;
  west: string;
  north: string;
  east: string;
}

export type BoundsResult = { ok: true; bbox: Bbox } | { ok: false; error: string };

/** Validate typed bounds. Every failure says what to change. */
export function parseBounds(input: BoundsInput): BoundsResult {
  const names: Array<keyof BoundsInput> = ["south", "west", "north", "east"];
  const v: Record<keyof BoundsInput, number> = { south: NaN, west: NaN, north: NaN, east: NaN };
  for (const name of names) {
    const text = input[name].trim();
    const n = Number(text);
    if (text === "" || !Number.isFinite(n)) {
      return { ok: false, error: `Enter a number for ${name}.` };
    }
    v[name] = n;
  }
  for (const name of ["south", "north"] as const) {
    if (v[name] < -90 || v[name] > 90) {
      return { ok: false, error: `Latitude (${name}) must be between -90 and 90.` };
    }
  }
  for (const name of ["west", "east"] as const) {
    if (v[name] < -180 || v[name] > 180) {
      return { ok: false, error: `Longitude (${name}) must be between -180 and 180.` };
    }
  }
  if (v.south >= v.north) {
    return { ok: false, error: "South must be less than north." };
  }
  if (v.west > v.east) {
    return {
      ok: false,
      error:
        "West is greater than east, which would cross the 180° meridian. Boxes across it are not supported; draw the part on one side.",
    };
  }
  if (v.west === v.east) {
    return { ok: false, error: "West and east must differ." };
  }
  return { ok: true, bbox: [v.west, v.south, v.east, v.north] };
}

export function bboxToInput(bbox: Bbox | null | undefined): BoundsInput {
  if (!bbox) return { south: "", west: "", north: "", east: "" };
  const [west, south, east, north] = bbox;
  return { south: fmtCoord(south), west: fmtCoord(west), north: fmtCoord(north), east: fmtCoord(east) };
}
