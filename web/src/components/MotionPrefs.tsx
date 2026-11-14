"use client";

import { MotionConfig, MotionGlobalConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";

/**
 * E25: honour prefers-reduced-motion for every JS (Motion) animation, not only CSS.
 * When the user asks for reduced motion, Motion jumps straight to each animation's final
 * values (`skipAnimations`), so the raw→harmonized transition, page fade, hero words, nav
 * pills and satellite springs show their end state immediately. Set at module load so the
 * first paint after hydration is already still, and kept in sync if the setting changes.
 */
const QUERY = "(prefers-reduced-motion: reduce)";
const apply = (reduce: boolean) => { MotionGlobalConfig.skipAnimations = reduce; };
if (typeof window !== "undefined" && window.matchMedia) apply(window.matchMedia(QUERY).matches);

export function MotionPrefs({ children }: { children: ReactNode }) {
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => apply(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
