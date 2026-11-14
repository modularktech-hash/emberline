"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EASE, EASE_IN_OUT } from "@/lib/motion";
import { NAV } from "@/lib/nav";
import { isPerfLow } from "@/lib/perf";
import { setCovering } from "@/lib/transition";

/**
 * Named page transition. An internal link click is intercepted, an ink
 * curtain slides up over the page and names the destination ("EXPLORE /
 * Calendar explorer") with a filling dot row, the route is pushed while the
 * screen is covered, and the curtain lifts once the new pathname has
 * committed and it has been on screen at least MIN_MS. A safety timer lifts it
 * after SAFETY_MS whatever happens.
 *
 * Not intercepted (the browser or <Link> handles them as usual): modified or
 * non-primary clicks, target=_blank, download links, other origins, hash-only
 * or same-path links, back/forward (popstate never reaches here), the first
 * page load, and reduced motion or low-power mode (instant navigation).
 * The curtain is aria-hidden and takes no focus; Next's scroll-to-top and
 * route announcer work unchanged. <Link> prefetching is untouched.
 */

const IN_MS = 350, MIN_MS = 500, OUT_MS = 450, SAFETY_MS = 2500;
const DOTS = 14;

type Phase = "idle" | "in" | "hold" | "out";

function labelFor(path: string, text: string): { group: string; title: string } {
  if (path === "/") return { group: "Home", title: "Emberline" };
  for (const g of NAV) for (const it of g.items) if (it.href === path) return { group: g.label, title: it.label };
  if (path === "/about") return { group: "About", title: "About Emberline" };
  return { group: "Emberline", title: text.trim().replace(/\s+/g, " ").replace(/[→↗]/g, "").trim() || "Emberline" };
}

export function RouteTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState({ group: "", title: "" });
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
      setLabel(labelFor(url.pathname, a.textContent ?? ""));
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

  const words = label.title.split(" ");
  return (
    <AnimatePresence>
      {phase !== "idle" && (
        <motion.div
          key="curtain"
          aria-hidden
          className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#121715] text-[#f7f3e8]"
          initial={{ y: "100%" }}
          animate={{ y: phase === "out" ? "-100%" : "0%" }}
          exit={{ y: "-100%" }}
          transition={{ duration: (phase === "out" ? OUT_MS : IN_MS) / 1000, ease: phase === "out" ? EASE : EASE_IN_OUT }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_380px_at_50%_60%,rgba(230,66,24,0.22),transparent_70%)]" />
          <div className="relative px-6 text-center">
            <motion.p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[#e6a58a]"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.3, ease: EASE }}>
              {label.group}
            </motion.p>
            <p className="display mt-4 text-[clamp(2.25rem,7vw,4.75rem)] leading-[1.02]">
              {words.map((w, i) => (
                <span key={`${label.title}-${i}`} className="inline-block overflow-hidden pb-[0.1em] align-top">
                  <motion.span className="inline-block" initial={{ y: "110%" }} animate={{ y: "0%" }}
                    transition={{ delay: 0.22 + i * 0.07, duration: 0.45, ease: EASE }}>
                    {w}{i < words.length - 1 ? " " : ""}
                  </motion.span>
                </span>
              ))}
            </p>
            <div className="mx-auto mt-7 flex w-max gap-[7px]">
              {Array.from({ length: DOTS }, (_, i) => (
                <motion.span key={i} className="h-[6px] w-[6px] rounded-full bg-[#e64218]"
                  initial={{ opacity: 0.16 }} animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 + (i / DOTS) * 0.55, duration: 0.12 }} />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
