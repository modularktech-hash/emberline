"use client";

import { useMemo, useState } from "react";
import { MONTHS, fmt, fmtCompact, median, quantile } from "@/lib/ember";
import { FirePulse } from "@/components/FirePulse";
import { CountryPicker } from "@/components/CountryPicker";
import { PageHead, Reveal } from "@/components/ui";
import { useAreaData, type Area } from "@/lib/useArea";

const W = 720, H = 300, L = 46, R = 16, T = 18, B = 30;

/** A chosen year against the historical median and middle 50% for each month. */
export function Seasons() {
  const [area, setArea] = useState<Area>({ kind: "country", name: "Canada" });
  const [year, setYear] = useState(2023);
  const { data, error, loading } = useAreaData(area);

  const v = useMemo(() => {
    if (!data) return null;
    const rows = data.harmonized.rows.filter((r) => r.year >= 2003 && r.value !== null);
    const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
    const months = MONTHS.map((_, i) => {
      const others = rows.filter((r) => r.month === i + 1 && r.year !== year).map((r) => r.value as number);
      const own = rows.find((r) => r.month === i + 1 && r.year === year)?.value ?? null;
      return { med: median(others), q1: quantile(others, 0.25), q3: quantile(others, 0.75), p90: quantile(others, 0.9), own };
    });
    const max = Math.max(1, ...months.flatMap((m) => [m.q3 ?? 0, m.own ?? 0, m.p90 ?? 0])) * 1.08;
    return { years, months, max };
  }, [data, year]);

  const x = (i: number) => L + (i / 11) * (W - L - R);
  const y = (val: number, max: number) => T + (1 - val / max) * (H - T - B);

  return (
    <div>
      <PageHead eyebrow="Insights · unusual conditions · critical periods" title="Is this year" italic="normal?"
        lede="Each month of a chosen year against that month's historical median and spread, on the harmonized record — so 2005 and 2025 are compared in the same unit." />
      <div className="card mt-8 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <CountryPicker value={area.kind === "country" ? area.name : "Custom area"} options={data?.countries ?? []} onChange={(c) => setArea({ kind: "country", name: c })} />
          <label className="ml-auto flex items-center gap-2 text-sm text-[var(--text-secondary)]">Year
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[var(--text-primary)]">
              {(v?.years ?? [year]).map((yy) => <option key={yy}>{yy}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="mt-6 text-sm text-[var(--text-secondary)]">Could not load the data: {error.message}</p>}
        {loading && <div className="mt-6 h-[300px] animate-pulse rounded-2xl bg-[var(--surface-2)]" />}
        {v && (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 w-full" role="img" aria-label={`Monthly detections in ${year} against the historical median`}>
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <g key={f}>
                  <line x1={L} x2={W - R} y1={y(f * v.max, v.max)} y2={y(f * v.max, v.max)} stroke="var(--gridline)" />
                  <text x={L - 8} y={y(f * v.max, v.max) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)" className="tabular">{fmtCompact(f * v.max)}</text>
                </g>
              ))}
              {MONTHS.map((m, i) => <text key={m} x={x(i)} y={H - 9} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{m}</text>)}
              <path fill="var(--cool)" opacity="0.16"
                d={`${v.months.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m.q3 ?? 0, v.max)}`).join(" ")} ${[...v.months].reverse().map((m, i) => `L${x(11 - i)},${y(m.q1 ?? 0, v.max)}`).join(" ")} Z`} />
              <path fill="none" stroke="var(--cool)" strokeWidth="1.6" strokeDasharray="4 4"
                d={v.months.map((m, i) => `${i ? "L" : "M"}${x(i)},${y(m.med ?? 0, v.max)}`).join(" ")} />
              <path fill="none" stroke="var(--ember)" strokeWidth="2.4" strokeLinejoin="round"
                d={v.months.filter((m) => m.own !== null).map((m, i) => `${i ? "L" : "M"}${x(v.months.indexOf(m))},${y(m.own as number, v.max)}`).join(" ")} />
              {v.months.map((m, i) => m.own !== null && (
                <circle key={i} cx={x(i)} cy={y(m.own, v.max)} r={m.p90 !== null && m.own > m.p90 ? 5 : 3}
                  fill={m.p90 !== null && m.own > m.p90 ? "var(--seq-7)" : "var(--ember)"} stroke="var(--surface-page)" strokeWidth="1.5" />
              ))}
            </svg>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-secondary)]">
              <span><span className="mr-1.5 inline-block h-0.5 w-5 bg-[var(--ember)] align-middle" />{year}</span>
              <span><span className="mr-1.5 inline-block w-5 border-t border-dashed border-[var(--cool)] align-middle" />median of other years</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-5 bg-[var(--cool)] align-middle opacity-30" />middle 50% of years</span>
              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[var(--seq-7)] align-middle" />above the 90th percentile</span>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="tabular w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Month</th><th className="font-normal">{year}</th><th className="font-normal">Median</th><th className="font-normal">vs median</th><th className="font-normal">Reading</th></tr></thead>
                <tbody>
                  {v.months.map((m, i) => {
                    const ratio = m.own !== null && m.med ? m.own / m.med : null;
                    const high = m.own !== null && m.p90 !== null && m.own > m.p90;
                    const above = m.own !== null && m.q3 !== null && m.own > m.q3;
                    return (
                      <tr key={i} className="border-t border-[var(--hairline)]">
                        <td className="py-2 text-[var(--text-secondary)]">{MONTHS[i]}</td>
                        <td>{fmt(m.own)}</td><td className="text-[var(--text-secondary)]">{fmt(m.med)}</td>
                        <td className={high ? "font-medium text-[var(--ember)]" : ""}>{ratio === null ? "—" : `×${ratio.toFixed(2)}`}</td>
                        <td className="text-xs text-[var(--text-secondary)]">{m.own === null ? "no data" : high ? "Critical: above 9 in 10 years" : above ? "Above the usual range" : "Within or below the usual range"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
              Historical statements, not forecasts. Baseline: every other year from 2003 in the harmonized record ({data?.params.unit}).
            </p>
          </>
        )}
      </div>
    <Reveal>
        <section className="card mt-10 grid items-center gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="eyebrow">Fire Pulse</p>
            <h2 className="display mt-2 text-4xl">Twenty-three fire seasons in one glance.</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              Each ring is a year, oldest at the centre; each slice is a month. A fire season shows as a band of colour sweeping around the clock — if it widens, shifts, or burns darker in recent rings, you can see it here before you read a number. Harmonized record, same Ember ramp as the calendar.
            </p>
          </div>
          {data && <FirePulse cal={data.harmonized} />}
        </section>
      </Reveal>
    </div>
  );
}
