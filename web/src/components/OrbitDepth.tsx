"use client";

import { useEffect, useRef } from "react";
import { isPerfLow } from "@/lib/perf";
import { SAT_COLORS } from "@/lib/sats";

/**
 * Five orbits as stacked layers. Each layer shifts by a different amount with the pointer and with
 * scroll, so the stack reads as depth. Illustrative (not to scale); still under reduced motion and
 * in low-power mode.
 */
const SATS = ["Terra", "Aqua", "Suomi-NPP", "NOAA-20", "NOAA-21"];

export function OrbitDepth({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0, mx = 0, my = 0;
    const apply = () => {
      raf = 0;
      if (isPerfLow() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const r = el.getBoundingClientRect();
      const sy = (r.top + r.height / 2) / window.innerHeight - 0.5;
      el.style.setProperty("--px", mx.toFixed(3));
      el.style.setProperty("--py", (my + sy).toFixed(3));
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const move = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; queue(); };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("scroll", queue, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("pointermove", move); window.removeEventListener("scroll", queue); };
  }, []);
  return (
    <div ref={ref} aria-hidden className={`relative aspect-square ${className}`} style={{ "--px": 0, "--py": 0 } as React.CSSProperties}>
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full"><circle cx="100" cy="100" r="34" fill="var(--surface-alt)" stroke="var(--text-primary)" strokeWidth="1.5" /><circle cx="100" cy="100" r="34" fill="none" stroke="var(--grey-2)" strokeDasharray="1 5" strokeLinecap="round" /></svg>
      {SATS.map((name, i) => {
        const depth = (i + 1) * 7;
        return (
          <svg key={name} viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" style={{ transform: `translate(calc(var(--px) * ${depth}px), calc(var(--py) * ${depth}px))`, transition: "transform 240ms cubic-bezier(.2,.8,.2,1)" }}>
            <g transform={`rotate(${-40 + i * 22} 100 100)`}>
              <ellipse cx="100" cy="100" rx={50 + i * 9} ry={(50 + i * 9) * 0.34} fill="none" stroke="var(--grey-2)" strokeWidth="1" strokeDasharray="1.5 4" strokeLinecap="round" />
              <circle cx={100 + 50 + i * 9} cy="100" r="4" fill={SAT_COLORS[name] ?? "var(--text-primary)"} stroke="var(--surface)" strokeWidth="1.5" />
            </g>
          </svg>
        );
      })}
    </div>
  );
}
