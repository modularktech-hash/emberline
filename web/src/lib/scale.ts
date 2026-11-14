/**
 * Sequential colour scale for burning activity.
 *
 * FRP is extremely heavy-tailed: a handful of days in a 25-year record carry
 * an order of magnitude more energy than the rest. A linear scale therefore
 * paints almost the entire calendar in the lightest step and puts all the
 * contrast into a few cells, which destroys exactly the seasonal structure
 * the calendar exists to show.
 *
 * Quantile breaks fix that -- each colour step holds a comparable number of
 * active days -- at the cost that the steps are no longer evenly spaced in
 * value. The legend therefore prints the actual break values rather than a
 * smooth gradient bar, so the reader can see the spacing.
 */

/** The six sequential steps, low to high. Index 0 is the near-zero step. */
export const SEQUENTIAL_STEPS = [
  "var(--seq-1)",
  "var(--seq-2)",
  "var(--seq-3)",
  "var(--seq-4)",
  "var(--seq-5)",
  "var(--seq-6)",
] as const;

/** Colour for a day with no recorded activity -- distinct from "a little". */
export const EMPTY_STEP = "var(--seq-0)";

export interface QuantileScale {
  /** Upper bound of each step except the last. Length = steps - 1. */
  breaks: number[];
  /** Map a value to a CSS colour. Null, zero and negatives get the empty step. */
  color: (value: number | null | undefined) => string;
  /** Step index, or -1 for the empty step. */
  step: (value: number | null | undefined) => number;
  max: number;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

/**
 * Build a quantile scale over the positive values only.
 *
 * Zero-activity days are excluded from the quantiles: in most areas of
 * interest they are the majority of the calendar, and letting them define the
 * breaks would collapse every real fire day into the top step.
 */
export function quantileScale(
  values: Array<number | null | undefined>,
  stepCount: number = SEQUENTIAL_STEPS.length,
): QuantileScale {
  const positive = values
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const breaks: number[] = [];
  for (let i = 1; i < stepCount; i += 1) {
    breaks.push(quantile(positive, i / stepCount));
  }

  // Degenerate input (all values equal, or a single active day) collapses the
  // breaks; de-duplicating keeps the legend honest rather than printing the
  // same number several times.
  const unique = [...new Set(breaks)];

  const step = (value: number | null | undefined): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return -1;
    let index = 0;
    while (index < unique.length && value > unique[index]) index += 1;
    return index;
  };

  return {
    breaks: unique,
    step,
    color: (value) => {
      const index = step(value);
      if (index < 0) return EMPTY_STEP;
      return SEQUENTIAL_STEPS[Math.min(index, SEQUENTIAL_STEPS.length - 1)];
    },
    max: positive.length > 0 ? positive[positive.length - 1] : 0,
  };
}

/**
 * Pick one unit for a whole axis and format every tick in it.
 *
 * Per-value formatting produces axes like "1.5 GW / 742 MW / 371 MW", where
 * the reader has to convert between ticks to see the spacing. One unit for the
 * axis, chosen from its largest value, keeps the scale readable at a glance.
 */
export function axisFormatter(
  values: number[],
): (value: number | null | undefined) => string {
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  const [divisor, unit, decimals] =
    max >= 1_000_000
      ? [1_000_000, "TW", 2]
      : max >= 1_000
        ? [1_000, "GW", 2]
        : [1, "MW", max >= 10 ? 0 : 1];

  return (value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "\u2014";
    return `${(value / divisor).toFixed(decimals)} ${unit}`;
  };
}

/** Format a single megawatt figure for tooltips and legends. */
export function formatMw(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} TW`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} GW`;
  if (value >= 10) return `${Math.round(value)} MW`;
  return `${value.toFixed(1)} MW`;
}

const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Day-of-year positions for month gridlines, on a non-leap calendar. */
export const MONTH_TICKS = MONTH_STARTS.map((doy, i) => ({
  doy,
  label: MONTH_LABELS[i],
}));

/** Convert a day-of-year back to an approximate calendar label. */
export function doyToLabel(doy: number, year: number): string {
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(doy);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
