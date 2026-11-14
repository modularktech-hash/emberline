import { cellToBoundary, cellToLatLng, getResolution, gridDisk, latLngToCell, polygonToCells } from "h3-js";

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

/** H3 resolution of the calendar tables' `h3_parent` key (~86,000 km² cells). */
export const PARENT_RESOLUTION = 2;

/**
 * Every H3 res-2 parent cell a box touches: a cell is included when any point
 * of the closed box [west, south, east, north] (a lat/lng rectangle, antimeridian
 * policy above) lies in the cell — the same answer as calling latLngToCell on
 * every point of the box. The calendar tables are keyed on these cells, so a
 * box resolves to the whole coarse cells it overlaps.
 *
 * Method (complete, not sampled):
 * 1. Seed with the cells of a 15 x 15 lattice of points in the box — each is a
 *    certain member.
 * 2. Flood fill: test every edge neighbour (gridDisk 1) of a member for an
 *    exact cell-rectangle intersection, and keep expanding from those that
 *    intersect. The cells meeting a connected rectangle form a connected set
 *    under edge adjacency (cells that share a vertex also share edges pairwise),
 *    so the fill cannot stop early.
 * 3. The intersection test uses the cell's boundary with each edge densified
 *    along its great circle (H3 cell edges are geodesics), unwrapped across the
 *    antimeridian, and closed through the pole for the two polar cells; then a
 *    plain polygon/rectangle test in lng/lat, at longitude shifts of -360, 0, +360.
 *
 * Res 2 has 5,882 cells, so even a whole-globe box needs no cap; nothing is
 * truncated. Checked against a brute-force dense-sampling reference by
 * web/scripts/check-aoi-coverage.ts (tiny, narrow, continental, polar,
 * antimeridian boxes). Replaces the old 15 x 15 lattice, which missed cells in
 * large boxes (553 of 778 for a box over Africa).
 */
export function bboxToParents(bbox: Bbox, resolution: number = PARENT_RESOLUTION): string[] {
  const [west, south, , north] = bbox;
  const span = bboxLonSpan(bbox);
  const pieces: Array<[number, number]> = west <= bbox[2] ? [[west, bbox[2]]] : [[west, 180], [-180, bbox[2]]];
  const rects = pieces.map(([x0, x1]) => [x0, x1, south, north] as Rect);
  const members = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [];
  const samples = 14;
  for (let i = 0; i <= samples; i += 1) {
    for (let j = 0; j <= samples; j += 1) {
      const c = latLngToCell(south + ((north - south) * i) / samples, wrapLon(west + (span * j) / samples), resolution);
      if (!visited.has(c)) { visited.add(c); members.add(c); queue.push(c); }
    }
  }
  while (queue.length) {
    const cell = queue.pop()!;
    for (const nb of gridDisk(cell, 1)) {
      if (visited.has(nb)) continue;
      visited.add(nb);
      if (cellMeetsRects(nb, rects)) { members.add(nb); queue.push(nb); }
    }
  }
  return [...members].sort();
}

type Rect = [number, number, number, number]; // x0, x1, y0, y1 in lng/lat degrees

interface CellRing { xs: number[]; ys: number[]; minX: number; maxX: number; minY: number; maxY: number }
const ringCache = new Map<string, CellRing>();
const DENSIFY = 16;
const RAD = Math.PI / 180;

function toVec(lat: number, lng: number): [number, number, number] {
  const cl = Math.cos(lat * RAD);
  return [cl * Math.cos(lng * RAD), cl * Math.sin(lng * RAD), Math.sin(lat * RAD)];
}

