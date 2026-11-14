"use client";

import { useEffect, useRef, useState } from "react";
import { bboxToParents, validateBoxInput, type BoxField } from "@/lib/aoi";
import type { Area } from "@/lib/useArea";

/**
 * E08: page selections in the query string, restored on load, refresh and
 * back/forward. Uses window.location and the native History API (which the
 * App Router integrates with) instead of useSearchParams, so the statically
 * prerendered pages need no Suspense boundary and keep their initial HTML.
 *
 * `read` applies a query string to state (called on mount and on popstate);
 * `write` returns the query for the current state. The first write after
 * mount replaces the entry; later changes push one, so Back restores the
 * previous selection.
 */
export function useUrlState(read: (q: URLSearchParams) => void, write: () => Record<string, string | number | null | undefined>, deps: unknown[]): boolean {
  const [ready, setReady] = useState(false);
  const pushed = useRef(false);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });

  useEffect(() => {
    readRef.current(new URLSearchParams(window.location.search));
    // The URL is external state that only exists on the client; reading it once on mount is the intent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    const onPop = () => readRef.current(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(write())) if (v != null && v !== "") q.set(k, String(v));
    const next = q.toString();
    if (next === window.location.search.replace(/^\?/, "")) return;
    const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
    if (pushed.current) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
    pushed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);

  return ready;
}

/** Integer in [lo, hi], else null. */
export function intParam(q: URLSearchParams, k: string, lo: number, hi: number): number | null {
  const s = q.get(k);
  if (s == null || !/^-?\d+$/.test(s)) return null;
  const v = Number(s);
  return v >= lo && v <= hi ? v : null;
}

/** Area as query params: `country=Canada`, or `box=west,south,east,north` (west > east crosses the antimeridian). */
export function areaToQuery(a: Area): Record<string, string | null> {
  return a.kind === "country" ? { country: a.name, box: null } : { country: null, box: a.bbox.map((v) => +v.toFixed(4)).join(",") };
}

export type AreaFromQuery =
  | { ok: true; area: Area; fields?: string[] }
  | { ok: false; fields: string[]; fieldErrors: Partial<Record<BoxField, string>>; message: string }
  | null;

/** Parse the area params through the same validation as typed bounds; an invalid box never becomes a query. */
export function areaFromQuery(q: URLSearchParams): AreaFromQuery {
  const box = q.get("box");
  if (box != null) {
    const fields = box.split(",").map((s) => s.trim());
    while (fields.length < 4) fields.push("");
    const check = validateBoxInput(fields.slice(0, 4));
    if (!check.ok) return { ok: false, fields: fields.slice(0, 4), fieldErrors: check.fieldErrors, message: `Link: ${check.message}` };
    return { ok: true, area: { kind: "box", bbox: check.bbox, parents: bboxToParents(check.bbox) }, fields: fields.slice(0, 4) };
  }
  const c = q.get("country");
  if (c && /^[^\u0000-\u001f<>]{1,80}$/.test(c)) return { ok: true, area: { kind: "country", name: c } };
  return null;
}
