"use client";

import { useEffect } from "react";

/**
 * The one delegated effect left: a small confetti burst when a CSV download
 * starts. It runs once per click, never on pointer movement (pointer-follow
 * effects were removed in the performance pass: they cost frames on slow
 * compositors and the native cursor is always in sync).
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
