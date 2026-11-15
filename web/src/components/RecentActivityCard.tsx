"use client";

import { useEffect, useState } from "react";
import { fmtInt } from "@/lib/format";

/**
 * E07 prototype card (docs/current-month.md "UI card spec"): recent NOAA-20 detections in a
 * country against NOAA-20's own archive for the same calendar days. Provisional, not
 * harmonized, and deliberately kept off the harmonized calendar's colour scale. Every number
 * is read from web/public/data/current_month.json; nothing is computed here except display.
 */
type Country = {
  count_to_date: number; history_by_year: Record<string, number>; history_median: number;
  history_iqr: [number, number]; n_years: number; abs_deviation: number; ratio: number | null;
  percentile_vs_history: number; history_polygon_capture_mean: number;
  history_nonveg_type_share_mean: number; completeness: string;
};
type CurrentMonth = {
  generated_utc: string; status: string; comparison: string; platform: string; filters: string; membership: string;
  acquisition_cutoff_utc: string; window_utc: [string, string]; elapsed_days: number;
  month_to_date: boolean; month_to_date_note: string; reference_years: number[];
  countries: Record<string, Country>;
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number) => (Number.isInteger(v) ? fmtInt(v) : v.toFixed(1));

export function RecentActivityCard() {
  const [d, setD] = useState<CurrentMonth | null>(null);
  const [err, setErr] = useState(false);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/data/current_month.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: CurrentMonth) => { if (live) { setD(j); setName(Object.keys(j.countries)[0] ?? null); } })
      .catch(() => live && setErr(true));
    return () => { live = false; };
  }, []);

  const c = d && name ? d.countries[name] : null;
  const ref = d ? `${d.reference_years[0]}–${d.reference_years[d.reference_years.length - 1]}` : "";
  return (
    <section className="card mt-8 min-w-0 p-5 sm:p-6" aria-labelledby="recent-activity">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="recent-activity" className="display text-3xl">Recent NOAA-20 activity vs NOAA-20&apos;s own past</h2>
        <span className="rounded-full border border-[var(--ember)] px-2.5 py-0.5 text-xs font-medium text-[var(--ember)]">Provisional · not harmonized</span>
      </div>
      {err && <p className="mt-3 text-sm text-[var(--text-secondary)]">The recent-activity comparison file could not be loaded, so this card shows nothing.</p>}
      {!d && !err && <p className="mt-3 text-sm text-[var(--text-muted)]">Loading recent-activity comparison…</p>}
      {d && c && name && (
        <>
          <label className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            Area
            <select value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-[var(--hairline)] bg-transparent px-2 py-1 text-[var(--text-primary)]">
              {Object.keys(d.countries).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            Window <span className="tabular text-[var(--text-primary)]">{d.window_utc[0]} to {d.window_utc[1]}</span> (UTC, {d.elapsed_days} complete days); acquisition cutoff <span className="tabular">{d.acquisition_cutoff_utc}</span>. Platform: {d.platform}.
          </p>
          <dl className="tabular mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-[var(--text-muted)]">Detections this window</dt><dd className="text-2xl text-[var(--text-primary)]">{fmtInt(c.count_to_date)}</dd></div>
            <div><dt className="text-xs text-[var(--text-muted)]">Same days, {ref}</dt><dd>median {num(c.history_median)} · IQR {num(c.history_iqr[0])}–{num(c.history_iqr[1])} · n = {c.n_years} years</dd></div>
            <div><dt className="text-xs text-[var(--text-muted)]">Difference from median</dt><dd>{c.abs_deviation > 0 ? "+" : ""}{num(c.abs_deviation)} detections{c.ratio != null && <> · ratio {c.ratio.toFixed(2)}×</>}</dd></div>
            <div><dt className="text-xs text-[var(--text-muted)]">Percentile vs past years</dt><dd>{num(c.percentile_vs_history)}th percentile of {c.n_years} years</dd></div>
          </dl>
          <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={`Same-window NOAA-20 detections by year, ${name}`}>
            <table className="tabular mt-4 w-full min-w-[420px] text-right text-xs">
              <caption className="sr-only">NOAA-20 detections in the same calendar days, {ref}, {name}</caption>
              <thead><tr className="text-[var(--text-muted)]">{Object.keys(c.history_by_year).map((y) => <th key={y} scope="col" className="font-normal">{y}</th>)}<th scope="col" className="font-normal text-[var(--text-primary)]">Now</th></tr></thead>
              <tbody><tr>{Object.entries(c.history_by_year).map(([y, v]) => <td key={y}>{fmtInt(v)}</td>)}<td className="font-medium text-[var(--text-primary)]">{fmtInt(c.count_to_date)}</td></tr></tbody>
            </table>
          </div>
          {c.history_polygon_capture_mean < 0.95 && (
            <p role="note" className="mt-4 rounded-md border border-[var(--ember)] px-3 py-2 text-sm text-[var(--text-primary)]">
              Caution: the country outline captures only {pct(c.history_polygon_capture_mean)} of {name}&apos;s archive detections on average (below 95%), so counts here undercount the country.
            </p>
          )}
          <ul className="mt-4 space-y-1 text-xs text-[var(--text-secondary)]">
            <li>Filters: {d.filters}. Membership: {d.membership}.</li>
            <li>History non-vegetation share (archive type field): {pct(c.history_nonveg_type_share_mean)}; polygon capture {pct(c.history_polygon_capture_mean)}.</li>
            <li>Coverage: {c.completeness}. {d.month_to_date ? "" : "Not month-to-date: "}{d.month_to_date_note}</li>
          </ul>
          <p className="mt-4 text-xs text-[var(--text-muted)]">Different platform from the harmonized calendar. Describes observed detections, not fire spread or risk.</p>
        </>
      )}
    </section>
  );
}
