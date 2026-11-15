"use client";

import { getAreaData, getCalendar, getParams, listCountries } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import { fitTag, prettyName, type FitTag } from "@/lib/names";
import { geomCells, ringToParam, res1Of, type AreaGeom, type Bbox, type Ring } from "@/lib/aoi";
import type { AreaData, Params } from "@/lib/types";

/**
 * A country, or a drawn/typed area on the H3 res-4 grid. `cells` are the cells
 * whose centre lies inside the area (lib/aoi.ts geomCells); `fallback` means
 * the area held no cell centre and the cell under its centre is used.
 */
export type Area =
  | { kind: "country"; name: string }
  | { kind: "box"; bbox: Bbox; cells: string[]; fallback: boolean }
  | { kind: "polygon"; ring: Ring; cells: string[]; fallback: boolean };

export type DrawnArea = Exclude<Area, { kind: "country" }>;

export function makeArea(g: AreaGeom): DrawnArea {
  const { cells, fallback } = geomCells(g);
  return g.kind === "box" ? { kind: "box", bbox: g.bbox, cells, fallback } : { kind: "polygon", ring: g.ring, cells, fallback };
}

export const geomOf = (a: DrawnArea): AreaGeom => (a.kind === "box" ? { kind: "box", bbox: a.bbox } : { kind: "polygon", ring: a.ring });

export const areaKey = (a: Area) =>
  a.kind === "country" ? `c:${a.name}` : a.kind === "box" ? `b:${a.bbox.join(",")}` : `p:${ringToParam(a.ring)}`;
export const areaLabel = (a: Area) =>
  a.kind === "country" ? prettyName(a.name)
    : a.kind === "box" ? `Custom area (${a.bbox.map((v) => v.toFixed(1)).join(", ")})`
      : `Custom polygon (${a.ring.length} corners)`;

/** Picker tags for every country: pooled fit, or raw only (no fit; reason in coverage_status.json). */
export function tagsFor(params: Params | null | undefined, names: string[]): Record<string, FitTag | null> {
  return Object.fromEntries(names.map((n) => [n, fitTag(params, n)]));
}

/** Raw + harmonized calendars for an area, plus the published fit and the country list. Drawn areas also carry their cell rows. */
export function useAreaData(area: Area) {
  return useParquet(async () => {
    if (area.kind === "country") {
      const [raw, harmonized, params, countries] = await Promise.all([
        getCalendar({ scope: "country", keys: [area.name], mode: "raw" }),
        getCalendar({ scope: "country", keys: [area.name], mode: "harmonized" }),
        getParams(),
        listCountries(),
      ]);
      return { raw, harmonized, params, countries, tags: tagsFor(params, countries), cells: null as AreaData | null };
    }
    const [cells, params, countries] = await Promise.all([getAreaData(area.cells, res1Of(area.cells)), getParams(), listCountries()]);
    return { raw: cells.raw, harmonized: cells.harmonized, params, countries, tags: tagsFor(params, countries), cells };
  }, areaKey(area));
}
