"use client";

/**
 * G2: "This month so far" — provisional, raw month-to-date counts (FIRMS NRT) against the
 * raw history of the same calendar month. Every number is read from
 * web/public/data/month_to_date.json (scripts/build_month_to_date.py); when that file is
 * absent the card says so and shows no number. Never on the harmonized scale.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtInt, fmtNum } from "@/lib/format";
import { prettyName } from "@/lib/names";
import { CountryPicker } from "@/components/CountryPicker";
import { InfoDot } from "@/components/ui";
import { loadJson } from "@/lib/queries";

interface Side { month_to_date: number; pace_full_month: number; history_platform: string; history_years: [number, number]; history_median: number | null; history_max: number | null; percentile_of_pace: number | null; years_below_pace: number }
export interface MonthToDateFile {
  generated_utc: string; status: string; label: string; month: string; window_utc: [string, string]; days_covered: number; days_in_month: number;
  sources: Record<string, string>; filters: string; membership: string; pace_definition: string; percentile_definition: string; selection: string;
  no_outline: string[]; countries: Record<string, Partial<Record<"MODIS" | "NOAA-20", Side>>>;
}

let cache: Promise<MonthToDateFile | null> | null = null;
/** Resolves to null when the file is not published (404) or unreadable. */
export function getMonthToDate(): Promise<MonthToDateFile | null> {
  // Only requested when manifest.json lists it, so an unpublished file never shows up as a failed request.
  cache ??= loadJson<{ files: Array<{ name: string }> }>("manifest.json")
    .then((m) => (m.files.some((f) => f.name === "month_to_date.json") ? loadJson<MonthToDateFile>("month_to_date.json") : null))
    .catch(() => null);
  return cache;
}
export function useMonthToDate() {
  const [s, setS] = useState<{ done: boolean; data: MonthToDateFile | null }>({ done: false, data: null });
  useEffect(() => { let on = true; getMonthToDate().then((d) => on && setS({ done: true, data: d })); return () => { on = false; }; }, []);
  return s;
}

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: string) => MONTH[Number(m.slice(5, 7)) - 1] ?? m;
const BADGE = "rounded-full border border-[var(--red)] px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--red)]";

export function MonthToDateCard({ country }: { country?: string }) {
  const { done, data } = useMonthToDate();
  const [pick, setPick] = useState<string | null>(null);
  if (!done) return null;
  if (!data) return (
    <section className="card mt-6 min-w-0 p-5" id="this-month" data-testid="month-to-date">
      <h2 className="display text-xl">This month so far</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Current-month data not loaded yet.</p>
    </section>
  );
  const names = Object.keys(data.countries);
  const sel = pick && data.countries[pick] ? pick : country && data.countries[country] ? country : names[0];
  const c = data.countries[sel];
  const mn = monthName(data.month);
  return (
    <section className="card mt-6 min-w-0 scroll-mt-24 p-5 sm:p-6" id="this-month" data-testid="month-to-date">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="display flex items-center gap-2.5 text-2xl">This month so far <InfoDot k="monthToDate" align="start" /></h2>
        <span className={BADGE}>{data.label}</span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        {mn} {data.month.slice(0, 4)}, {data.window_utc[0]} to {data.window_utc[1]} ({data.days_covered} of {data.days_in_month} days, complete UTC days), from NASA FIRMS near-real-time data,
        against the raw archive for {mn} in earlier years. <strong className="font-medium text-[var(--text-primary)]">Different satellites:</strong> NOAA-20 is not the Suomi-NPP platform of the VIIRS history,
        and Terra and Aqua have drifted from their original overpass times since 2022. Raw counts only; nothing here is harmonized.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CountryPicker value={sel} options={names} onChange={setPick} label="Country" />
        {country && !data.countries[country] && <span className="text-xs text-[var(--text-muted)]">{prettyName(country)} is not among the {names.length} countries loaded ({data.selection}).</span>}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(["MODIS", "NOAA-20"] as const).map((k) => { const s = c?.[k]; return (
          <div key={k} className="rounded-2xl border border-[var(--hairline)] p-4">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{k === "MODIS" ? "MODIS NRT (Terra + Aqua)" : "NOAA-20 VIIRS NRT"} · vs {s?.history_platform ?? "history"}</p>
            {s ? (
              <>
                <p className="tabular mt-2 text-2xl text-[var(--text-primary)]">{fmtInt(s.month_to_date)} <span className="text-sm text-[var(--text-secondary)]">detections so far</span></p>
                <p className="tabular mt-1 text-sm text-[var(--text-secondary)]">Pace for the full month ≈ <span className="text-[var(--text-primary)]">{fmtInt(s.pace_full_month)}</span> · {mn} median {s.history_years[0]}–{s.history_years[1]}: <span className="text-[var(--text-primary)]">{s.history_median == null ? "—" : fmtInt(s.history_median)}</span></p>
                <p className="tabular mt-1 text-sm text-[var(--text-secondary)]">Pace is above {s.years_below_pace} of {s.history_years[1] - s.history_years[0] + 1} past {mn}s (percentile {s.percentile_of_pace == null ? "—" : fmtNum(s.percentile_of_pace, 0)}).</p>
              </>
            ) : <p className="mt-2 text-sm text-[var(--text-muted)]">Not available for this country.</p>}
          </div>); })}
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
        Pace: {data.pace_definition}. Percentile: {data.percentile_definition}. Filters: {data.filters}. Membership: {data.membership}. Countries: {data.selection}. Fetched {data.generated_utc}.
      </p>
    </section>
  );
}

/** G5: the home-page summary across the loaded countries. Renders nothing when the file is absent. */
export function MonthUnusualPanel() {
  const { data } = useMonthToDate();
  if (!data) return null;
  const rows = Object.values(data.countries).map((c) => c.MODIS).filter((s): s is Side => !!s && s.history_median != null && s.percentile_of_pace != null);
  const above = rows.filter((s) => s.pace_full_month > (s.history_median as number)).length;
  const p90 = rows.filter((s) => (s.percentile_of_pace as number) > 90).length;
  const mn = monthName(data.month);
  return (
    <section className="window mx-auto mt-6 max-w-5xl p-6 sm:p-8" data-testid="month-unusual">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="display flex items-center gap-2.5 t-d3">Is this {mn} unusual? <InfoDot k="monthToDate" align="start" /></h2>
        <span className={BADGE}>{data.label}</span>
      </div>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-[var(--text-secondary)]">
        Of the <span className="tabular text-[var(--text-primary)]">{rows.length}</span> countries loaded, <span className="tabular text-[var(--ember)]">{above}</span> are on pace
        for more MODIS detections than their {mn} median ({rows[0]?.history_years.join("–")}), and <span className="tabular text-[var(--ember)]">{p90}</span> are above the 90th percentile of past {mn}s.
      </p>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {data.window_utc[0]} to {data.window_utc[1]}, {data.days_covered} of {data.days_in_month} days, straight-line pace; MODIS near-real-time (Terra and Aqua are drifting) against the raw MODIS archive. Countries: {data.selection}.{" "}
        <Link className="link-ul text-[var(--text-primary)]" href="/seasons#this-month">Each country →</Link>
      </p>
    </section>
  );
}
