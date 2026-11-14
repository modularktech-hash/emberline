"use client";

import Lenis from "lenis";
import { motion, useScroll, useSpring } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Lenis smooth scrolling (skipped for reduced motion and touch, where native
 * scrolling is better) plus a thin ember scroll-progress bar. Inner scrollers
 * (tables, menus, maps, globes) opt out with data-lenis-prevent or are
 * excluded by the prevent() filter below.
 */
export function SmoothScroll() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(pointer: coarse)").matches) return;
    const lenis = new Lenis({
      lerp: 0.11,
      wheelMultiplier: 1,
      prevent: (n) => !!(n as HTMLElement).closest?.(".maplibregl-map, canvas, [data-lenis-prevent], .overflow-auto, .overflow-x-auto, .overflow-y-auto"),
    });
    let raf = requestAnimationFrame(function loop(t) { lenis.raf(t); raf = requestAnimationFrame(loop); });
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  return <motion.div aria-hidden style={{ scaleX }} className="scroll-progress" />;
}
