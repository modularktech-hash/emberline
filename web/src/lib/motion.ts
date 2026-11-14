/** Shared motion presets. Mirrors the --ease-* tokens in globals.css. */
export const EASE = [0.22, 1, 0.36, 1] as const; // expo-out: calm settle
export const EASE_SPRINGY = [0.34, 1.56, 0.64, 1] as const; // small overshoot
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const; // tabs, pills
export const SPRING_SOFT = { type: "spring", stiffness: 180, damping: 24 } as const; // cards, reveals
export const SPRING_BOUNCY = { type: "spring", stiffness: 520, damping: 18 } as const; // playful taps

export const finePointer = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
