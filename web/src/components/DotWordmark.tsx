"use client";

import { useEffect, useRef } from "react";
import { isPerfLow } from "@/lib/perf";

/**
 * The EMBERLINE wordmark as a field of dots, full width. Dots near the pointer or a touch are
 * pushed away, glow ember, and spring back. Drawn on a canvas, at most one frame per display
 * refresh, only while visible and only while something is moving; static under reduced motion
 * and in low-power mode.
 */
const GLYPH: Record<string, string[]> = {
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  N: ["10001", "11001", "10101", "10101", "10011", "10001", "10001"],
};
const WORD = "EMBERLINE";

export function DotWordmark({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const cols = [...WORD].reduce((n, ch) => n + GLYPH[ch][0].length + 1, -1);
    type Dot = { hx: number; hy: number; x: number; y: number; vx: number; vy: number; heat: number };
    let dots: Dot[] = [], step = 0, rad = 0, W = 0, H = 0, raf = 0, visible = false, moving = false;
    let px = -9999, py = -9999, ink = "#000", ember = "#d9431a";
    const colours = () => { const cs = getComputedStyle(document.documentElement); ink = cs.getPropertyValue("--text-primary").trim() || ink; ember = cs.getPropertyValue("--ember").trim() || ember; };
    const layout = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; step = W / cols; rad = step * 0.36; H = step * 7 + step;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      let cx = 0;
      for (const ch of WORD) {
        const g = GLYPH[ch];
        g.forEach((row, r) => [...row].forEach((v, c) => { if (v === "1") { const hx = (cx + c + 0.5) * step, hy = (r + 1) * step; dots.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0, heat: 0 }); } }));
        cx += g[0].length + 1;
      }
      colours();
      draw();
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const d of dots) {
        ctx.fillStyle = d.heat > 0.04 ? ember : ink;
        ctx.globalAlpha = d.heat > 0.04 ? 0.55 + 0.45 * Math.min(1, d.heat) : 1;
        ctx.beginPath(); ctx.arc(d.x, d.y, rad * (1 + 0.25 * Math.min(1, d.heat)), 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const tick = () => {
      raf = 0;
      const reach = step * 4.2;
      moving = false;
      for (const d of dots) {
        const dx = d.x - px, dy = d.y - py, dist = Math.hypot(dx, dy);
        if (dist < reach && dist > 0.01) { const f = (1 - dist / reach) * step * 0.9; d.vx += (dx / dist) * f; d.vy += (dy / dist) * f; d.heat = Math.max(d.heat, 1 - dist / reach); }
        d.vx += (d.hx - d.x) * 0.12; d.vy += (d.hy - d.y) * 0.12;
        d.vx *= 0.78; d.vy *= 0.78; d.x += d.vx; d.y += d.vy; d.heat *= 0.94;
        if (Math.abs(d.vx) + Math.abs(d.vy) > 0.02 || d.heat > 0.02 || Math.abs(d.x - d.hx) > 0.05) moving = true;
      }
      draw();
      if (moving && visible) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf && visible) raf = requestAnimationFrame(tick); };
    const still = () => isPerfLow() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const move = (e: PointerEvent) => { if (still()) return; const r = cv.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; kick(); };
    const leave = () => { px = py = -9999; kick(); };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!visible) { cancelAnimationFrame(raf); raf = 0; } });
    io.observe(cv);
    const ro = new ResizeObserver(layout);
    ro.observe(cv);
    const theme = () => { colours(); draw(); };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    cv.addEventListener("pointermove", move, { passive: true });
    cv.addEventListener("pointerdown", move, { passive: true });
    cv.addEventListener("pointerleave", leave);
    window.addEventListener("emberline:theme", theme);
    mq.addEventListener("change", theme);
    layout();
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerdown", move); cv.removeEventListener("pointerleave", leave);
      window.removeEventListener("emberline:theme", theme); mq.removeEventListener("change", theme);
    };
  }, []);
  return <canvas ref={ref} role="img" aria-label="Emberline" className={`block w-full touch-pan-y ${className}`} />;
}
