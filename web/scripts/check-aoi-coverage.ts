/**
 * Checks bboxToParents (src/lib/aoi.ts) against a brute-force reference.
 *
 * Reference: latLngToCell on a dense lattice of points covering each box, plus
 * a much denser walk along its four edges (where sliver cells live). That is a
 * lower bound on the true set of touched cells, so:
 *   - MISSING (in reference, not returned) must be 0 — this is the pass/fail.
 *   - EXTRA (returned, not hit by the reference lattice) is then re-checked by
 *     sampling the overlap of the box with that cell's own extent at a finer
 *     step; an extra that is found is a cell the coarser lattice missed
 *     (confirmed), one that is not is reported as unconfirmed.
 * Also prints what the old fixed 15 x 15 lattice returned, for comparison.
 *
 * Usage: node --experimental-strip-types web/scripts/check-aoi-coverage.ts
 */
import { cellToBoundary, latLngToCell } from "h3-js";
import { bboxLonSpan, bboxToParents, wrapLon, type Bbox } from "../src/lib/aoi.ts";

const RES = 2;

const CASES: Array<{ name: string; bbox: Bbox; step: number }> = [
  { name: "tiny (0.05 deg, smaller than one cell)", bbox: [-8.02, 39.51, -7.97, 39.56], step: 0.001 },
  { name: "tiny (0.01 deg)", bbox: [100.0, 10.0, 100.01, 10.01], step: 0.0005 },
  // 0.02 deg box centred on a res-2 cell vertex: must return all three cells meeting there.
  (() => {
    const [lat, lng] = cellToBoundary(latLngToCell(39.5, -8, RES))[0];
    return { name: "tiny on a cell vertex (0.02 deg)", bbox: [lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01] as Bbox, step: 0.0002 };
  })(),
  { name: "long narrow (60 x 0.2 deg)", bbox: [-70, -33.1, -10, -32.9], step: 0.01 },
  { name: "long narrow meridional (0.1 x 70 deg)", bbox: [20.0, -35, 20.1, 35], step: 0.01 },
  { name: "India-sized", bbox: [68, 6, 97, 36], step: 0.05 },
  { name: "Australia-sized", bbox: [112, -44, 154, -10], step: 0.05 },
  { name: "continental (Africa+, review case)", bbox: [-20, -35, 55, 38], step: 0.05 },
  { name: "polar north cap", bbox: [-180, 80, 180, 90], step: 0.02 },
  { name: "polar sector to the pole", bbox: [0, 75, 90, 90], step: 0.02 },
  { name: "polar south", bbox: [-60, -90, 30, -70], step: 0.02 },
  { name: "antimeridian wrapped (W 170, E -170)", bbox: [170, -20, -170, -10], step: 0.01 },
  { name: "antimeridian wrapped wide (W 150, E -120)", bbox: [150, 45, -120, 72], step: 0.03 },
  { name: "near-global (review case)", bbox: [-179, -85, 179, 85], step: 0.1 },
];

function reference(bbox: Bbox, step: number): Set<string> {
  const [west, south, , north] = bbox;
  const span = bboxLonSpan(bbox);
  const out = new Set<string>();
  const nx = Math.ceil(span / step), ny = Math.ceil((north - south) / step);
  for (let i = 0; i <= ny; i += 1) {
    const lat = Math.min(north, south + i * step);
    for (let j = 0; j <= nx; j += 1) out.add(latLngToCell(lat, wrapLon(west + Math.min(span, j * step)), RES));
  }
  // Edges, ten times denser.
  const fine = step / 10;
  for (let j = 0; j <= Math.ceil(span / fine); j += 1) {
    const lng = wrapLon(west + Math.min(span, j * fine));
    out.add(latLngToCell(south, lng, RES)); out.add(latLngToCell(north, lng, RES));
  }
  for (let i = 0; i <= Math.ceil((north - south) / fine); i += 1) {
    const lat = Math.min(north, south + i * fine);
    out.add(latLngToCell(lat, west, RES)); out.add(latLngToCell(lat, wrapLon(west + span), RES));
  }
  return out;
}

/** Search the overlap of the box with the cell's lat/lng extent for a point in the cell. */
function confirm(cell: string, bbox: Bbox, step: number): boolean {
  const [west, south, , north] = bbox;
  const span = bboxLonSpan(bbox);
  const b = cellToBoundary(cell);
  const lats = b.map((p) => p[0]);
  const s = Math.max(south, Math.min(...lats) - 0.5), n = Math.min(north, Math.max(...lats) + 0.5);
  if (s > n) return false;
  const nx = Math.ceil(span / step), ny = Math.ceil((n - s) / step);
  for (let i = 0; i <= ny; i += 1) {
    const lat = Math.min(n, s + i * step);
    for (let j = 0; j <= nx; j += 1) if (latLngToCell(lat, wrapLon(west + Math.min(span, j * step)), RES) === cell) return true;
  }
  return false;
}

function oldLattice(bbox: Bbox, samples = 14): Set<string> {
  const [west, south, east, north] = bbox;
  const out = new Set<string>();
  for (let i = 0; i <= samples; i += 1)
    for (let j = 0; j <= samples; j += 1)
      out.add(latLngToCell(south + ((north - south) * i) / samples, west + ((east - west) * j) / samples, RES));
  return out;
}

let failed = 0;
for (const c of CASES) {
  const t0 = performance.now();
  const got = new Set(bboxToParents(c.bbox));
  const ms = performance.now() - t0;
  const ref = reference(c.bbox, c.step);
  const missing = [...ref].filter((x) => !got.has(x));
  const extra = [...got].filter((x) => !ref.has(x));
  const confirmStep = Math.min(c.step / 5, 0.01);
  const unconfirmed = extra.filter((x) => !confirm(x, c.bbox, confirmStep));
  const old = oldLattice(c.bbox);
  const oldMissing = [...ref].filter((x) => !old.has(x)).length;
  const ok = missing.length === 0;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${c.name} [${c.bbox.join(", ")}]: returned ${got.size} in ${ms.toFixed(0)} ms; ` +
      `reference ${ref.size} (step ${c.step} deg); missing ${missing.length}; extra ${extra.length} ` +
      `(${extra.length - unconfirmed.length} confirmed by finer search, ${unconfirmed.length} unconfirmed${unconfirmed.length ? ": " + unconfirmed.join(",") : ""}); ` +
      `old 15x15 lattice: ${old.size} cells, ${oldMissing} missing`,
  );
}
console.log(failed ? `${failed} case(s) FAILED` : "ALL PASS: no reference cell missing");
process.exit(failed ? 1 : 0);
