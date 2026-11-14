"use client";

import { getCalendar, getParams, listCountries, listParentCells } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import type { Bbox } from "@/lib/aoi";

export type Area = { kind: "country"; name: string } | { kind: "box"; bbox: Bbox; parents: string[] };

export const areaKey = (a: Area) => (a.kind === "country" ? `c:${a.name}` : `b:${a.parents.join(",")}`);
export const areaLabel = (a: Area) =>
  a.kind === "country" ? a.name : `Custom area (${a.bbox.map((v) => v.toFixed(1)).join(", ")})`;

/** Raw + harmonized calendars for an area, plus the published fit. */
export function useAreaData(area: Area) {
  return useParquet(async () => {
    const scope = area.kind === "country" ? "country" : "h3_parent";
    const keys = area.kind === "country" ? [area.name] : area.parents;
    const [raw, harmonized, params, countries, parents] = await Promise.all([
      getCalendar({ scope, keys, mode: "raw" }),
      getCalendar({ scope, keys, mode: "harmonized" }),
      getParams(),
      listCountries(),
      listParentCells(),
    ]);
    return { raw, harmonized, params, countries, parents };
  }, areaKey(area));
}
