"use client";

import { getCalendar, getParams, listCountries } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import { fitTag, prettyName, type FitTag } from "@/lib/names";
import type { Bbox } from "@/lib/aoi";
import type { Params } from "@/lib/types";

export type Area = { kind: "country"; name: string } | { kind: "box"; bbox: Bbox; parents: string[] };

export const areaKey = (a: Area) => (a.kind === "country" ? `c:${a.name}` : `b:${a.parents.join(",")}`);
export const areaLabel = (a: Area) =>
  a.kind === "country" ? prettyName(a.name) : `Custom area (${a.bbox.map((v) => v.toFixed(1)).join(", ")})`;

/** Picker tags for every country: pooled fit, or raw only (too sparse to fit). */
export function tagsFor(params: Params | null | undefined, names: string[]): Record<string, FitTag | null> {
  return Object.fromEntries(names.map((n) => [n, fitTag(params, n)]));
}

/** Raw + harmonized calendars for an area, plus the published fit and the country list. */
export function useAreaData(area: Area) {
  return useParquet(async () => {
    const scope = area.kind === "country" ? "country" : "h3_parent";
    const keys = area.kind === "country" ? [area.name] : area.parents;
    const [raw, harmonized, params, countries] = await Promise.all([
      getCalendar({ scope, keys, mode: "raw" }),
      getCalendar({ scope, keys, mode: "harmonized" }),
      getParams(),
      listCountries(),
    ]);
    return { raw, harmonized, params, countries, tags: tagsFor(params, countries) };
  }, areaKey(area));
}
