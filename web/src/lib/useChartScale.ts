"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SVG charts here use a fixed viewBox width, so their text shrinks with the
 * screen (10 units at 375 px wide is ~5 px). This measures the rendered width
 * and returns `k`, the factor that keeps a label at its intended CSS size
 * (capped), plus `narrow` so a chart can thin out its ticks on phones.
 */
export function useChartScale(viewBoxWidth: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(viewBoxWidth);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width || viewBoxWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewBoxWidth]);
  const k = Math.min(2.1, Math.max(1, viewBoxWidth / Math.max(1, w)));
  return { ref, k, fs: (px: number) => px * k, narrow: k > 1.35 };
}
