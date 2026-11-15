/**
 * The most unusual month of a monthly series: the month with the highest
 * percentile within its own calendar month over `years` (share of those years
 * with a strictly lower value; a missing month counts as 0), ties broken by the
 * excess over that calendar month's median. The reference (median, min, max,
 * next highest) is the other years of that calendar month, the month itself
 * excluded. Same rule as scripts/build_proof.py unusual_month. Historical
 * context, not a prediction.
 */
import { median } from "@/lib/ember";

export interface Unusual { year: number; month: number; value: number; median: number; min: number; max: number; nextHighest: number; rank: number; nYears: number; nRef: number }

type Row = { year: number; month: number; value: number | null };

function byMonth(rows: Row[], years: [number, number]): Map<number, number> {
  const v = new Map<number, number>();
  for (const r of rows) if (r.value != null && r.year >= years[0] && r.year <= years[1]) v.set(r.year * 12 + r.month - 1, r.value);
  return v;
}

function context(v: Map<number, number>, years: [number, number], year: number, month: number): Unusual {
  const value = v.get(year * 12 + month - 1) ?? 0;
  const same: number[] = [];
  for (let y = years[0]; y <= years[1]; y += 1) same.push(v.get(y * 12 + month - 1) ?? 0);
  const others = same.filter((_, i) => years[0] + i !== year).sort((a, b) => a - b);
  return {
    year, month, value, median: median(others) ?? 0, min: others[0] ?? 0, max: others[others.length - 1] ?? 0,
    nextHighest: others[others.length - 1] ?? 0, rank: 1 + same.filter((x) => x > value).length, nYears: same.length, nRef: others.length,
  };
}

/** One month against the other years of the same calendar month (that year excluded from the reference). */
export function monthContext(rows: Row[], years: [number, number], year: number, month: number): Unusual | null {
  const v = byMonth(rows, years);
  if (!v.size || year < years[0] || year > years[1]) return null;
  return context(v, years, year, month);
}

export function mostUnusualMonth(rows: Row[], years: [number, number]): Unusual | null {
  const v = byMonth(rows, years);
  if (!v.size) return null;
  let best: { key: [number, number]; t: number } | null = null;
  for (const [t, value] of v) {
    const month = (t % 12) + 1;
    const same: number[] = [];
    for (let y = years[0]; y <= years[1]; y += 1) same.push(v.get(y * 12 + month - 1) ?? 0);
    const key: [number, number] = [same.filter((x) => x < value).length / same.length, value - (median(same) ?? 0)];
    if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1])) best = { key, t };
  }
  return best ? context(v, years, Math.floor(best.t / 12), (best.t % 12) + 1) : null;
}
