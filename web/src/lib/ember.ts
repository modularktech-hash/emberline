import type { CalendarResult } from "@/lib/types";

/** "Ember" ramp: 8 steps, lightness-monotonic, colour-blind safe. Index 0 = zero. */
export const RAMP = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `var(--seq-${i})`);
export const RAMP_NAME = "Ember · sequential, lightness-ordered";

/** Square-root scale: fire counts are heavy-tailed, a linear ramp hides the season. */
export function rampIndex(value: number | null, max: number): number | null {
  if (value === null) return null;
  if (value <= 0 || max <= 0) return 0;
  return Math.min(7, 1 + Math.floor(Math.sqrt(value / max) * 6.999));
}
/** Lower bound of each ramp step, for the legend. */
export function rampBreaks(max: number): number[] {
  return [1, 2, 3, 4, 5, 6, 7].map((i) => Math.round(((i - 1) / 6.999) ** 2 * max));
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
export const fmt = (v: number | null | undefined) => (v == null ? "—" : full.format(v));
export const fmtCompact = (v: number | null | undefined) => (v == null ? "—" : compact.format(v));
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface YearTotal { year: number; value: number | null }
export function annualTotals(cal: CalendarResult, from: number, to: number): YearTotal[] {
  const out: YearTotal[] = [];
  for (let y = from; y <= to; y += 1) {
    const rows = cal.rows.filter((r) => r.year === y);
    const known = rows.filter((r) => r.value !== null);
    out.push({ year: y, value: known.length ? known.reduce((s, r) => s + (r.value ?? 0), 0) : null });
  }
  return out;
}

/** Mean annual total 2012–2014 over mean 2009–2011: the size of the 2012 step. */
export function stepRatio(totals: YearTotal[]): number | null {
  const mean = (a: number, b: number) => {
    const v = totals.filter((t) => t.year >= a && t.year <= b && t.value !== null).map((t) => t.value as number);
    return v.length === b - a + 1 ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const before = mean(2009, 2011);
  const after = mean(2012, 2014);
  return before && after !== null ? after / before : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}

export function downloadCsv(filename: string, header: Record<string, string>, columns: string[], rows: Array<Array<string | number>>) {
  const lines = [
    ...Object.entries(header).map(([k, v]) => `# ${k}: ${v}`),
    columns.join(","),
    ...rows.map((r) => r.join(",")),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
