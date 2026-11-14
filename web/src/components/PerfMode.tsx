"use client";

import { useEffect } from "react";
import { detectPerf } from "@/lib/perf";

/** Decides once per page load whether to run in low-power mode (see lib/perf.ts). */
export function PerfMode() {
  useEffect(() => detectPerf(), []);
  return null;
}
