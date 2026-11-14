"use client";

import { fmtPct, fmtR2, fmtRatio } from "@/lib/format";
import { useChartScale } from "@/lib/useChartScale";
import { Eyebrow } from "@/components/Figure";
import { useMemo, useState } from "react";
import { MONTHS, fmt, fmtCompact, median, quantile } from "@/lib/ember";
import { FirePulse } from "@/components/FirePulse";
import { CountryPicker } from "@/components/CountryPicker";
import { Failed, PageHead, Reveal } from "@/components/ui";
import { areaLabel, useAreaData, type Area } from "@/lib/useArea";
import { CoverageNote, useCoverageState, CoverageError } from "@/components/CoverageNote";
import { FitQualityTag } from "@/components/FitQuality";
import { STATUS_LABEL } from "@/lib/coverage";

const W = 720, H = 300, L = 46, R = 16, T = 18, B = 30;

type Band = "none" | "below" | "within" | "above" | "p90";
const BAND: Record<Band, { label: string; mark: string }> = {
  none: { label: "No data", mark: "·" },
  below: { label: "Below typical range", mark: "▽" },
  within: { label: "Within typical range", mark: "○" },
  above: { label: "Above typical range", mark: "△" },
  p90: { label: "Above 90th percentile", mark: "▲" },
};
/** Typical range = the middle 50% of the other years (25th–75th percentile). */
function bandOf(m: { own: number | null; q1: number | null; q3: number | null; p90: number | null }): Band {
  if (m.own === null) return "none";
  if (m.p90 !== null && m.own > m.p90) return "p90";
  if (m.q3 !== null && m.own > m.q3) return "above";
  if (m.q1 !== null && m.own < m.q1) return "below";
  return "within";
}

