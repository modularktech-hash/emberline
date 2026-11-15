"use client";

import { Eyebrow } from "@/components/Figure";
import { MONTHS, fmt } from "@/lib/ember";
import type { CalendarRow } from "@/lib/types";
import { seasonFacts, monthSpan } from "@/lib/findings";

const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Critical periods for the selected area of interest, in plain words: when the fire season
 * usually falls, its peak month, the years with the highest burning activity and the quietest
 * window. Everything is computed here from the calendar on screen (whole years of the chosen
 * range, every month known), so it changes with the area, the dates and the series.
 */
export function CriticalPeriods({ rows, from, to, place, mode }: { rows: CalendarRow[]; from: number; to: number; place: string; mode: "raw" | "harmonized" }) {
  const f = seasonFacts(rows, from, to);
  if (!f) return null;
  const { share: sh, peak, quiet, quietShare: qv, top, mean } = f;
  const best = f;
  const years = [[f.years[0]], [f.years[1]]];
  const nYears = f.nYears;
  const inSeason = (m: number) => ((m - f.start + 12) % 12) < f.len;
  const span = monthSpan;
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
            From the {mode === "raw" ? "raw record (the season's timing is reliable; levels before and after 2012 are not comparable)" : "harmonized record"} for {nYears} complete years in your date range.
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
