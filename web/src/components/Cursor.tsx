"use client";

import { useEffect, useRef, useState } from "react";
import { finePointer } from "@/lib/motion";

/**
 * Dot + lerped ring cursor. Fine pointers with motion allowed only; the native
 * cursor is hidden (via html.has-cursor) only once this is actually running.
 * Elements can set data-cursor="Label" to show a contextual label.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState("");
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!finePointer()) return;
    const root = document.documentElement;
    let x = -100, y = -100, rx = -100, ry = -100, raf = 0, seen = false;
    const loop = () => {
      rx += (x - rx) * 0.18; ry += (y - ry) * 0.18;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      raf = requestAnimationFrame(loop);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX; y = e.clientY;
      if (!seen) { seen = true; rx = x; ry = y; setOn(true); root.classList.add("has-cursor"); }
      const t = e.target as HTMLElement | null;
      const tagged = t?.closest?.("[data-cursor]") as HTMLElement | null;
      const hot = !!t?.closest?.("a, button, [role=button], select, label, summary");
      const text = !!t?.closest?.("input, textarea, [contenteditable]");
      ring.current?.setAttribute("data-state", tagged ? "label" : text ? "text" : hot ? "hot" : "");
      setLabel(tagged?.dataset.cursor ?? "");
    };
    const leave = () => ring.current?.setAttribute("data-state", "gone");
    const down = () => ring.current?.setAttribute("data-press", "1");
    const up = () => ring.current?.removeAttribute("data-press");
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      root.classList.remove("has-cursor");
    };
  }, []);

  if (!on) return <><div ref={dot} hidden /><div ref={ring} hidden /></>;
  return (
    <>
      <div ref={ring} aria-hidden className="cursor-ring"><span>{label}</span></div>
      <div ref={dot} aria-hidden className="cursor-dot" />
    </>
  );
}
