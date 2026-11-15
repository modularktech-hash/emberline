"use client";

/**
 * G2: "This month so far" — provisional, raw month-to-date counts (FIRMS NRT) against the
 * raw history of the same calendar month. Every number is read from
 * web/public/data/month_to_date.json (scripts/build_month_to_date.py); when that file is
 * absent the card says so and shows no number. Countries whose NOAA-20 to Suomi-NPP bridge
 * passed held-out validation (scripts/build_bridge.py, bridge.json) also carry a harmonized
 * month to date with its typical error; every other country stays raw.
 */
import { useEffect, useMemo, useState } from "react";
import { cellToLatLng } from "h3-js";
import Link from "next/link";
import { fmtInt, fmtNum } from "@/lib/format";
import { prettyName } from "@/lib/names";
import { CountryPicker } from "@/components/CountryPicker";
import { InfoDot, Segmented } from "@/components/ui";
import { getCountryMonthHistory, loadJson } from "@/lib/queries";
import type { AreaRow } from "@/lib/types";

interface Side { month_to_date: number; pace_full_month: number; history_platform: string; history_years: [number, number]; history_median: number | null; history_max: number | null; percentile_of_pace: number | null; years_below_pace: number }
/** Harmonized month to date (build_bridge.py): only present where the bridge passed. */
export interface HarmonizedMtd {
  label: string; month_to_date: number; pace_full_month: number; pace_range: [number, number]; typical_error_pct: number; bridge_ratio: number;
  history_years: [number, number]; history_median: number; history_min: number; history_max: number;
  percentile_of_pace: number; rank_of_pace: number; rank_out_of: number; verdict: string;
}
export interface MonthToDateFile {
  generated_utc: string; status: string; label: string; month: string; window_utc: [string, string]; days_covered: number; days_in_month: number;
  sources: Record<string, string>; filters: string; membership: string; pace_definition: string; percentile_definition: string; selection: string;
  no_outline: string[]; incomplete?: string[]; harmonized_note?: string;
  countries: Record<string, Partial<Record<"MODIS" | "NOAA-20", Side>> & { harmonized?: HarmonizedMtd }>;
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
/** Shown wherever a current month is on the harmonized scale (its country passed the bridge test). */
export function BridgedBadge() {
  return <span className="rounded-full border border-[var(--ember)] px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--ember)]" data-testid="bridged-badge">NOAA-20 · bridged &amp; validated</span>;
}
const BADGE = "rounded-full border border-[var(--red)] px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--red)]";

interface CellsFile {
  generated_utc: string; label: string; month: string; window_utc: [string, string]; days_covered: number; days_in_month: number;
  resolution: number; filters: string; coverage: string; boxes: Array<[number, number, number, number]>; cells: Record<string, [number, number]>;
}
let cellsCache: Promise<CellsFile | null> | null = null;
function getMonthToDateCells(): Promise<CellsFile | null> {
  cellsCache ??= loadJson<CellsFile>("month_to_date_cells.json").catch(() => null);
  return cellsCache;
}

/** Straight-line pace against the median of the same month in the chosen history years (the method of build_month_to_date.py). */
function compare(n: number, daysCovered: number, daysInMonth: number, hist: Map<number, number>, years: number[]) {
  const vals = years.map((y) => hist.get(y) ?? 0).sort((a, b) => a - b);
  const pace = (n * daysInMonth) / daysCovered;
  const m = vals.length;
  const median = m ? (m % 2 ? vals[(m - 1) / 2] : (vals[m / 2 - 1] + vals[m / 2]) / 2) : null;
  const below = vals.filter((v) => v < pace).length, ties = vals.filter((v) => v === pace).length;
  return { n, pace, median, below, years: m, percentile: m ? (100 * (below + 0.5 * ties)) / m : null, max: m ? vals[m - 1] : null };
}

/** The harmonized verdict for one country: pace with its typical-error range against the harmonized history. */
export function HarmonizedVerdict({ h, monthLabel }: { h: HarmonizedMtd; monthLabel: string }) {
  const [y0, y1] = h.history_years;
  return (
    <div className="rounded-2xl border border-[var(--hairline)] p-4" data-testid="mtd-harmonized">
      <BridgedBadge />
      <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
        Harmonized · on the old satellite&apos;s scale · vs {monthLabel} {y0}–{y1} <InfoDot k="bridge" align="start" />
      </p>
      <p className="tabular mt-2 text-2xl text-[var(--text-primary)]">{fmtInt(h.pace_full_month)} <span className="text-sm text-[var(--text-secondary)]">pace for the full month (range {fmtInt(h.pace_range[0])}–{fmtInt(h.pace_range[1])}, typical error ±{fmtNum(h.typical_error_pct, 0)}%)</span></p>
      <p className="tabular mt-1 text-sm text-[var(--text-secondary)]">
        {fmtInt(h.month_to_date)} so far · {monthLabel} median {y0}–{y1}: <span className="text-[var(--text-primary)]">{fmtInt(h.history_median)}</span> (range {fmtInt(h.history_min)}–{fmtInt(h.history_max)})
      </p>
      <p className="tabular mt-1 text-sm text-[var(--text-secondary)]">
        Pace ranks {h.rank_of_pace} of {h.rank_out_of} (percentile {fmtNum(h.percentile_of_pace, 0)}): <span className="text-[var(--text-primary)]">{h.verdict}</span>.
      </p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{h.label}. NOAA-20 near-real-time × the published fit × bridge ratio {fmtNum(h.bridge_ratio, 3)}.</p>
    </div>
  );
}

const SIDES = [
  { key: "MODIS" as const, title: "MODIS NRT (Terra + Aqua)", history: "MODIS Terra+Aqua archive", sensor: "MODIS" as const, first: 2003 },
  { key: "NOAA-20" as const, title: "NOAA-20 VIIRS NRT", history: "Suomi-NPP VIIRS archive (a different satellite)", sensor: "VIIRS" as const, first: 2012 },
];

/**
 * R5, "this month against the historical median", for a country or a drawn
 * area. Current month: FIRMS near-real-time, provisional and raw. History: the
 * raw archive for the same calendar month, platform by platform, over the
 * years of the chosen date range (R8). Never on the harmonized scale.
 */
export function MonthToDateCard({ country, area, range }: {
  country?: string;
  area?: { label: string; cells: string[]; rows: AreaRow[] } | null;
  range?: [number, number];
}) {
  const { done, data } = useMonthToDate();
  const [pick, setPick] = useState<string | null>(null);
  const [view, setView] = useState<"harmonized" | "raw">("harmonized");
  const [cellsFile, setCellsFile] = useState<{ done: boolean; data: CellsFile | null }>({ done: false, data: null });
  const [hist, setHist] = useState<{ key: string; h: Record<"MODIS" | "VIIRS", Map<number, number>> } | null>(null);
  useEffect(() => { if (!area) return; let on = true; getMonthToDateCells().then((d) => on && setCellsFile({ done: true, data: d })); return () => { on = false; }; }, [area]);
  const names = data ? Object.keys(data.countries) : [];
  const sel = !data ? null : pick && data.countries[pick] ? pick : country && data.countries[country] ? country : names[0];
  const month = data ? Number(data.month.slice(5, 7)) : null;
  useEffect(() => {
    if (area || !sel || !month) return;
    let on = true;
    getCountryMonthHistory(sel, month).then((h) => on && setHist({ key: `${sel}|${month}`, h }), () => on && setHist(null));
    return () => { on = false; };
  }, [area, sel, month]);
  const areaHist = useMemo(() => {
    if (!area || !month) return null;
    const h = { MODIS: new Map<number, number>(), VIIRS: new Map<number, number>() };
    for (const r of area.rows) if (r.month === month) {
      h.MODIS.set(r.year, (h.MODIS.get(r.year) ?? 0) + r.n_modis);
      h.VIIRS.set(r.year, (h.VIIRS.get(r.year) ?? 0) + r.n_viirs);
    }
    return h;
  }, [area, month]);
  const areaNow = useMemo(() => {
    const f = cellsFile.data;
    if (!area || !f) return null;
    const inBox = (lat: number, lon: number) => f.boxes.some(([w, s, e, n]) => lat >= s && lat <= n && lon >= w && lon <= e);
    const covered = area.cells.filter((c) => { const [lat, lon] = cellToLatLng(c); return inBox(lat, lon); }).length;
    let modis = 0, noaa = 0;
    for (const c of area.cells) { const v = f.cells[c]; if (v) { modis += v[0]; noaa += v[1]; } }
    return { modis, noaa, complete: covered === area.cells.length, covered };
  }, [area, cellsFile.data]);

  if (!done || (area && !cellsFile.done)) return null;
  const meta = area ? cellsFile.data : data;
  if (!data || !meta) return (
    <section className="card mt-6 min-w-0 p-5" id="this-month" data-testid="month-to-date">
      <h2 className="display text-xl">This month so far</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Current-month data: not recorded{area ? " for drawn areas" : ""} in this build.</p>
    </section>
  );
  const mn = monthName(data.month);
  const c = sel ? data.countries[sel] : undefined;
  const h = area ? areaHist : hist && hist.key === `${sel}|${month}` ? hist.h : null;
  const [r0, r1] = range ?? [2003, 2025];
  const harm = !area ? c?.harmonized : undefined;
  const showHarm = !!harm && view === "harmonized";
  return (
    <section className="card mt-6 min-w-0 scroll-mt-24 p-5 sm:p-6" id="this-month" data-testid="month-to-date">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="display flex items-center gap-2.5 text-2xl">This month so far{area ? ` · ${area.label}` : ""} <InfoDot k="monthToDate" align="start" /></h2>
        <span className={BADGE}>{showHarm ? "provisional · harmonized · bridged from NOAA-20" : "provisional · raw · near-real-time · not harmonized"}</span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        {mn} {data.month.slice(0, 4)}, {meta.window_utc[0]} to {meta.window_utc[1]} ({meta.days_covered} of {meta.days_in_month} days, complete UTC days; as of {meta.generated_utc}), from NASA FIRMS near-real-time data,
        against the raw archive for {mn} in {r0}–{r1} (your date range).
      </p>
      <ul className="mt-2 max-w-3xl list-disc pl-5 text-xs leading-relaxed text-[var(--text-secondary)]" data-testid="mtd-caveats">
        {showHarm
          ? <li><strong className="font-medium text-[var(--text-primary)]">Harmonized through a bridge.</strong> NOAA-20 detections weighted by the published correction, scaled to Suomi-NPP by a ratio fitted in 2018–2021 and validated on 2022–2023; compared with the harmonized {mn} of every year 2003–2025. The month is incomplete, so the pace is a straight-line estimate.</li>
          : <li><strong className="font-medium text-[var(--text-primary)]">Not a harmonized anomaly.</strong> Raw counts compared platform by platform{harm ? "" : "; this country has no validated NOAA-20 bridge, so its current month stays raw and uncorrected"}.</li>}
        <li><strong className="font-medium text-[var(--text-primary)]">No vegetation-type filter.</strong> Near-real-time files carry no fire type, so volcanoes, gas flares and industrial heat sources may be counted; the history excludes them.</li>
        <li><strong className="font-medium text-[var(--text-primary)]">Different satellites.</strong> NOAA-20 is not the Suomi-NPP platform of the VIIRS history, and Terra and Aqua have drifted from their original overpass times since 2022.</li>
      </ul>
      {!area && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CountryPicker value={sel ?? ""} options={names} onChange={setPick} label="Country" />
          {country && !data.countries[country] && <span className="text-xs text-[var(--text-muted)]">{prettyName(country)}: not recorded ({data.selection}).</span>}
          {harm && <Segmented label="Scale" value={view} onChange={setView} options={[{ value: "harmonized", label: "Harmonized" }, { value: "raw", label: "Raw" }]} />}
        </div>
      )}
      {area && areaNow && !areaNow.complete && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">Only {areaNow.covered} of {area.cells.length} cells of this area lie inside the region fetched this month ({cellsFile.data?.coverage}); the comparison is not recorded for a partly covered area.</p>
      )}
      {showHarm && harm && <div className="mt-4"><HarmonizedVerdict h={harm} monthLabel={mn} /></div>}
      {!showHarm && <div className="mt-4 grid gap-4 md:grid-cols-2">
        {SIDES.map((sd) => {
          const years: number[] = [];
          for (let y = Math.max(sd.first, r0); y <= Math.min(2025, r1); y += 1) years.push(y);
          const now = area ? (areaNow && areaNow.complete ? (sd.key === "MODIS" ? areaNow.modis : areaNow.noaa) : null) : c?.[sd.key]?.month_to_date ?? null;
          const r = now != null && h && years.length ? compare(now, meta.days_covered, meta.days_in_month, h[sd.sensor], years) : null;
          return (
          <div key={sd.key} className="rounded-2xl border border-[var(--hairline)] p-4">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{sd.title} · vs {sd.history}</p>
            {r ? (
              <>
                <p className="tabular mt-2 text-2xl text-[var(--text-primary)]">{fmtInt(r.n)} <span className="text-sm text-[var(--text-secondary)]">detections so far</span></p>
                <p className="tabular mt-1 text-sm text-[var(--text-secondary)]">Pace for the full month ≈ <span className="text-[var(--text-primary)]">{fmtInt(r.pace)}</span> · {mn} median {years[0]}–{years[years.length - 1]}: <span className="text-[var(--text-primary)]">{r.median == null ? "not recorded" : fmtInt(r.median)}</span></p>
                <p className="tabular mt-1 text-sm text-[var(--text-secondary)]">Pace is above {r.below} of {r.years} past {mn}s (percentile {r.percentile == null ? "not recorded" : fmtNum(r.percentile, 0)}).</p>
              </>
            ) : <p className="mt-2 text-sm text-[var(--text-muted)]">{years.length ? "Not recorded for this selection." : `No ${sd.key === "MODIS" ? "MODIS" : "VIIRS"} history years inside the date range.`}</p>}
          </div>); })}
      </div>}
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
        Pace: {data.pace_definition}. Percentile: {data.percentile_definition}. Filters: {meta.filters}.{" "}
        {area ? <>Area: the {area.cells.length} grid cells of the selection, detections counted in the cell they fall in.</> : <>Membership: {data.membership}. Countries: {data.selection}.</>}
        {data.incomplete && data.incomplete.length > 0 && <> Not recorded this run (a FIRMS request failed after retries): {data.incomplete.map(prettyName).join(", ")}.</>}
        {data.no_outline.length > 0 && <> Not recorded (no 110 m outline): {data.no_outline.map(prettyName).join(", ")}.</>}
        {!area && data.harmonized_note && <> {data.harmonized_note} <Link className="link-ul" href="/method#bridge">How the bridge was tested →</Link></>}
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
  const harm = Object.values(data.countries).map((c) => c.harmonized).filter((h): h is HarmonizedMtd => !!h);
  const hAbove = harm.filter((h) => h.pace_range[0] > h.history_median).length;
  const hBelow = harm.filter((h) => h.pace_range[1] < h.history_median).length;
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
      {harm.length > 0 && (
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-[var(--text-secondary)]" data-testid="month-unusual-harmonized">
          <BridgedBadge /> On the harmonized scale, <span className="tabular text-[var(--text-primary)]">{harm.length}</span> countries pass the NOAA-20 bridge test <InfoDot k="bridge" align="start" />: <span className="tabular text-[var(--ember)]">{hAbove}</span> are on pace above their {mn} median {harm[0].history_years.join("–")} beyond the typical error, <span className="tabular text-[var(--ember)]">{hBelow}</span> below it, and the rest are within it.
        </p>
      )}
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {data.window_utc[0]} to {data.window_utc[1]}, {data.days_covered} of {data.days_in_month} days, straight-line pace; MODIS near-real-time (Terra and Aqua are drifting) against the raw MODIS archive. Countries: {data.selection}.{" "}
        <Link className="link-ul text-[var(--text-primary)]" href="/seasons#this-month">Each country →</Link>
      </p>
    </section>
  );
}
