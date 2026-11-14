import { cellToBoundary, cellToLatLng, latLngToCell, polygonToCells } from "h3-js";

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
 * Antimeridian policy (one rule for typed and drawn boxes): a box is
 * [west, south, east, north] with longitudes in [-180, 180]. If west > east the
 * box crosses the 180° meridian and runs eastward from west to east through
 * 180° (so W 170, E -170 is a 20°-wide box over the Pacific, not a 340° one).
 * west == east is a zero-width box and is rejected. This matches the
 * ingestion library's (packages/firms-ingest) bbox convention.
 */
export function bboxCrossesAntimeridian(bbox: Bbox): boolean {
  return bbox[0] > bbox[2];
}

/** East-west extent of a box in degrees, honouring the antimeridian policy. */
export function bboxLonSpan(bbox: Bbox): number {
  const [west, , east] = bbox;
  return east >= west ? east - west : east + 360 - west;
}

/** Wrap any longitude into [-180, 180]; 180 stays 180. */
export function wrapLon(lon: number): number {
  if (lon >= -180 && lon <= 180) return lon;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Normalize a box drawn on the map. MapLibre can return longitudes beyond
 * ±180 when the user drags across a world copy, so both edges are wrapped into
 * [-180, 180]; an edge pair that then reads west > east crosses the
 * antimeridian (the policy above). A drag wider than the whole globe becomes
 * the whole globe.
 */
export function normalizeDrawnBbox(bbox: Bbox): Bbox {
  const [west, south, east, north] = bbox;
  if (east - west >= 360) return [-180, south, 180, north];
  return [wrapLon(west), south, wrapLon(east), north];
}

export type BoxField = "west" | "south" | "east" | "north";
export const BOX_FIELDS: BoxField[] = ["west", "south", "east", "north"];

export type BoxCheck =
  | { ok: true; bbox: Bbox; crossesAntimeridian: boolean }
  | { ok: false; fieldErrors: Partial<Record<BoxField, string>>; message: string };

const NUMBER_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Validate typed bounds. Every field must be a finite decimal number (blank,
 * text, "Infinity" and hex are rejected — `Number("")` is 0, so a plain
 * Number() conversion would silently turn a blank field into the equator);
 * latitude within ±90, longitude within ±180, south < north, west != east.
 * west > east is accepted as an antimeridian-crossing box (see the policy).
 * Returns per-field messages so the UI can mark each field.
 */
export function validateBoxInput(fields: string[]): BoxCheck {
  const errs: Partial<Record<BoxField, string>> = {};
  const vals: number[] = [];
  BOX_FIELDS.forEach((f, i) => {
    const raw = (fields[i] ?? "").trim().replace(/−/g, "-");
    const isLat = f === "south" || f === "north";
    const limit = isLat ? 90 : 180;
    const label = isLat ? "Latitude" : "Longitude";
    if (raw === "") { errs[f] = `${cap(f)} is empty.`; vals.push(NaN); return; }
    const v = NUMBER_RE.test(raw) ? Number(raw) : NaN;
    vals.push(v);
    if (!Number.isFinite(v)) errs[f] = `${cap(f)} is not a number.`;
    else if (Math.abs(v) > limit) errs[f] = `${label} must be between -${limit} and ${limit}; ${cap(f).toLowerCase()} is ${raw}.`;
  });
  const [w, s, e, n] = vals;
  if (!errs.south && !errs.north && s >= n) {
    errs.north = `North (${n}) must be greater than south (${s}).`;
    errs.south = errs.south ?? "South must be less than north.";
  }
  if (!errs.west && !errs.east && w === e) {
    errs.east = "West and east are equal: the box has no width.";
    errs.west = errs.west ?? "West and east are equal.";
  }
  const keys = BOX_FIELDS.filter((f) => errs[f]);
  if (keys.length) {
    return { ok: false, fieldErrors: errs, message: [...new Set(keys.map((k) => errs[k]!))].join(" ") };
  }
  const bbox: Bbox = [w, s, e, n];
  return { ok: true, bbox, crossesAntimeridian: bboxCrossesAntimeridian(bbox) };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * H3 res-2 parent cells a box touches. The calendar tables are keyed on these
 * (~86,000 km2 each), so a drawn area resolves to the coarse cells it overlaps.
 * Sampled on a grid, because a small box may contain no res-2 cell centre.
 * Longitudes are stepped along the box's own east-west span, so a box that
 * crosses the antimeridian samples the Pacific side, not the 340° complement.
 */
export function bboxToParents(bbox: Bbox, samples = 14): string[] {
  const [west, south, , north] = bbox;
  const span = bboxLonSpan(bbox);
  const out = new Set<string>();
  for (let i = 0; i <= samples; i += 1) {
    for (let j = 0; j <= samples; j += 1) {
      out.add(latLngToCell(south + ((north - south) * i) / samples, wrapLon(west + (span * j) / samples), 2));
    }
  }
  return [...out];
}

/** Bounding extent [west, south, east, north] of a set of H3 cells (the effective coverage of a box). */
export function cellsExtent(cells: string[]): Bbox | null {
  if (!cells.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const c of cells) for (const [lat, lng] of cellToBoundary(c)) {
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return [w, s, e, n];
}
