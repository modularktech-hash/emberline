"use client";

import { fmtInt, fmtSigned } from "@/lib/format";
import { useChartScale } from "@/lib/useChartScale";
import { Eyebrow } from "@/components/Figure";
import { DotStat } from "@/components/DotMatrix";

import { useState } from "react";
import { CountryPicker } from "@/components/CountryPicker";
import { Failed, Loading, PageHead, Reveal, Segmented } from "@/components/ui";
import { fireDayLabel, fireYearMonthTicks, getCountryTable, getSeason, partialReason } from "@/lib/data";
import { useParquet } from "@/lib/useParquet";
import { prettyName } from "@/lib/names";
import { ScrollBox, SortTh, TableSearch, useTable } from "@/components/TableTools";

type Metric = "onset" | "peak" | "end" | "length";
const LABEL: Record<Metric, string> = { onset: "Season onset (10% of the year's detections)", peak: "Season midpoint (50% of the year's detections)", end: "Season end (90%)", length: "Season length (onset → end, days)" };
const SHORT: Record<Metric, string> = { onset: "onset", peak: "midpoint", end: "end", length: "length" };
const DEF: Record<Metric, string> = {
  onset: "Day of the fire year by which 10% of that year's detections had happened.",
  peak: "Day by which 50% of the year's detections had happened (the season midpoint).",
  end: "Day by which 90% of the year's detections had happened.",
  length: "Days from onset (10%) to end (90%).",
};
/** Sensor share = 1 − harmonized trend ÷ raw trend. Outside 0–100% the ratio is unstable (opposite signs, or a small raw trend). */
const shareUnstable = (v: number | null) => v != null && (v < 0 || v > 1);
const fmt = (v: number | null | undefined) => fmtSigned(v);

