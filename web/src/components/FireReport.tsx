"use client";

import Link from "next/link";
import { InfoDot } from "@/components/ui";
import { MONTHS, fmt } from "@/lib/ember";
import { fmtNum } from "@/lib/format";
import type { CalendarRow } from "@/lib/types";
import { reportFacts } from "@/lib/findings";

const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface ReportInput {
  place: string;
  year: number;
  month: number;
  harm: CalendarRow[];
  raw: CalendarRow[];
  /** Held-out median monthly miss (%) and the 1-in-5 miss, of the country whose fit applies. */
  err: [number, number] | null;
  errCountry: string | null;
  pooled: boolean;
  fitVersion: string;
  picked: boolean;
}


/**
 * Fire report: one month of one area, judged against the same month in every other year of the
 * harmonized record, with the evidence beside it (raw count, held-out error, method). Computed in
 * the browser from the calendar on screen; nothing here is precomputed or typed in.
 */
export function FireReport(r: ReportInput) {
  const f = reportFacts(r.harm, r.raw, r.year, r.month);
  if (!f) return null;
  const { value: v, median: med, rank, n, times, raw: rawV, top, verdict } = f;
  const others = { length: f.nOthers };
  const mn = FULL[r.month - 1];
  const tone = f.notable ? "var(--red)" : "var(--text-primary)";
  // Is the difference bigger than the model's typical miss? Only then is it a clear signal.
  const clear = r.err && med != null && med > 0 ? Math.abs(v / med - 1) * 100 > r.err[1] : null;

  return (
    <section data-testid="fire-report" aria-label="Fire report" className="tile mt-6 overflow-hidden p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow-n">Fire report · {r.picked ? "selected month" : "most unusual month"}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">harmonized · fit {r.fitVersion}</p>
      </div>
      <h3 className="display mt-2 text-2xl sm:text-3xl">{mn} {r.year} · {r.place}</h3>
      <p className="mt-2 text-lg leading-snug" style={{ color: tone }}>{verdict}.</p>

      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><dt className="text-xs text-[var(--text-muted)]">Harmonized detections</dt><dd className="dot-num tabular mt-1 text-3xl">{fmt(Math.round(v))}</dd></div>
        <div><dt className="text-xs text-[var(--text-muted)]">Against a usual {mn}</dt><dd className="dot-num tabular mt-1 text-3xl" style={{ color: tone }}>{times == null ? "—" : `×${fmtNum(times, times >= 10 ? 0 : 1)}`}</dd></div>
        <div><dt className="text-xs text-[var(--text-muted)]">Rank among {n} {mn}s</dt><dd className="dot-num tabular mt-1 text-3xl">{rank}</dd></div>
        <div><dt className="text-xs text-[var(--text-muted)]">Raw count, same month</dt><dd className="dot-num tabular mt-1 text-3xl text-[var(--c-raw)]">{rawV == null ? "—" : fmt(Math.round(rawV))}</dd></div>
      </dl>

      <div className="mt-5 grid gap-4 text-sm leading-relaxed text-[var(--text-secondary)] md:grid-cols-2">
        <div>
          <p className="font-medium text-[var(--text-primary)]">What it means</p>
          <p className="mt-1">
            {mn} {r.year} had {fmt(Math.round(v))} harmonized detections. The usual {mn} here (median of the other {others.length} years) is {fmt(med == null ? null : Math.round(med))}; the highest of those is {fmt(Math.round(top))}.
            {rawV != null && r.year >= 2012 && <> The raw record shows {fmt(Math.round(rawV))} because VIIRS sees more small fires than MODIS; the harmonized value puts it on one scale with 2003–2011.</>}
          </p>
          {clear != null && (
            <p className="mt-2">
              {clear
                ? <>The difference from a usual {mn} is larger than the model&apos;s 1-in-5 held-out miss (±{fmtNum(r.err![1], 0)}%), so the model&apos;s typical error alone does not explain it.</>
                : <>The difference from a usual {mn} is within the model&apos;s 1-in-5 held-out miss (±{fmtNum(r.err![1], 0)}%), so treat it as within normal range.</>}
            </p>
          )}
        </div>
        <div>
          <p className="font-medium text-[var(--text-primary)]">How far to trust it</p>
          <ul className="mt-1 space-y-1">
            <li>Typical held-out error{r.errCountry ? ` (${r.errCountry.replace(/_/g, " ")})` : ""}: {r.err ? `±${fmtNum(r.err[0], 0)}% per month, median, on 2019–2021, years the fit never saw` : "not recorded"}.{r.pooled && " Borrowed (pooled) curve: less reliable."} <InfoDot k="typicalError" align="start" /></li>
            <li>Detected active fire, not burned area. Historical context, not a forecast.</li>
            <li><Link href="/method" className="link-ul text-[var(--text-primary)]">How the correction was tested</Link> · <Link href="/method#proof" className="link-ul text-[var(--text-primary)]">the proof</Link></li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-xs text-[var(--text-muted)]">{r.picked ? "Click another month in the calendar to change it." : `Click any month in the calendar to report on it instead (${MONTHS[r.month - 1]} ${r.year} is shown because it ranks highest for its month).`}</p>
    </section>
  );
}