/** Cell boundary as a lng/lat ring: geodesic edges densified, longitudes unwrapped, polar cells closed through the pole. */
function cellRing(cell: string): CellRing {
  const hit = ringCache.get(cell);
  if (hit) return hit;
  const b = cellToBoundary(cell); // [lat, lng]
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < b.length; i += 1) {
    const a = toVec(b[i][0], b[i][1]);
    const c = toVec(b[(i + 1) % b.length][0], b[(i + 1) % b.length][1]);
    const omega = Math.acos(Math.min(1, Math.max(-1, a[0] * c[0] + a[1] * c[1] + a[2] * c[2])));
    for (let k = 0; k < DENSIFY; k += 1) {
      const t = k / DENSIFY;
      let p: number[];
      if (omega < 1e-12) p = a;
      else {
        const s0 = Math.sin((1 - t) * omega) / Math.sin(omega), s1 = Math.sin(t * omega) / Math.sin(omega);
        p = [s0 * a[0] + s1 * c[0], s0 * a[1] + s1 * c[1], s0 * a[2] + s1 * c[2]];
      }
      const lat = Math.atan2(p[2], Math.hypot(p[0], p[1])) / RAD;
      let lng = Math.atan2(p[1], p[0]) / RAD;
      if (xs.length) {
        const prev = xs[xs.length - 1];
        while (lng - prev > 180) lng -= 360;
        while (lng - prev < -180) lng += 360;
      }
      xs.push(lng); ys.push(lat);
    }
  }
  // Closing back to the first vertex: a net ±360° turn means the cell holds a pole.
  let close = xs[0];
  while (close - xs[xs.length - 1] > 180) close -= 360;
  while (close - xs[xs.length - 1] < -180) close += 360;
  if (Math.abs(close - xs[0]) > 180) {
    const pole = latLngToCell(90, 0, getResolution(cell)) === cell ? 90 : -90;
    xs.push(close, close, xs[0]); ys.push(ys[0], pole, pole);
  }
  const ring = { xs, ys, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  ringCache.set(cell, ring);
  return ring;
}

function cellMeetsRects(cell: string, rects: Rect[]): boolean {
  const r = cellRing(cell);
  for (const [x0, x1, y0, y1] of rects) {
    for (const shift of [-360, 0, 360]) {
      if (ringMeetsRect(r, x0 + shift, x1 + shift, y0, y1)) return true;
    }
  }
  return false;
}

const EPS = 1e-9;

/** Closed polygon vs closed axis-aligned rectangle, in the plane. */
function ringMeetsRect(r: CellRing, x0: number, x1: number, y0: number, y1: number): boolean {
  if (r.maxX < x0 - EPS || r.minX > x1 + EPS || r.maxY < y0 - EPS || r.minY > y1 + EPS) return false;
  const n = r.xs.length;
  // Any polygon edge with a point inside the rectangle (Liang-Barsky clip).
  for (let i = 0; i < n; i += 1) {
    const ax = r.xs[i], ay = r.ys[i], bx = r.xs[(i + 1) % n], by = r.ys[(i + 1) % n];
    if (segmentMeetsRect(ax, ay, bx, by, x0 - EPS, x1 + EPS, y0 - EPS, y1 + EPS)) return true;
  }
  // Otherwise the rectangle is wholly inside the polygon or wholly outside it.
  return pointInRing(r, (x0 + x1) / 2, (y0 + y1) / 2);
}

function segmentMeetsRect(ax: number, ay: number, bx: number, by: number, x0: number, x1: number, y0: number, y1: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay) && t0 <= t1;
}

function pointInRing(r: CellRing, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = r.xs.length - 1; i < r.xs.length; j = i, i += 1) {
    const xi = r.xs[i], yi = r.ys[i], xj = r.xs[j], yj = r.ys[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Bounding extent [west, south, east, north] of a set of H3 cells (the effective
 * coverage of a box). When the cells sit either side of the antimeridian the
 * narrower reading wins and is returned with west > east (the policy above),
 * rather than a misleading near-global -180..180 span.
 */
export function cellsExtent(cells: string[]): Bbox | null {
  if (!cells.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  let w2 = Infinity, e2 = -Infinity; // longitudes read in [0, 360)
  for (const c of cells) for (const [lat, lng] of cellToBoundary(c)) {
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
    const l2 = lng < 0 ? lng + 360 : lng;
    w2 = Math.min(w2, l2); e2 = Math.max(e2, l2);
  }
  if (e2 - w2 < e - w && e2 > 180 && w2 < 180) return [wrapLon(w2), s, wrapLon(e2), n];
  return [w, s, e, n];
}
