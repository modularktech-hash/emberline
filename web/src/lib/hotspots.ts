/**
 * G1: recent hotspots for a search area, from live.json (FIRMS near-real-time,
 * already gridded to 0.5° cells by scripts/build_live.py). A cell belongs to the
 * area when its centre lies inside the country outline (web/public/geo/countries.geojson,
 * Natural Earth 110 m) or inside the drawn box. Raw, uncorrected NRT data.
 */
import { geomBbox, geomContains, type AreaGeom, type Bbox } from "@/lib/aoi";

/** FIRMS country names whose Natural Earth 110 m NAME differs (others: underscores → spaces). */
const NE_NAME: Record<string, string> = {
  Democratic_Republic_of_the_Congo: "Dem. Rep. Congo", Russian_Federation: "Russia", South_Sudan: "S. Sudan",
  Central_African_Republic: "Central African Rep.", United_States: "United States of America", Lao_PDR: "Laos",
  Cote_d_Ivoire: "Côte d'Ivoire", Republic_of_Congo: "Congo", Dominican_Republic: "Dominican Rep.", Dem_Rep_Korea: "North Korea",
  The_Gambia: "Gambia", Bosnia_and_Herzegovina: "Bosnia and Herz.", Macedonia_Former_Yugoslav_Republic_of: "Macedonia",
  Republic_of_Korea: "South Korea", Equatorial_Guinea: "Eq. Guinea", Czech_Republic: "Czechia", Solomon_Islands: "Solomon Is.",
  Brunei_Darussalam: "Brunei", Falkland_Islands: "Falkland Is.", Western_Sahara: "W. Sahara", Eswatini: "Swaziland",
};
export const neName = (firms: string) => NE_NAME[firms] ?? firms.replace(/_/g, " ");

type Ring = number[][];
interface Feature { properties: { NAME: string }; geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] } }
let geo: Promise<Map<string, Ring[]>> | null = null;
function outlines(): Promise<Map<string, Ring[]>> {
  geo ??= fetch("/geo/countries.geojson").then((r) => { if (!r.ok) throw new Error(`countries.geojson: HTTP ${r.status}`); return r.json(); })
    .then((g: { features: Feature[] }) => new Map(g.features.map((f) => [f.properties.NAME, f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat()])));
  geo.catch(() => { geo = null; });
  return geo;
}

/** Even-odd ray casting over every ring (outer rings and holes alike). */
function inside(rings: Ring[], lon: number, lat: number): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

const inBox = ([w, s, e, n]: Bbox, lon: number, lat: number) => lat >= s && lat <= n && (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e);

export type HotspotArea = { kind: "country"; name: string } | { kind: "box"; bbox: Bbox } | { kind: "geom"; geom: AreaGeom };
/** Returns a cell filter for the area, or null when the country has no outline in the 110 m map. */
export async function areaFilter(area: HotspotArea): Promise<((lat: number, lon: number) => boolean) | null> {
  if (area.kind === "box") return (lat, lon) => inBox(area.bbox, lon, lat);
  if (area.kind === "geom") { const g = area.geom; return (lat, lon) => geomContains(g, lon, lat); }
  const rings = (await outlines()).get(neName(area.name));
  return rings ? (lat, lon) => inside(rings, lon, lat) : null;
}

/** Bounding box(es) to request for an area: one box, or two when it crosses 180° (FIRMS wants west < east). */
export async function areaBoxes(area: HotspotArea): Promise<Bbox[] | null> {
  let b: Bbox;
  if (area.kind === "country") {
    const rings = (await outlines()).get(neName(area.name));
    if (!rings) return null;
    const xs = rings.flat().map((p) => p[0]), ys = rings.flat().map((p) => p[1]);
    b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    // Countries spanning 180° (Russia, Fiji, ...) come back as two boxes either side.
    if (b[2] - b[0] > 180) {
      const west = rings.flat().filter((p) => p[0] < 0), east = rings.flat().filter((p) => p[0] >= 0);
      const bb = (ps: number[][]): Bbox => [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))];
      return [bb(east), bb(west)];
    }
    return [b];
  }
  b = area.kind === "box" ? area.bbox : area.geom.kind === "box" ? area.geom.bbox : geomBbox(area.geom);
  if (b[0] > b[2]) return [[b[0], b[1], 180, b[3]], [-180, b[1], b[2], b[3]]];
  return [b];
}
