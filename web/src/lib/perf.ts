"use client";

import { useSyncExternalStore } from "react";

/**
 * Low-power mode. When the device looks slow, <html data-perf="low"> turns off
 * the remaining decorative effects (nav blur, glass rims, grain, dot wipes,
 * marquee, globe auto-rotate and fire rings). The site stays fully usable.
 *
 * Triggers (any one): `?perf=low` in the URL (sticky for the tab via
 * sessionStorage; `?perf=high` forces full effects), <= 4 logical CPUs, a
 * slow first second of frames (median rAF delta > 24 ms), or a software WebGL
 * renderer reported by the globe (SwiftShader, llvmpipe, ...).
 */

const EVT = "emberline:perf";
let forced: "low" | "high" | null = null;

export function isPerfLow(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.perf === "low";
}

export function setPerfLow(reason: string): void {
  if (typeof document === "undefined" || forced === "high" || isPerfLow()) return;
  document.documentElement.dataset.perf = "low";
  document.documentElement.dataset.perfReason = reason;
  window.dispatchEvent(new Event(EVT));
}

const subscribe = (cb: () => void) => { window.addEventListener(EVT, cb); return () => window.removeEventListener(EVT, cb); };
export function usePerfLow(): boolean {
  return useSyncExternalStore(subscribe, isPerfLow, () => false);
}

/** Runs once on the client, from <PerfMode/> in the root layout. */
export function detectPerf(): () => void {
  try {
    const q = new URLSearchParams(location.search).get("perf");
    if (q === "low" || q === "high") sessionStorage.setItem("perf", q);
    const s = sessionStorage.getItem("perf");
    if (s === "low" || s === "high") forced = s;
  } catch { /* storage blocked: no override */ }
  if (forced === "high") { document.documentElement.dataset.perf = "high"; return () => {}; }
  if (forced === "low") { setPerfLow("forced"); return () => {}; }
  if ((navigator.hardwareConcurrency ?? 8) <= 4) { setPerfLow("cpu"); return () => {}; }

  // Sample one second of frames once the page has settled after load.
  const deltas: number[] = [];
  let raf = 0, last = 0, start = 0;
  const tick = (t: number) => {
    if (last) deltas.push(t - last);
    last = t;
    if (!start) start = t;
    if (t - start < 1000) { raf = requestAnimationFrame(tick); return; }
    const sorted = deltas.sort((a, b) => a - b);
    if (sorted.length && sorted[Math.floor(sorted.length / 2)] > 24) setPerfLow("frames");
  };
  const begin = () => { raf = requestAnimationFrame(tick); };
  const timer = window.setTimeout(begin, 1500);
  return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
}
