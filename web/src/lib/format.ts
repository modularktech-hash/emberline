/**
 * Display formatting for published fit values. Every value the method page
 * shows passes through one of these, so rounding is consistent and a missing
 * value always reads "not computed" rather than a placeholder.
 */

export const NOT_COMPUTED = "not computed";

const MINUS = "−";

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Fixed decimals with a true minus sign. Zero is never signed. */
function fixed(x: number, dp: number, signed = false): string {
  const s = Math.abs(x).toFixed(dp);
  const isZero = Number(s) === 0;
  if (x < 0 && !isZero) return `${MINUS}${s}`;
  if (signed && !isZero) return `+${s}`;
  return s;
}

/** Coefficient of determination: 2 dp. */
export function fmtR2(x: unknown): string {
  return isNum(x) ? fixed(x, 2) : NOT_COMPUTED;
}

/** Signed percentage, 1 dp (bias). */
export function fmtSignedPct(x: unknown): string {
  return isNum(x) ? `${fixed(x, 1, true)}%` : NOT_COMPUTED;
}

/** A fraction in [0, 1] shown as a percentage, 1 dp (match rate). */
export function fmtFractionPct(x: unknown): string {
  return isNum(x) ? `${fixed(x * 100, 1)}%` : NOT_COMPUTED;
}

/** Fire radiative power, 1 dp. */
export function fmtMw(x: unknown): string {
  return isNum(x) ? `${fixed(x, 1)} MW` : NOT_COMPUTED;
}

/** A ratio, 2 dp with a multiplication sign. */
export function fmtRatio(x: unknown): string {
  return isNum(x) ? `${fixed(x, 2)}×` : NOT_COMPUTED;
}

/** Plain number with a fixed number of decimals (RMSE, kappa). */
export function fmtDecimal(x: unknown, dp: number): string {
  return isNum(x) ? fixed(x, dp) : NOT_COMPUTED;
}

/** A count, rounded to an integer, with thousands separators. */
export function fmtCount(x: unknown): string {
  return isNum(x)
    ? Math.round(x).toLocaleString("en-US").replace("-", MINUS)
    : NOT_COMPUTED;
}

/** Local solar time in decimal hours, 2 dp. */
export function fmtHours(x: unknown): string {
  return isNum(x) ? `${fixed(x, 2)} h` : NOT_COMPUTED;
}

/** A calendar year: no thousands separator. */
export function fmtYear(x: unknown): string {
  return isNum(x) ? String(Math.round(x)) : NOT_COMPUTED;
}

/** An inclusive year span, e.g. a [first, last] pair. */
export function fmtYearSpan(span: unknown): string {
  if (!Array.isArray(span) || span.length !== 2 || !isNum(span[0]) || !isNum(span[1])) {
    return NOT_COMPUTED;
  }
  return span[0] === span[1] ? fmtYear(span[0]) : `${fmtYear(span[0])}–${fmtYear(span[1])}`;
}

/** A 95% interval rendered with the given formatter for each end. */
export function fmtCi(ci: unknown, f: (x: unknown) => string): string {
  if (!Array.isArray(ci) || ci.length !== 2 || !isNum(ci[0]) || !isNum(ci[1])) {
    return NOT_COMPUTED;
  }
  return `${f(ci[0])} to ${f(ci[1])}`;
}

/** Min and max of the finite numbers in a list, or null if there are none. */
export function extent(values: unknown[]): [number, number] | null {
  const xs = values.filter(isNum);
  if (xs.length === 0) return null;
  return [Math.min(...xs), Math.max(...xs)];
}
