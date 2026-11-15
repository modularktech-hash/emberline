"use client";

import { useEffect, useRef } from "react";
import { isPerfLow } from "@/lib/perf";

/**
 * A paper cut-out satellite that stands in front of the page like a pop-up book: a flat shape with
 * a white paper edge, grain and a fold crease, on a paper orbit arc with a small paper flame. It
 * unfolds from its fold line when it scrolls into view, sways gently, and its shadow on the page
 * shifts with the pointer and with scroll, as if the light moved. Static, with a fixed shadow,
 * under reduced motion and in low-power mode.
 */
export function PaperCutout({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = () => isPerfLow() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.querySelector<HTMLElement>(".paper")?.setAttribute("data-in", ""); io.disconnect(); } }, { rootMargin: "-40px" });
    io.observe(el);
    let raf = 0, mx = 0.3, visible = true;
    const vis = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    vis.observe(el);
    const apply = () => {
      raf = 0;
      if (!visible || still()) return;
      const r = el.getBoundingClientRect();
      const sy = (r.top + r.height / 2) / window.innerHeight - 0.5; // -0.5 (top) .. 0.5 (bottom)
      el.style.setProperty("--sx", `${(14 - mx * 22).toFixed(1)}px`);
      el.style.setProperty("--sy", `${(16 + sy * 18).toFixed(1)}px`);
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const move = (e: PointerEvent) => { if (e.pointerType === "mouse") { mx = e.clientX / window.innerWidth; queue(); } };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("scroll", queue, { passive: true });
    return () => { io.disconnect(); vis.disconnect(); cancelAnimationFrame(raf); window.removeEventListener("pointermove", move); window.removeEventListener("scroll", queue); };
  }, []);
  const paper = "var(--surface)", edge = "var(--text-primary)";
  return (
    <div ref={ref} aria-hidden className={`pointer-events-none relative select-none ${className}`} style={{ "--sx": "10px", "--sy": "16px" } as React.CSSProperties}>
      <div className="paper">
        <div className="paper-sway">
          <svg viewBox="0 0 320 300" className="block h-auto w-full overflow-visible" style={{ filter: "drop-shadow(var(--sx) var(--sy) 0 color-mix(in srgb, var(--ink) 16%, transparent))" }}>
            <defs>
              <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
                <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0" />
                <feComposite in2="SourceGraphic" operator="in" />
                <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode /></feMerge>
              </filter>
            </defs>
            <g filter="url(#paper-grain)" stroke={edge} strokeWidth="1.5" strokeLinejoin="round">
              {/* orbit arc, a strip of paper */}
              <path d="M18 232 C 70 96, 230 60, 304 132 L 298 142 C 228 78, 82 110, 30 238 Z" fill={paper} />
              {/* small paper flame at the foot of the arc */}
              <path d="M40 286 C 22 270, 30 252, 42 240 C 44 252, 52 254, 54 244 C 68 258, 66 276, 56 286 Z" fill="var(--ember)" />
              <path d="M44 286 C 38 278, 42 268, 48 262 C 50 270, 56 272, 54 286 Z" fill={paper} />
              {/* satellite: two solar panels and a body, tilted */}
              <g transform="rotate(-18 176 120)">
                <rect x="70" y="100" width="72" height="40" fill={paper} />
                <rect x="210" y="100" width="72" height="40" fill={paper} />
                {[88, 106, 124, 228, 246, 264].map((x) => <line key={x} x1={x} x2={x} y1="100" y2="140" strokeWidth="1" />)}
                <line x1="70" x2="142" y1="120" y2="120" strokeWidth="1" /><line x1="210" x2="282" y1="120" y2="120" strokeWidth="1" />
                <line x1="142" x2="156" y1="120" y2="120" /><line x1="196" x2="210" y1="120" y2="120" />
                <rect x="156" y="92" width="40" height="56" rx="6" fill={paper} />
                <circle cx="176" cy="156" r="9" fill="var(--ink)" stroke="none" />
                <circle cx="176" cy="156" r="3.2" fill="var(--red)" stroke="none" />
                <line x1="176" x2="176" y1="92" y2="74" /><circle cx="176" cy="70" r="4" fill={paper} />
                {/* fold crease */}
                <line x1="156" x2="196" y1="120" y2="120" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
