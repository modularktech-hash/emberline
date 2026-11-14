"use client";

import { useEffect } from "react";
import { finePointer } from "@/lib/motion";

/**
 * Delegated pointer effects, so no component needs restructuring:
 * - [data-magnetic]: the element leans toward the pointer (max ~6px).
 * - .card, .tilt: a small cursor-follow 3D tilt (max 3deg).
 * Fine pointers with motion allowed only. Transforms are written to CSS vars
 * (--mgx/--mgy, --rx/--ry) that globals.css composes, so hover/active
 * transforms keep working.
 */
export function Interactions() {
  useEffect(() => {
    let last: HTMLElement | null = null;
    const down = (e: PointerEvent) => { last = (e.target as HTMLElement | null)?.closest?.("button, a") as HTMLElement | null; };
    const dl = () => burst(last ?? (document.activeElement as HTMLElement | null));
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("emberline:download", dl);
    return () => { window.removeEventListener("pointerdown", down); window.removeEventListener("emberline:download", dl); };
  }, []);
  useEffect(() => {
    if (!finePointer()) return;
    let cur: HTMLElement | null = null, curT: HTMLElement | null = null, raf = 0;
    const reset = (el: HTMLElement | null, ...vars: string[]) => vars.forEach((v) => el?.style.removeProperty(v));
    const move = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      const m = t?.closest?.("[data-magnetic]") as HTMLElement | null;
      const c = t?.closest?.(".card, .tilt") as HTMLElement | null;
      if (m !== cur) { reset(cur, "--mgx", "--mgy"); cur = m; }
      if (c !== curT) { reset(curT, "--rx", "--ry"); curT = c; }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (m) {
          const r = m.getBoundingClientRect();
          m.style.setProperty("--mgx", `${((e.clientX - r.left) / r.width - 0.5) * 12}px`);
          m.style.setProperty("--mgy", `${((e.clientY - r.top) / r.height - 0.5) * 10}px`);
        }
        if (c && c.offsetWidth < 900) {
          const r = c.getBoundingClientRect();
          c.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 5}deg`);
          c.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 5}deg`);
        }
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);
  return null;
}

/** A tiny hand-rolled confetti burst of ember dots from an element. */
export function burst(from: HTMLElement | null) {
  if (!from || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = from.getBoundingClientRect();
  const colors = ["#d9431a", "#f49b3f", "#f9c46b", "#121715", "#ff7aa8"];
  for (let i = 0; i < 18; i++) {
    const s = document.createElement("span");
    const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const d = 40 + Math.random() * 50;
    s.className = "confetti";
    s.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;background:${colors[i % colors.length]};`;
    document.body.appendChild(s);
    s.animate(
      [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
       { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 24}px)) scale(0.3) rotate(${Math.random() * 360}deg)`, opacity: 0 }],
      { duration: 700 + Math.random() * 300, easing: "cubic-bezier(0.22,1,0.36,1)" },
    ).onfinish = () => s.remove();
  }
}
