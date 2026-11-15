"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { NAV, ROUTE_NAME } from "@/lib/nav";
import { isPerfLow } from "@/lib/perf";
import { setCovering } from "@/lib/transition";

/**
 * Page curtain. An internal link click is intercepted; ink spreads from the click point behind a
 * leading edge of dots, the destination's name appears in dot-matrix, the route is pushed while the
 * screen is covered, and the curtain dissolves back into dots once the new page has committed.
 * In, hold and out together stay within about 520 ms when the page is ready. A safety timer lifts it
 * after SAFETY_MS whatever happens.
 *
 * Not intercepted (the browser or <Link> handles them as usual): modified or non-primary clicks,
 * target=_blank, download links, other origins, hash-only or same-path links, back/forward, the
 * first page load, and reduced motion or low-power mode (instant navigation). The curtain is
 * aria-hidden and takes no focus; scroll-to-top and the route announcer work unchanged.
 */

const IN_MS = 200, MIN_MS = 100, OUT_MS = 220, SAFETY_MS = 2500;

type Phase = "idle" | "in" | "hold" | "out";

function labelFor(path: string): { group: string; title: string } {
  for (const g of NAV) for (const it of g.items) if (it.href === path) return { group: g.label, title: ROUTE_NAME[path] ?? it.label.toUpperCase() };
  return { group: "Emberline", title: ROUTE_NAME[path] ?? "EMBERLINE" };
}

export function RouteTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState({ group: "", title: "" });
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const target = useRef<string | null>(null);
  const coveredAt = useRef(0);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const lift = useCallback(() => {
    clear();
    go("out");
    timers.current.push(window.setTimeout(() => { go("idle"); setCovering(false); target.current = null; }, OUT_MS));
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.hasAttribute("download") || (a.target && a.target !== "_self")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname) return; // same page or hash-only: default behaviour
      if (/\.(parquet|json|csv|png|svg|pdf)$/i.test(url.pathname)) return; // files
      if (isPerfLow() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // instant
      e.preventDefault();
      e.stopPropagation(); // <Link>'s own handler would navigate immediately
      const dest = url.pathname + url.search + url.hash;
      setLabel(labelFor(url.pathname));
      setOrigin({ x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 });
      target.current = url.pathname;
      setCovering(true);
      clear();
      // Safety: the curtain can never stay down longer than this.
      timers.current.push(window.setTimeout(lift, SAFETY_MS));
      if (phaseRef.current === "hold" || phaseRef.current === "in") {
        // Already covered (a quick second click): navigate straight away.
        coveredAt.current = performance.now();
        router.push(dest);
        go("hold");
        return;
      }
      go("in");
      timers.current.push(window.setTimeout(() => {
        coveredAt.current = performance.now();
        router.push(dest);
        go("hold");
      }, IN_MS));
    };
    window.addEventListener("click", onClick, true); // capture: before <Link>'s handler
    return () => { window.removeEventListener("click", onClick, true); clear(); };
  }, [router, lift]);

  // Lift once the new route has committed and the label had its minimum time on screen.
  useEffect(() => {
    if (phase !== "hold" || !target.current || pathname !== target.current) return;
    const wait = Math.max(0, MIN_MS - (performance.now() - coveredAt.current));
    const t = window.setTimeout(lift, wait);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [phase, pathname, lift]);

  if (phase === "idle") return null;
  const out = phase === "out";
  const at = `${origin.x.toFixed(1)}% ${origin.y.toFixed(1)}%`;
  const covered = phase === "hold";
  // The ink disc and, just ahead of it, a ring of dots. Out: the ink fades first, the dots last.
  const disc = (lead: number, ms: number): React.CSSProperties => ({
    clipPath: phase === "in" ? `circle(0% at ${at})` : `circle(${150 + lead}% at ${at})`,
    transition: `clip-path ${ms}ms cubic-bezier(.65,0,.35,1), opacity ${OUT_MS}ms cubic-bezier(.2,.8,.2,1) ${out && lead ? 90 : 0}ms`,
  });
  return (
    <div key={label.title} aria-hidden className="pointer-events-auto fixed inset-0 z-[100]" data-curtain={phase}>
      <div className="absolute inset-0" ref={(el) => { if (el && phase === "in") requestAnimationFrame(() => { el.style.clipPath = `circle(165% at ${at})`; }); }}
        style={{ ...disc(15, IN_MS), opacity: out ? 0 : 1, backgroundImage: "radial-gradient(circle, var(--ink) 3.2px, transparent 3.8px)", backgroundSize: "12px 12px" }} />
      <div className="absolute inset-0 bg-[var(--ink)]" ref={(el) => { if (el && phase === "in") requestAnimationFrame(() => { el.style.clipPath = `circle(150% at ${at})`; }); }}
        style={{ ...disc(0, IN_MS + 40), opacity: out ? 0 : 1 }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-[var(--on-ink)]"
        style={{ opacity: covered ? 1 : 0, transition: `opacity ${out ? 120 : 160}ms ease ${phase === "in" ? 120 : 0}ms` }}
        ref={(el) => { if (el && phase === "in") requestAnimationFrame(() => { el.style.opacity = "1"; }); }}>
        <p className="font-mono text-[11px] uppercase tracking-[0.32em] opacity-60">{label.group}</p>
        <p className="dot-num mt-3 text-[clamp(2.4rem,9vw,6rem)] leading-none tracking-[0.08em]">{label.title}</p>
        <span className="mt-6 flex items-center gap-2"><span className="live-dot" /><span className="h-2 w-2 rounded-full bg-[var(--on-ink)] opacity-30" /><span className="h-2 w-2 rounded-full bg-[var(--on-ink)] opacity-30" /></span>
      </div>
    </div>
  );
}
