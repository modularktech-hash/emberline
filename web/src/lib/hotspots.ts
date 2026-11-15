/**
 * G1: recent hotspots for a search area, from live.json (FIRMS near-real-time,
 * already gridded to 0.5° cells by scripts/build_live.py). A cell belongs to the
 * area when its centre lies inside the country outline (web/public/geo/countries.geojson,
 * Natural Earth 110 m) or inside the drawn box. Raw, uncorrected NRT data.
 */
import type { Bbox } from "@/lib/aoi";

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

export type HotspotArea = { kind: "country"; name: string } | { kind: "box"; bbox: Bbox };
/** Returns a cell filter for the area, or null when the country has no outline in the 110 m map. */
export async function areaFilter(area: HotspotArea): Promise<((lat: number, lon: number) => boolean) | null> {
  if (area.kind === "box") return (lat, lon) => inBox(area.bbox, lon, lat);
  const rings = (await outlines()).get(neName(area.name));
  return rings ? (lat, lon) => inside(rings, lon, lat) : null;
}
