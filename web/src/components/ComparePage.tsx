"use client";

import { fmtPct, fmtR2, fmtRatio } from "@/lib/format";
import { useChartScale } from "@/lib/useChartScale";
import { Eyebrow, Stat } from "@/components/Figure";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { MonthYearCalendar } from "@/components/MonthYearCalendar";
import { CountryPicker } from "@/components/CountryPicker";
import { Failed, Loading, PageHead, Reveal, Segmented } from "@/components/ui";
import { annualTotals, fmt, fmtCompact, stepRatio } from "@/lib/ember";
import { getCountryTable } from "@/lib/data";
import { getCalendar, getParams } from "@/lib/queries";
import { FitQualityTag } from "@/components/FitQuality";
import { fitQuality } from "@/lib/quality";
import { useParquet } from "@/lib/useParquet";
import type { Series } from "@/lib/types";
import { prettyName } from "@/lib/names";

const COLORS = ["#d9431a", "#3f7f96"];

export function ComparePage() {
  const { data: table, error: tableError } = useParquet(() => getCountryTable(), "table");
  const { data: params, error: paramsError, retry: paramsRetry } = useParquet(() => getParams(), "params");
  // Fallback dataset: countries.json (world-only) is refused, so pick from the loaded fit's countries.
  const names = table?.countries.map((c) => c.country) ?? (params ? Object.keys(params.countries).sort() : []);
  const tags = Object.fromEntries((table?.countries ?? []).map((c) => [c.country, c.fit_source === "pooled" ? ("pooled" as const) : null]));
  const [a, setA] = useState("Canada");
  const [b, setB] = useState("Australia");
  const [mode, setMode] = useState<Series>("harmonized");
  const [norm, setNorm] = useState<"abs" | "idx">("idx");
  const { ref: chartRef, fs, narrow } = useChartScale(760);
  const { data, error, loading, retry } = useParquet(async () => Promise.all([a, b].map((k) => getCalendar({ scope: "country", keys: [k], mode }))), `${a}|${b}|${mode}`);

  const view = useMemo(() => {
    if (!data) return null;
    const series = data.map((cal) => annualTotals(cal, 2003, 2025));
    const scaled = series.map((s) => {
      const mean = s.reduce((t, x) => t + (x.value ?? 0), 0) / s.length;
      return s.map((x) => (norm === "idx" ? ((x.value ?? 0) / (mean || 1)) * 100 : x.value ?? 0));
    });
    const max = Math.max(1, ...scaled.flat()) * 1.06;
    return { series, scaled, max, maxCell: Math.max(...data.map((c) => Math.max(1, ...c.rows.map((r) => r.value ?? 0)))) };
  }, [data, norm]);
  const W = 760, H = 300, L = 50, R = 16, T = 16, B = 28;
  const x = (i: number) => L + (i / 22) * (W - L - R);

  return (
    <div>
      <PageHead compact eyebrow="Explore · compare" title="Two regions." italic="One unit."
        lede="Because the harmonized record is in the same unit every year, two regions can be compared directly — their seasons, their extremes, and how each responded to the 2012 sensor change." />
      <div className="card flex flex-wrap items-end gap-x-5 gap-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Regions">
          {[["A", a, setA], ["B", b, setB]].map(([l, v, set], i) => (
            <div key={l as string} className="flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[i] }} />
              <CountryPicker value={v as string} options={names.length ? names : [v as string]} tags={tags} onChange={set as (s: string) => void} label={`Region ${l}`} />
            </div>
          ))}
          <button type="button" onClick={() => { setA(b); setB(a); }} aria-label="Swap region A and region B"
            className="glass-thin min-h-[36px] px-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">⇄ Swap</button>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Record</p>
            <Segmented label="cmp-mode" value={mode} onChange={setMode} options={[{ value: "raw", label: "Raw" }, { value: "harmonized", label: "Harmonized" }]} />
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Scale</p>
            <Segmented label="cmp-norm" value={norm} onChange={setNorm} options={[{ value: "idx", label: "Index, mean = 100" }, { value: "abs", label: "Absolute" }]} />
          </div>
        </div>
        <p className="w-full text-xs leading-relaxed text-[var(--text-secondary)]">
          {norm === "idx"
            ? "Index, mean = 100: each region's yearly detections divided by its own 2003–2025 average, ×100. 150 means half again as many detections as that region's usual year, so a small and a large region share one axis."
            : "Absolute: yearly detection counts. The larger region dominates the axis."}
          {" "}The two calendars below share one colour scale.
        </p>
      </div>
      <p className="mt-2 px-1 text-xs text-[var(--text-muted)]">{names.length ? `${names.length} fitted countries, each corrected with its own fit (or the pooled curve where marked).` : ""} Countries without a fit (reasons on the Data page) have no harmonized record; their raw record is in the Explorer.{mode === "raw" && " Showing the raw record: uncorrected, with the 2012 sensor step."}</p>
      {paramsError && <div className="mt-6"><Failed error={paramsError} retry={paramsRetry} what="the fit" /></div>}
      {tableError && !paramsError && <p className="mt-4 text-sm text-[var(--text-secondary)]">Country summaries (countries.json) unavailable: {tableError.message}</p>}
      {error && <div className="mt-6"><Failed error={error} retry={retry} what="the calendars" /></div>}
      {loading && <div className="mt-6"><Loading h={300} /></div>}
      {view && data && (
        <>
          <Reveal>
            <section className="window mt-6 p-4 sm:p-6">
              <Eyebrow>Yearly detections · {norm === "idx" ? "indexed, each region's 2003–2025 mean = 100" : "absolute"}</Eyebrow>
              <svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full overflow-visible">
                {[0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={T + (1 - f) * (H - T - B)} y2={T + (1 - f) * (H - T - B)} stroke="var(--gridline)" /><text x={L - 8} y={T + (1 - f) * (H - T - B) + 3.5} textAnchor="end" fontSize={fs(10)} fill="var(--text-muted)">{fmtCompact(f * view.max)}</text></g>)}
                {Array.from({ length: 23 }, (_, i) => 2003 + i).filter((y) => (narrow ? y % 8 === 3 : y % 4 === 3)).map((y) => <text key={y} x={x(y - 2003)} y={H - 8} textAnchor="middle" fontSize={fs(10)} fill="var(--text-muted)">{y}</text>)}
                <line x1={x(8.5)} x2={x(8.5)} y1={T} y2={H - B} stroke="var(--text-muted)" strokeDasharray="3 4" />
                {view.scaled.map((s, k) => (
                  <motion.path key={`${k}-${mode}-${norm}-${a}-${b}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }}
                    d={s.map((v, i) => `${i ? "L" : "M"}${x(i)},${T + (1 - v / view.max) * (H - T - B)}`).join(" ")} fill="none" stroke={COLORS[k]} strokeWidth="2.6" />
                ))}
                {view.scaled.map((s, k) => {
                  // Direct labels at the line ends, nudged apart if they would overlap.
                  const ys = view.scaled.map((q) => T + (1 - q[q.length - 1] / view.max) * (H - T - B));
                  let yy = ys[k] - 8;
                  if (k === 1 && Math.abs(ys[1] - ys[0]) < 14) yy = ys[0] + (ys[1] >= ys[0] ? 16 : -22);
                  return <text key={`lab-${k}`} x={x(s.length - 1)} y={Math.max(T + 10, yy)} textAnchor="end" fontSize={fs(12)} fontWeight="600" fill={COLORS[k]}>{k === 0 ? "A" : "B"} · {prettyName(k === 0 ? a : b)}</text>;
                })}
              </svg>
            </section>
          </Reveal>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {[a, b].map((n, k) => {
              const row = table?.countries.find((c) => c.country === n);
              const s = view.series[k];
              const best = [...s].sort((p, q) => (q.value ?? 0) - (p.value ?? 0))[0];
              return (
                <Reveal key={n} delay={k * 0.08} className="min-w-0">
                  <section className="card p-5">
                    <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[k] }} /><h2 className="display text-3xl">{prettyName(n)}</h2>{row?.fit_source === "pooled" && <span className="rounded-full bg-[var(--ember-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ember)]">pooled fit</span>}</div>
                    {params?.countries[n] && (
                      <div className="mt-2">
                        <FitQualityTag fit={params.countries[n]} />
                        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{fitQuality(params.countries[n]).interpretation} Held-out {params.test_years[0]}–{params.test_years[1]}, cell × month.</p>
                      </div>
                    )}
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <Stat size="sm" label="2012 step" value={fmtRatio(stepRatio(annualTotals(data[k], 2009, 2014)))} />
                      <Stat size="sm" label="Busiest year" value={String(best?.year ?? "—")} note={<span className="tabular">{fmt(best?.value)}</span>} />
                      <Stat size="sm" label="Held-out R²" value={row ? fmtR2(row.r2_model) : "—"} note={<span>bias {row ? fmtPct(row.bias_pct) : "—"}{mode === "raw" ? " · showing raw, uncorrected" : ""}</span>} />
                    </div>
                    <div className="mt-5"><MonthYearCalendar cal={data[k]} from={2003} to={2025} max={view.maxCell} /></div>
                  </section>
                </Reveal>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
