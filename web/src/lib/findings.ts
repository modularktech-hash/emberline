import { fmt } from "@/lib/ember";
import type { CalendarRow } from "@/lib/types";

/**
 * The plain-language findings of the Explorer, computed once and used by the fire report, the
 * critical-periods panel and the downloadable brief, so all three always agree.
 */
export const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length; return m ? (m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2) : null; };
const quantile = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
export const monthSpan = (s: number, n: number) => (n === 1 ? MONTH_FULL[s] : `${MONTH_FULL[s]} to ${MONTH_FULL[(s + n - 1) % 12]}`);

export interface ReportFacts { value: number; median: number | null; top: number; rank: number; n: number; nOthers: number; times: number | null; pct: number; raw: number | null; verdict: string; notable: boolean; q1: number; q3: number }

/** One month of an area against the same calendar month in every other year 2003-2025 of the harmonized record. */
export function reportFacts(harm: CalendarRow[], raw: CalendarRow[], year: number, month: number): ReportFacts | null {
  const same = harm.filter((x) => x.month === month && x.value != null && x.year >= 2003 && x.year <= 2025);
  const me = same.find((x) => x.year === year);
  if (!me || me.value == null || same.length < 5) return null;
  const value = me.value;
  const others = same.filter((x) => x.year !== year).map((x) => x.value as number);
  const med = median(others);
  const rank = 1 + others.filter((o) => o > value).length;
  const n = same.length;
  const pct = Math.round((100 * others.filter((o) => o < value).length) / others.length);
  const mn = MONTH_FULL[month - 1];
  const verdict = rank === 1 ? `The highest ${mn} in ${n} years`
    : rank <= 3 ? `Among the three highest ${mn}s in ${n} years`
    : pct >= 75 ? `Above a usual ${mn}`
    : pct <= 25 ? `Below a usual ${mn}`
    : `A usual ${mn}`;
  return {
    value, median: med, top: Math.max(...others), rank, n, nOthers: others.length, times: med && med > 0 ? value / med : null, pct,
    raw: raw.find((x) => x.year === year && x.month === month)?.value ?? null, verdict, notable: rank <= 3 || pct >= 90,
    q1: quantile(others, 0.25), q3: quantile(others, 0.75),
  };
}

export interface Analogue { year: number; value: number; nextYear: number; nextMonth: number; next: number | null; nextTimes: number | null }
export interface Analogues { list: Analogue[]; nextMonth: number; nextUsual: number | null; close: boolean }

/**
 * Historical analogues: the other years whose same calendar month was closest to this one (by
 * ratio), and what the following month did in each, against a usual following month. A description
 * of the record, not a forecast.
 */
export function analoguesFor(harm: CalendarRow[], year: number, month: number, k = 3): Analogues | null {
  const at = new Map<number, number>();
  for (const r of harm) if (r.value != null && r.year >= 2003 && r.year <= 2025) at.set(r.year * 12 + r.month - 1, r.value);
  const v = at.get(year * 12 + month - 1);
  if (v == null) return null;
  const nm = (month % 12) + 1, bump = month === 12 ? 1 : 0;
  const nextVals: number[] = [];
  for (let y = 2003; y <= 2025; y += 1) { const x = at.get(y * 12 + nm - 1); if (x != null) nextVals.push(x); }
  const nextUsual = median(nextVals);
  const cands: Array<Analogue & { d: number }> = [];
  for (let y = 2003; y <= 2025; y += 1) {
    if (y === year) continue;
    const x = at.get(y * 12 + month - 1);
    if (x == null) continue;
    const next = at.get((y + bump) * 12 + nm - 1) ?? null;
    cands.push({ year: y, value: x, nextYear: y + bump, nextMonth: nm, next, nextTimes: next != null && nextUsual && nextUsual > 0 ? next / nextUsual : null, d: Math.abs(Math.log((x + 1) / (v + 1))) });
  }
  if (cands.length < 5) return null;
  const list = cands.sort((a, b) => a.d - b.d).slice(0, k);
  // "Close" when the nearest year is within a factor of two; otherwise nothing in the record resembles this month.
  return { list: list.map((c) => ({ year: c.year, value: c.value, nextYear: c.nextYear, nextMonth: c.nextMonth, next: c.next, nextTimes: c.nextTimes })), nextMonth: nm, nextUsual, close: list[0].d <= Math.log(2) };
}

export interface SeasonFacts {
  share: number[]; start: number; len: number; sum: number; peak: number; quiet: number; quietShare: number;
  years: [number, number]; nYears: number; top: Array<{ y: number; t: number }>; mean: number;
}

