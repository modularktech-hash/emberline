/**
 * Colour scale for the burning activity calendar.
 *
 * Ramp: Magma (Smith & van der Walt, matplotlib), from the viridis family:
 * perceptually uniform, lightness rises monotonically, readable under the
 * common colour-vision deficiencies. Each theme uses the slice whose
 * near-zero end recedes toward the surface:
 *   light -- pale (near zero) to deep purple (most activity)
 *   dark  -- deep purple (near zero) to pale (most activity)
 *
 * Scale: square root. Monthly counts span four orders of magnitude; a linear
 * scale would leave everything but the peak fire month in the lightest
 * step. sqrt keeps the quiet months and the peaks both readable while still
 * being a monotone, explainable mapping (and unlike log, zero is defined).
 *
 * The domain is shared by the raw and harmonized series for the area, so
 * the toggle is an honest visual comparison.
 */

export type Theme = "light" | "dark";

/** Magma control points, t = 0, 0.1, ... 1 (matplotlib _magma_data). */
const MAGMA = [
  "#000004",
  "#140e36",
  "#3b0f70",
  "#641a80",
  "#8c2981",
  "#b73779",
  "#de4968",
  "#f7705c",
  "#fe9f6d",
  "#fecf92",
  "#fcfdbf",
].map(hexToRgb);

export const RAMP_NAME = "Magma";

/** Slice of the ramp used per theme: [t at value min, t at value max]. */
const SLICE: Record<Theme, [number, number]> = {
  light: [0.98, 0.12],
  dark: [0.14, 0.98],
};

/** Neutral fill under the "no data" hatch. Never a ramp colour. */
export const MISSING_FILL: Record<Theme, string> = {
  light: "#e6e5e0",
  dark: "#2c2c2a",
};
export const MISSING_HATCH: Record<Theme, string> = {
  light: "#9a9892",
  dark: "#6b6a65",
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Magma at t in [0, 1]. */
export function magma(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (MAGMA.length - 1);
  const i = Math.min(MAGMA.length - 2, Math.floor(x));
  const f = x - i;
  const a = MAGMA[i];
  const b = MAGMA[i + 1];
  return toHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

export interface SqrtScale {
  min: number;
  max: number;
  /** Position of a value along the ramp, 0..1. */
  position: (value: number) => number;
  /** Inverse of position: the value at ramp position p. */
  valueAt: (p: number) => number;
  color: (value: number, theme: Theme) => string;
  /** Colour at ramp position p, for the legend gradient. */
  colorAt: (p: number, theme: Theme) => string;
}

export function sqrtScale(min: number, max: number): SqrtScale {
  const lo = Math.sqrt(Math.max(0, min));
  const hi = Math.sqrt(Math.max(0, max));
  const span = hi - lo;
  const position = (value: number) =>
    span > 0 ? Math.max(0, Math.min(1, (Math.sqrt(Math.max(0, value)) - lo) / span)) : 0;
  const colorAt = (p: number, theme: Theme) => {
    const [a, b] = SLICE[theme];
    return magma(a + (b - a) * p);
  };
  return {
    min,
    max,
    position,
    valueAt: (p) => (lo + span * p) ** 2,
    color: (value, theme) => colorAt(position(value), theme),
    colorAt,
  };
}