export function TrendsPage() {
  const { data, error, loading, retry } = useParquet(async () => {
    const [season, table] = await Promise.all([getSeason(), getCountryTable().catch(() => null)]);
    return { ...season, pooled: new Set((table?.countries ?? []).filter((r) => r.fit_source === "pooled").map((r) => r.country)) };
  }, "season+table");
  const names = data ? Object.keys(data.countries).sort() : [];
  const [country, setCountry] = useState("Chile");
  const [metric, setMetric] = useState<Metric>("onset");
  const { ref: chartRef, fs, narrow } = useChartScale(760);
  const c = data?.countries[country];
  const monthly = c?.resolution === "monthly";
  const nDaily = names.filter((n) => data?.countries[n].resolution !== "monthly").length;
  const mvd = data?.monthly_vs_daily;
  type Col = "name" | "res" | "raw_onset" | "harm_onset" | "raw_length" | "harm_length" | "share";
  const shareOf = (n: string) => {
    const t = data!.countries[n].trend_days_per_decade;
    return t.raw_onset != null && t.harm_onset != null && Math.abs(t.raw_onset) > 0.5 ? 1 - t.harm_onset / t.raw_onset : null;
  };
  const tbl = useTable<string, Col>(names, (n) => n, (n, k) => {
    if (k === "name") return prettyName(n);
    if (k === "res") return data!.countries[n].resolution ?? "daily";
    if (k === "share") return shareOf(n);
    return data!.countries[n].trend_days_per_decade[k];
  }, { k: "name", dir: 1 });

  const W = 760, H = 380, L = 54, R = 18, T = 18, B = 30;
  // Every year is kept; years whose window is incomplete (season.json `partial`) are shown as "incomplete", not dropped.
  const years = c?.years ?? [];
  const isPart = (y: { partial?: ("raw" | "harm")[] }, s: "raw" | "harm") => y.partial?.includes(s) ?? false;
  const partReason = (y: { year: number; partial?: ("raw" | "harm")[] }) => (y.partial ?? []).map((s) => `${s === "raw" ? "raw" : "harmonized"}: ${partialReason(y.year, c!.fire_year_start_month, s)}`).join("; ");
  const yx = (yr: number) => T + ((yr - 2003) / 22) * (H - T - B);
  const dx = (d: number) => L + (d / 366) * (W - L - R);
  const months = fireYearMonthTicks(c?.fire_year_start_month ?? 1);;

  return (
    <div>
      <PageHead compact eyebrow="Insights · season shift" title="Is the fire season moving?" italic="Or is it the sensor?"
        lede="For every year: when the season starts (10% of the year's detections), reaches its midpoint (50%) and ends (90%). In the raw record, VIIRS's sharper eyes catch small early burns MODIS never could, so seasons appear to start earlier. The harmonized record removes that." />

      {error && <Failed error={error} retry={retry} what="the season timings (season.json)" />}
      {loading && <Loading h={420} />}
      {c && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <CountryPicker value={country} options={names} onChange={setCountry}
              tags={Object.fromEntries(names.map((n) => [n, data?.pooled.has(n) ? ("pooled" as const) : null]))} />
            <span title={data?.resolution_note} className={`rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${monthly ? "bg-[var(--surface-2)] text-[var(--text-secondary)]" : "bg-[var(--ember-soft)] text-[var(--ember)]"}`}>
              {monthly ? "monthly resolution" : "daily resolution"}
            </span>
          </div>
          {monthly && (
            <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--text-secondary)]">
              Monthly resolution: there is no point-detection table for {prettyName(country)} here, so onset, midpoint and end are estimated from the monthly calendars, assuming detections are spread evenly within each month. Read dates as approximate.
              {mvd?.countries ? <> Where both exist ({mvd.countries} countries), the monthly method&apos;s trends differ from the daily ones by a median of {fmtSigned(mvd.trend_abs_diff_median, 1).replace("+", "")} and at most {fmtSigned(mvd.trend_abs_diff_max, 1).replace("+", "")} days per decade.</> : null}
            </p>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["onset", "peak", "end", "length"] as Metric[]).map((m, i) => {
              const raw = c.trend_days_per_decade[`raw_${m}`], harm = c.trend_days_per_decade[`harm_${m}`];
              return (
                <Reveal key={m} delay={i * 0.05}>
                  <button type="button" onClick={() => setMetric(m)} className={`card w-full p-5 text-left transition-transform hover:-translate-y-0.5 ${metric === m ? "!border-[var(--ember)]" : ""}`}>
                    <Eyebrow>{SHORT[m]} · days per decade</Eyebrow>
                    <div className="mt-3 flex items-end gap-4">
                      <div><p className="display tabular text-4xl"><DotStat text={String(fmt(harm))} dot={6} /></p><p className="text-xs text-[var(--text-secondary)]">harmonized</p></div>
                      <div><p className="display tabular text-2xl text-[var(--seq-5)]">{fmt(raw)}</p><p className="text-xs text-[var(--text-secondary)]">raw</p></div>
                    </div>
                    <p className="mt-3 text-[11px] leading-snug text-[var(--text-muted)]">{DEF[m]} Trend 2003–2025, negative = earlier / shorter.</p>
                  </button>
                </Reveal>
              );
            })}
          </div>

          <Reveal>
            <section className="window mt-8 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Eyebrow>{prettyName(country)} · the fire season, year by year (fire year starts {fireDayLabel(1, c.fire_year_start_month)})</Eyebrow>
                <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
                  <span><span className="mr-1.5 inline-block h-2.5 w-5 rounded-sm bg-[var(--ink)] align-middle opacity-80" />harmonized</span>
                  <span><span className="mr-1.5 inline-block h-2.5 w-5 rounded-sm bg-[var(--seq-4)] align-middle opacity-60" />raw</span>
                </div>
              </div>
              <svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} className="fade-in mt-4 w-full overflow-visible" role="img" aria-label={`Fire season timing in ${prettyName(country)}`}>
                {months.map((m, mi) => <g key={m.day}><line x1={dx(m.day)} x2={dx(m.day)} y1={T} y2={H - B} stroke="var(--gridline)" /><text x={dx(m.day) + 3} y={H - 10} fontSize={fs(10)} fill="var(--text-muted)">{narrow && mi % 2 === 1 ? "" : m.label}</text></g>)}
                {years.map((y) => {
                  const cy = yx(y.year);
                  return (
                    <g key={y.year}>
                      {(!narrow || (y.year - 2012) % 3 === 0) && <text x={L - 8} y={cy + 3.5} textAnchor="end" fontSize={fs(10)} fill={y.year === 2012 ? "var(--ember)" : "var(--text-muted)"}>{y.year}</text>}
                      {y.raw_onset != null && y.raw_end != null && (
                        <rect x={dx(y.raw_onset)} y={cy - 6} width={dx(y.raw_end) - dx(y.raw_onset)} height="5" rx="2.5" fill="var(--seq-4)" opacity="0.55" />
                      )}
                      {y.harm_onset != null && y.harm_end != null && (
                        <rect x={dx(y.harm_onset)} y={cy} width={dx(y.harm_end) - dx(y.harm_onset)} height="5" rx="2.5" fill="var(--ink)" opacity="0.8" />
                      )}
                      {(y.partial?.length ?? 0) > 0 && (
                        <g>
                          <title>{`${y.year} incomplete — ${partReason(y)}`}</title>
                          <line x1={L + 4} x2={W - R} y1={cy + 2} y2={cy + 2} stroke="var(--text-muted)" strokeDasharray="3 4" opacity="0.6" />
                          <text x={L + 8} y={cy - 1} fontSize={fs(10)} fill="var(--text-muted)">incomplete{y.partial!.length === 1 ? ` (${y.partial![0] === "raw" ? "raw" : "harmonized"})` : ""}</text>
                        </g>
                      )}
                      {y.harm_peak != null && <circle cx={dx(y.harm_peak)} cy={cy + 2.5} r="3.5" fill="var(--ember)" stroke="#fff" strokeWidth="1" />}
                    </g>
                  );
                })}
              </svg>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Bars run from onset (10%) to end (90%); the dot marks the season midpoint (50% of the year&apos;s detections). Raw: MODIS to 2011, VIIRS from 2012. Harmonized: Aqua-equivalent throughout.</p>
            </section>
          </Reveal>

          <Reveal>
            <section className="card mt-8 overflow-x-auto p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="display text-3xl">{LABEL[metric]}</h2>
                <Segmented label="metric" value={metric} onChange={setMetric} options={(["onset", "peak", "end", "length"] as Metric[]).map((m) => ({ value: m, label: SHORT[m] }))} />
              </div>
              <table className="tabular mt-5 w-full min-w-[620px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Year</th><th className="font-normal">Raw</th><th className="font-normal">Harmonized</th><th className="font-normal">Difference</th><th className="font-normal">Raw detections</th><th className="font-normal">Harmonized</th></tr></thead>
                <tbody>
                  {years.map((y) => {
                    const r = y[`raw_${metric}` as keyof typeof y] as number | null | undefined;
                    const h = y[`harm_${metric}` as keyof typeof y] as number | null | undefined;
                    const show = (v: number | null | undefined, s?: "raw" | "harm") => (s && isPart(y, s) ? <span title={partialReason(y.year, c.fire_year_start_month, s)} className="font-mono text-[10px] uppercase text-[var(--ember)]">incomplete</span> : metric === "length" ? (v ?? "—") : fireDayLabel(v, c.fire_year_start_month));
                    return (
                      <tr key={y.year} className="border-t border-[var(--hairline)]">
                        <td className={`py-2 ${y.year === 2012 ? "text-[var(--ember)]" : ""}`}>{y.year}</td>
                        <td className="text-[var(--text-secondary)]">{show(r, "raw")}</td><td>{show(h, "harm")}</td>
                        <td className="text-[var(--text-secondary)]">{r != null && h != null ? `${fmtSigned(r - h, 0)} d` : "—"}</td>
                        <td className="text-[var(--text-muted)]">{isPart(y, "raw") ? "—" : fmtInt(y.raw_total)}</td>
                        <td className="text-[var(--text-muted)]">{isPart(y, "harm") ? "—" : fmtInt(y.harm_total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {years.some((y) => (y.partial?.length ?? 0) > 0) && (
                <ul className="mt-3 space-y-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  {years.filter((y) => (y.partial?.length ?? 0) > 0).map((y) => <li key={y.year}><span className="text-[var(--ember)]">{y.year} incomplete</span> — {partReason(y)}. Not a low or missing season: this year is left out of the trends.</li>)}
                </ul>
              )}
            </section>
          </Reveal>

          <Reveal>
            <section className="card mt-8 min-w-0 p-5 sm:p-6">
              <h2 className="display text-3xl">Every fitted country, side by side</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Least-squares trend 2003–2025, days per decade. Negative = earlier. {nDaily} at daily resolution, {names.length - nDaily} at monthly resolution (marked). Click a row to open it above.</p>
              <div className="mt-4"><TableSearch q={tbl.q} setQ={tbl.setQ} shown={tbl.shown.length} total={names.length} /></div>
              <ScrollBox>
              <table className="tabular w-full min-w-[720px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]">
                  <SortTh k="name" {...tbl}>Country</SortTh><SortTh k="res" {...tbl}>Resolution</SortTh>
                  <SortTh k="raw_onset" {...tbl}>Onset raw</SortTh><SortTh k="harm_onset" {...tbl}>Onset harmonized</SortTh>
                  <SortTh k="raw_length" {...tbl}>Length raw</SortTh><SortTh k="harm_length" {...tbl}>Length harmonized</SortTh>
                  <SortTh k="share" {...tbl} title="1 − (harmonized onset trend ÷ raw onset trend): the part of the raw trend that disappears after harmonizing">Sensor share of onset shift</SortTh>
                </tr></thead>
                <tbody>
                  {tbl.shown.map((n) => {
                    const t = data!.countries[n].trend_days_per_decade;
                    const share = shareOf(n);
                    const mon = data!.countries[n].resolution === "monthly";
                    return (
                      <tr key={n} onClick={() => { setCountry(n); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`cursor-pointer border-t border-[var(--hairline)] hover:bg-[var(--ember-soft)] ${n === country ? "bg-[var(--ember-soft)]" : ""}`}>
                        <td className="py-2.5 pr-3">{prettyName(n)}{data!.pooled.has(n) && <span className="ml-1.5 font-mono text-[10px] uppercase text-[var(--ember)]">pooled</span>}</td>
                        <td className="px-3 text-xs text-[var(--text-muted)]">{mon ? "monthly" : "daily"}</td>
                        <td className="px-3 text-[var(--seq-5)]">{fmt(t.raw_onset)}</td><td className="px-3">{fmt(t.harm_onset)}</td>
                        <td className="px-3 text-[var(--seq-5)]">{fmt(t.raw_length)}</td><td className="px-3">{fmt(t.harm_length)}</td>
                        <td className="px-3 text-[var(--text-secondary)]">{share == null ? "—" : shareUnstable(share) ? <span title="Outside 0–100%: the raw and harmonized trends have opposite signs or the raw trend is small, so the ratio is not meaningful">{Math.round(share * 100)}% <span className="font-mono text-[10px] uppercase text-[var(--ember)]">unstable</span></span> : `${Math.round(share * 100)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </ScrollBox>
              <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">&quot;Sensor share&quot; = 1 − (harmonized onset trend ÷ raw onset trend): the part of the raw onset trend that disappears after harmonizing. It is only computed where the raw trend exceeds 0.5 days per decade, and is marked unstable when it falls outside 0–100% (the two trends have opposite signs, or harmonizing makes the trend larger). A trend over 23 years is fragile, especially where the fire year is short; read these as indications, with the year-by-year table above.</p>
            </section>
          </Reveal>
        </>
      )}
    </div>
  );
}