/** Typical fire season from whole years (every month known) of a monthly calendar. */
export function seasonFacts(rows: CalendarRow[], from: number, to: number): SeasonFacts | null {
  const byYear = new Map<number, number[]>();
  for (const r of rows) {
    if (r.year < from || r.year > to || r.value == null) continue;
    const a = byYear.get(r.year) ?? new Array<number>(12).fill(NaN);
    a[r.month - 1] = r.value;
    byYear.set(r.year, a);
  }
  const years = [...byYear.entries()].filter(([, a]) => a.every((v) => Number.isFinite(v))).sort((a, b) => a[0] - b[0]);
  if (years.length < 3) return null;
  const totals = years.map(([y, a]) => ({ y, t: a.reduce((s, v) => s + v, 0) }));
  const grand = totals.reduce((s, r) => s + r.t, 0);
  if (grand <= 0) return null;
  // Typical share of a year's activity in each month: the median over years of that month's share.
  const live = years.filter(([, a]) => a.reduce((s, v) => s + v, 0) > 0);
  const rawShare = Array.from({ length: 12 }, (_, m) => median(live.map(([, a]) => a[m] / a.reduce((s, v) => s + v, 0))) ?? 0);
  const norm = rawShare.reduce((s, v) => s + v, 0) || 1;
  const share = rawShare.map((v) => v / norm);
  // Critical period: the shortest run of consecutive months (wrapping over New Year) holding at least half a typical year.
  let best = { start: 0, len: 12, sum: 1 };
  for (let len = 1; len <= 12; len += 1) {
    let found = false;
    for (let s = 0; s < 12; s += 1) {
      let sum = 0;
      for (let k = 0; k < len; k += 1) sum += share[(s + k) % 12];
      if (sum >= 0.5 && (!found || sum > best.sum)) { best = { start: s, len, sum }; found = true; }
    }
    if (found) break;
  }
  let quiet = 0, quietShare = Infinity;
  for (let s = 0; s < 12; s += 1) { const v = share[s] + share[(s + 1) % 12] + share[(s + 2) % 12]; if (v < quietShare) { quietShare = v; quiet = s; } }
  return {
    share, ...best, peak: share.indexOf(Math.max(...share)), quiet, quietShare,
    years: [years[0][0], years[years.length - 1][0]], nYears: years.length,
    top: [...totals].sort((a, b) => b.t - a.t).slice(0, 3), mean: grand / totals.length,
  };
}

/** The findings as plain sentences, for the downloadable brief. */
export function findingLines(o: { harm: CalendarRow[]; raw: CalendarRow[]; cell: { year: number; month: number } | null; from: number; to: number; err: [number, number] | null }): string[] {
  const out: string[] = [];
  const f = o.cell ? reportFacts(o.harm, o.raw, o.cell.year, o.cell.month) : null;
  if (f && o.cell) {
    const mn = MONTH_FULL[o.cell.month - 1];
    out.push(`${mn} ${o.cell.year}: ${f.verdict.charAt(0).toLowerCase() + f.verdict.slice(1)}. ${fmt(Math.round(f.value))} harmonized detections; a usual ${mn} (median of the other ${f.nOthers} years) has ${fmt(f.median == null ? null : Math.round(f.median))} (middle half of years: ${fmt(Math.round(f.q1))}–${fmt(Math.round(f.q3))})${f.times != null ? `, so this is ×${f.times >= 10 ? f.times.toFixed(0) : f.times.toFixed(1)} a usual ${mn}` : ""}. Rank ${f.rank} of ${f.n}.${f.raw != null ? ` Raw count for the same month: ${fmt(Math.round(f.raw))}.` : ""}`);
    if (o.err && f.median != null && f.median > 0) out.push(Math.abs(f.value / f.median - 1) * 100 > o.err[1]
      ? `The difference from a usual ${mn} is larger than the model's 1-in-5 held-out miss (±${o.err[1].toFixed(0)}%), so the model's typical error alone does not explain it.`
      : `The difference from a usual ${mn} is within the model's 1-in-5 held-out miss (±${o.err[1].toFixed(0)}%), so treat it as within normal range.`);
  }
  const an = o.cell ? analoguesFor(o.harm, o.cell.year, o.cell.month) : null;
  if (an && o.cell) {
    const mn = MONTH_FULL[o.cell.month - 1], nx = MONTH_FULL[an.nextMonth - 1];
    out.push(`Years most like this one (closest ${mn} totals): ${an.list.map((a) => `${a.year} (${fmt(Math.round(a.value))}; the following ${nx} ${a.next == null ? "is not in the record" : `had ${fmt(Math.round(a.next))}${a.nextTimes != null ? `, ×${a.nextTimes.toFixed(1)} a usual ${nx}` : ""}`})`).join("; ")}.${an.close ? "" : ` No other ${mn} in the record comes within a factor of two of this one.`} What followed in similar years, not a forecast.`);
  }
  const s = seasonFacts(o.harm, o.from, o.to);
  if (s) {
    out.push(`Fire season: ${monthSpan(s.start, s.len)}. Half of a typical year's detected burning falls in ${s.len === 1 ? "this month" : `these ${s.len} months`} (${Math.round(s.sum * 100)}%). Peak month: ${MONTH_FULL[s.peak]} (about ${Math.round(s.share[s.peak] * 100)}% of a typical year).`);
    out.push(`Highest burning activity: ${s.top.map((r) => `${r.y} (${fmt(r.t)}, ×${(r.t / s.mean).toFixed(1)} the average year)`).join(", ")}. Quietest window: ${monthSpan(s.quiet, 3)} (${Math.round(s.quietShare * 100)}% of a typical year). From ${s.nYears} complete years, ${s.years[0]}–${s.years[1]}, of the harmonized record.`);
  }
  if (out.length) out.push("Detected active fire, not burned area. Historical context, not a forecast.");
  return out;
}