/** A chosen year against the historical median and middle 50% for each month. */
export function Seasons() {
  const [area, setArea] = useState<Area>({ kind: "country", name: "Canada" });
  const [year, setYear] = useState(2023);
  const { ref: chartRef, fs, narrow } = useChartScale(720);
  const { data, error, loading, retry } = useAreaData(area);
  const coverageState = useCoverageState();
  const coverage = coverageState.data;
  const cov = area.kind === "country" ? coverage?.countries[area.name] : undefined;

  const v = useMemo(() => {
    if (!data || data.harmonized.keys.length === 0) return null;
    const rows = data.harmonized.rows.filter((r) => r.year >= 2003 && r.value !== null);
    const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
    const months = MONTHS.map((_, i) => {
      const others = rows.filter((r) => r.month === i + 1 && r.year !== year).map((r) => r.value as number);
      const own = rows.find((r) => r.month === i + 1 && r.year === year)?.value ?? null;
      return { med: median(others), q1: quantile(others, 0.25), q3: quantile(others, 0.75), p90: quantile(others, 0.9), own };
    });
    const max = Math.max(1, ...months.flatMap((m) => [m.q3 ?? 0, m.own ?? 0, m.p90 ?? 0])) * 1.08;
    // Takeaway, computed: the year's total against the median yearly total of the other years.
    const totals = years.filter((yy) => yy !== year).map((yy) => rows.filter((r) => r.year === yy).reduce((t, r) => t + (r.value as number), 0));
    const ownRows = rows.filter((r) => r.year === year);
    const ownTotal = ownRows.length ? ownRows.reduce((t, r) => t + (r.value as number), 0) : null;
    const medTotal = median(totals);
    const bands = months.map(bandOf);
    return { years, months, max, bands, ownTotal, medTotal, nMonths: ownRows.length };
  }, [data, year]);

  const x = (i: number) => L + (i / 11) * (W - L - R);
  const y = (val: number, max: number) => T + (1 - val / max) * (H - T - B);

  return (
    <div>
      <PageHead compact eyebrow="Insights · unusual conditions · critical periods" title="Is this year" italic="normal?"
        lede="Each month of a chosen year against that month's historical median and spread, on the harmonized record — so 2005 and 2025 are compared in the same unit." />
      <Reveal><div className="card mt-8 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <CountryPicker value={area.kind === "country" ? area.name : ""} options={data?.countries ?? [area.kind === "country" ? area.name : "Canada"]} tags={data?.tags} onChange={(c) => setArea({ kind: "country", name: c })} />
          <label className="ml-auto flex items-center gap-2 text-sm text-[var(--text-secondary)]">Year
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="field rounded-xl px-2.5 py-1.5 text-[var(--text-primary)]">
              {(v?.years ?? [year]).map((yy) => <option key={yy}>{yy}</option>)}
            </select>
          </label>
        </div>

        {error && <div className="mt-8"><Failed error={error} retry={retry} what="the calendars for this area" /></div>}
        <CoverageError state={coverageState} className="mt-4" />
        {loading && <div className="mt-6 h-[300px] animate-pulse rounded-2xl bg-[var(--surface-2)]" />}
        {data && !v && (
          <p className="mt-6 rounded-2xl border border-[var(--hairline)] p-5 text-sm leading-relaxed text-[var(--text-secondary)]">
            {areaLabel(area)} has no fit{cov ? ` (${STATUS_LABEL[cov.status]})` : ""}, so it has no harmonized record. This page compares years in the harmonized unit only; the raw record (uncorrected) is in the Explorer.
          </p>
        )}
        {data && !v && area.kind === "country" && <CoverageNote country={area.name} coverage={coverage} className="mt-4" />}
        {v && (
          <div className="fade-in">
            {(() => {
              const hi = v.bands.map((b, i) => (b === "p90" ? MONTHS[i] : null)).filter(Boolean);
              const ab = v.bands.filter((b) => b === "above").length, be = v.bands.filter((b) => b === "below").length;
              return (
                <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-[var(--text-primary)]" data-testid="seasons-takeaway">
                  {v.ownTotal == null ? <>No harmonized data for {year}.</> : <>
                    {areaLabel(area)}, {year}: {fmt(v.ownTotal)} harmonized detections{v.nMonths < 12 ? ` in ${v.nMonths} months with data` : ""}
                    {v.medTotal ? <>, {fmtRatio(v.ownTotal / v.medTotal)} the median year</> : null}.{" "}
                    {hi.length ? <>{hi.length} {hi.length === 1 ? "month" : "months"} above the historical 90th percentile ({hi.join(", ")}); </> : <>No month above the historical 90th percentile; </>}
                    {ab} other {ab === 1 ? "month" : "months"} above and {be} below the typical range (middle 50% of other years).
                  </>}
                  <span className="text-[var(--text-muted)]"> Historical statement, not a forecast.</span>
                </p>
              );
            })()}
            <svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} className="mt-6 w-full overflow-visible" role="img" aria-label={`Monthly detections in ${year} against the historical median`}>
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <g key={f}>
                  <line x1={L} x2={W - R} y1={y(f * v.max, v.max)} y2={y(f * v.max, v.max)} stroke="var(--gridline)" />
                  <text x={L - 8} y={y(f * v.max, v.max) + 3.5} textAnchor="end" fontSize={fs(10)} fill="var(--text-muted)" className="tabular">{fmtCompact(f * v.max)}</text>
                </g>
              ))}
              {MONTHS.map((m, i) => (narrow && i % 2 === 1) ? null : <text key={m} x={x(i)} y={H - 9} textAnchor="middle" fontSize={fs(10)} fill="var(--text-muted)">{m}</text>)}
              <path fill="var(--cool)" opacity="0.16"
                d={`${v.months.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m.q3 ?? 0, v.max)}`).join(" ")} ${[...v.months].reverse().map((m, i) => `L${x(11 - i)},${y(m.q1 ?? 0, v.max)}`).join(" ")} Z`} />
              <path fill="none" stroke="var(--cool)" strokeWidth="1.6" strokeDasharray="4 4"
                d={v.months.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m.med ?? 0, v.max)}`).join(" ")} />
              <path fill="none" stroke="var(--ember)" strokeWidth="2.4" strokeLinejoin="round"
                d={v.months.filter((m) => m.own !== null).map((m, i) => `${i ? "L" : "M"}${x(v.months.indexOf(m))},${y(m.own as number, v.max)}`).join(" ")} />
              {v.months.map((m, i) => m.own !== null && (
                <g key={i}>
                  <circle cx={x(i)} cy={y(m.own, v.max)} r={v.bands[i] === "p90" ? 5 : 3}
                    fill={v.bands[i] === "p90" ? "var(--seq-7)" : "var(--ember)"} stroke="var(--surface-page)" strokeWidth="1.5" />
                  {(v.bands[i] === "p90" || v.bands[i] === "above" || v.bands[i] === "below") && (
                    <text x={x(i)} y={y(m.own, v.max) + (v.bands[i] === "below" ? 16 * (fs(10) / 10) : -9)} textAnchor="middle" fontSize={fs(10)} fill={v.bands[i] === "below" ? "var(--cool)" : "var(--seq-7)"}>{BAND[v.bands[i]].mark}</text>
                  )}
                </g>
              ))}
            </svg>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-secondary)]">
              <span><span className="mr-1.5 inline-block h-0.5 w-5 bg-[var(--ember)] align-middle" />{year}</span>
              <span><span className="mr-1.5 inline-block w-5 border-t border-dashed border-[var(--cool)] align-middle" />median of other years</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-5 bg-[var(--cool)] align-middle opacity-30" />middle 50% of years</span>
              <span>▲ above the historical 90th percentile · △ above the typical range (75th percentile) · ▽ below it (25th)</span>
            </div>
            <p className="mt-3 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              {area.kind === "country" && data?.params.countries[area.name] && <span className="mb-1 block"><FitQualityTag fit={data.params.countries[area.name]} /></span>}
              Historical statements, not forecasts.
              {(() => { const f = area.kind === "country" ? data?.params.countries[area.name] : undefined; return f ? <> {areaLabel(area)}&apos;s own fit: held-out R² {fmtR2(f.validation_test.model.r2)}, bias {fmtPct(f.validation_test.model.bias_pct)} ({data!.params.test_years[0]}–{data!.params.test_years[1]}){f.fit_source === "pooled" ? ", pooled curve" : ""}.</> : null; })()}
            </p>

            <div className="mt-6 overflow-x-auto">
              <table className="tabular w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Month</th><th className="font-normal">{year}</th><th className="font-normal">Median</th><th className="font-normal">vs median</th><th className="font-normal">Reading</th></tr></thead>
                <tbody>
                  {v.months.map((m, i) => {
                    const ratio = m.own !== null && m.med ? m.own / m.med : null;
                    const band = v.bands[i];
                    const high = band === "p90";
                    return (
                      <tr key={i} className="border-t border-[var(--hairline)]">
                        <td className="py-2 text-[var(--text-secondary)]">{MONTHS[i]}</td>
                        <td>{fmt(m.own)}</td><td className="text-[var(--text-secondary)]">{fmt(m.med)}</td>
                        <td className={high ? "font-medium text-[var(--ember)]" : ""}>{ratio === null ? "—" : fmtRatio(ratio)}</td>
                        <td className={`text-xs ${high ? "font-medium text-[var(--ember)]" : "text-[var(--text-secondary)]"}`}><span aria-hidden className="mr-1.5">{BAND[band].mark}</span>{BAND[band].label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
              Historical statements, not forecasts. Baseline: every other year from 2003 in the harmonized record ({data?.params.unit}).
            </p>
          </div>
        )}
      </div></Reveal>
    <Reveal>
        <section className="card mt-10 grid items-center gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <Eyebrow>Fire Pulse</Eyebrow>
            <h2 className="display mt-2 text-4xl">Twenty-three fire seasons in one glance.</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              Each ring is a year, oldest at the centre; each slice is a month. A fire season shows as a band of colour sweeping around the clock — if it widens, shifts, or burns darker in recent rings, you can see it here before you read a number. Harmonized record, same Ember ramp as the calendar.
            </p>
          </div>
          {data && v && <FirePulse cal={data.harmonized} />}
        </section>
      </Reveal>
    </div>
  );
}
