"use client";

import { Eyebrow } from "@/components/Figure";
import { MONTHS, fmt } from "@/lib/ember";
import type { CalendarRow } from "@/lib/types";

const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Critical periods for the selected area of interest, in plain words: when the fire season
 * usually falls, its peak month, the years with the highest burning activity and the quietest
 * window. Everything is computed here from the calendar on screen (whole years of the chosen
 * range, every month known), so it changes with the area, the dates and the series.
 */
export function CriticalPeriods({ rows, from, to, place, mode }: { rows: CalendarRow[]; from: number; to: number; place: string; mode: "raw" | "harmonized" }) {
  const byYear = new Map<number, number[]>();
  for (const r of rows) {
    if (r.year < from || r.year > to || r.value == null) continue;
    const a = byYear.get(r.year) ?? new Array<number>(12).fill(NaN);
    a[r.month - 1] = r.value;
    byYear.set(r.year, a);
  }
  const years = [...byYear.entries()].filter(([, a]) => a.every((v) => Number.isFinite(v)));
  if (years.length < 3) return null;
  const totals = years.map(([y, a]) => ({ y, t: a.reduce((s, v) => s + v, 0) }));
  const grand = totals.reduce((s, r) => s + r.t, 0);
  if (grand <= 0) return null;

  // Typical share of a year's activity in each month: the median over years of that month's share.
  const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length; return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2; };
  const share = MONTHS.map((_, m) => med(years.filter(([, a]) => a.reduce((s, v) => s + v, 0) > 0).map(([, a]) => a[m] / a.reduce((s, v) => s + v, 0))));
  const norm = share.reduce((s, v) => s + v, 0) || 1;
  const sh = share.map((v) => v / norm);

  // Critical period: the shortest run of consecutive months (wrapping over New Year) holding at least half a typical year.
  let best = { start: 0, len: 12, sum: 1 };
  for (let len = 1; len <= 12; len += 1) {
    let found = false;
    for (let s = 0; s < 12; s += 1) {
      let sum = 0;
      for (let k = 0; k < len; k += 1) sum += sh[(s + k) % 12];
      if (sum >= 0.5 && (!found || sum > best.sum)) { best = { start: s, len, sum }; found = true; }
    }
    if (found) break;
  }
  const inSeason = (m: number) => ((m - best.start + 12) % 12) < best.len;
  const peak = sh.indexOf(Math.max(...sh));
  // Quietest window: the three consecutive months with the smallest typical share.
  let quiet = 0, qv = Infinity;
  for (let s = 0; s < 12; s += 1) { const v = sh[s] + sh[(s + 1) % 12] + sh[(s + 2) % 12]; if (v < qv) { qv = v; quiet = s; } }
  const top = [...totals].sort((a, b) => b.t - a.t).slice(0, 3);
  const mean = grand / totals.length;
  const span = (s: number, n: number) => (n === 1 ? FULL[s] : `${FULL[s]} to ${FULL[(s + n - 1) % 12]}`);
  const hi = Math.max(...sh);

  return (
    <section data-testid="critical-periods" className="mt-6 rounded-2xl border border-[var(--hairline)] p-4 sm:p-5">
      <Eyebrow>Critical periods · {place} · {years[0][0]}–{years[years.length - 1][0]}</Eyebrow>
      <div className="mt-3 grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          <p><span className="font-medium text-[var(--text-primary)]">Fire season: {span(best.start, best.len)}.</span> Half of a typical year&apos;s detected burning falls in these {best.len === 1 ? "month" : `${best.len} months`} ({Math.round(best.sum * 100)}%).</p>
          <p><span className="font-medium text-[var(--text-primary)]">Peak month: {FULL[peak]}</span>, about {Math.round(sh[peak] * 100)}% of a typical year.</p>
          {mode === "harmonized"
            ? <p><span className="font-medium text-[var(--text-primary)]">Highest burning activity:</span> {top.map((r, i) => <span key={r.y} className="tabular">{i ? ", " : ""}{r.y} ({fmt(r.t)}{mean > 0 ? `, ×${(r.t / mean).toFixed(1)} the average year` : ""})</span>)}.</p>
            : <p><span className="font-medium text-[var(--text-primary)]">Highest burning activity:</span> switch to Harmonized to rank years. The raw record changes sensor in 2012, so its years are not comparable.</p>}
          <p><span className="font-medium text-[var(--text-primary)]">Quietest window: {span(quiet, 3)}</span>, {Math.round(qv * 100)}% of a typical year.</p>
          <p className="text-xs text-[var(--text-muted)]">
            From the {mode === "raw" ? "raw record (the season's timing is reliable; levels before and after 2012 are not comparable)" : "harmonized record"} for {years.length} complete years in your date range.
            Typical share: the median over those years of each month&apos;s share of its year. Historical pattern, not a forecast.
          </p>
        </div>
        <div aria-hidden className="flex items-end gap-1.5 self-end" style={{ height: 120 }}>
          {sh.map((v, m) => (
            <div key={m} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t-[4px]" style={{ height: `${Math.max(2, (v / hi) * 92)}px`, background: inSeason(m) ? "var(--ember)" : "var(--grey-3)" }} />
              <span className={`font-mono text-[10px] ${m === peak ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{MONTHS[m][0]}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">Typical share of the year by month: {sh.map((v, m) => `${FULL[m]} ${Math.round(v * 100)}%`).join(", ")}.</p>
    </section>
  );
}
