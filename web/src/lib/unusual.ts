/**
 * The most unusual month of a monthly series: the month with the highest
 * percentile within its own calendar month over `years` (share of those years
 * with a strictly lower value; a missing month counts as 0), ties broken by the
 * excess over that calendar month's median. The reference (median, min, max,
 * next highest) is the other years of that calendar month, the month itself
 * excluded. Same rule as
 * scripts/build_proof.py unusual_month. Historical context, not a prediction.
 */
import { median } from "@/lib/ember";

export interface Unusual { year: number; month: number; value: number; median: number; min: number; max: number; nextHighest: number; rank: number; nYears: number; nRef: number }

export function mostUnusualMonth(rows: Array<{ year: number; month: number; value: number | null }>, years: [number, number]): Unusual | null {
  const v = new Map<number, number>();
  for (const r of rows) if (r.value != null && r.year >= years[0] && r.year <= years[1]) v.set(r.year * 12 + r.month - 1, r.value);
  if (!v.size) return null;
  let best: { key: [number, number]; u: Unusual } | null = null;
  for (const [t, value] of v) {
    const year = Math.floor(t / 12), month = (t % 12) + 1;
    const same: number[] = [];
    for (let y = years[0]; y <= years[1]; y += 1) same.push(v.get(y * 12 + month - 1) ?? 0);
    const med = median(same) ?? 0;
    const key: [number, number] = [same.filter((x) => x < value).length / same.length, value - med];
    if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1])) {
      const others = same.filter((_, i) => years[0] + i !== year).sort((a, b) => a - b);
      best = { key, u: { year, month, value, median: median(others) ?? 0, min: others[0] ?? 0, max: others[others.length - 1] ?? 0, nextHighest: others[others.length - 1] ?? 0, rank: 1 + same.filter((x) => x > value).length, nYears: same.length, nRef: others.length } };
    }
  }
  return best?.u ?? null;
}
