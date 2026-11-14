"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { MonthYearCalendar } from "@/components/MonthYearCalendar";
import { CountryPicker } from "@/components/CountryPicker";
import { Failed, Loading, PageHead, Reveal, Segmented } from "@/components/ui";
import { annualTotals, fmt, fmtCompact, stepRatio } from "@/lib/ember";
import { getCountryTable } from "@/lib/data";
import { getCalendar } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import type { Series } from "@/lib/types";

const COLORS = ["#d9431a", "#3f7f96"];

export function ComparePage() {
  const { data: table } = useParquet(() => getCountryTable(), "table");
  const names = table?.countries.map((c) => c.country).sort() ?? [];
  const [a, setA] = useState("Canada");
  const [b, setB] = useState("Australia");
  const [mode, setMode] = useState<Series>("harmonized");
  const [norm, setNorm] = useState<"abs" | "idx">("idx");
  const { data, error, loading } = useParquet(async () => Promise.all([a, b].map((k) => getCalendar({ scope: "country", keys: [k], mode }))), `${a}|${b}|${mode}`);

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
      <PageHead eyebrow="Explore · compare" title="Two regions." italic="One unit."
        lede="Because the harmonized record is in the same unit every year, two regions can be compared directly — their seasons, their extremes, and how each responded to the 2012 sensor change." />
      <div className="card flex flex-wrap items-center gap-4 p-4">
        {[["A", a, setA], ["B", b, setB]].map(([l, v, set], i) => (
          <div key={l as string} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 h-3 w-3 rounded-full" style={{ background: COLORS[i] }} />
            <CountryPicker value={v as string} options={names} onChange={set as (s: string) => void} label={`Region ${l}`} />
          </div>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Segmented label="cmp-mode" value={mode} onChange={setMode} options={[{ value: "raw", label: "Raw" }, { value: "harmonized", label: "Harmonized" }]} />
          <Segmented label="cmp-norm" value={norm} onChange={setNorm} options={[{ value: "idx", label: "Index (mean=100)" }, { value: "abs", label: "Absolute" }]} />
        </div>
      </div>
      {error && <div className="mt-6"><Failed error={error} /></div>}
      {loading && <div className="mt-6"><Loading h={300} /></div>}
      {view && data && (
        <>
          <Reveal>
            <section className="window mt-6 p-4 sm:p-6">
              <p className="eyebrow">Yearly detections · {norm === "idx" ? "indexed, each region's 2003–2025 mean = 100" : "absolute"}</p>
              <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full">
                {[0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={T + (1 - f) * (H - T - B)} y2={T + (1 - f) * (H - T - B)} stroke="var(--gridline)" /><text x={L - 8} y={T + (1 - f) * (H - T - B) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)">{fmtCompact(f * view.max)}</text></g>)}
                {Array.from({ length: 23 }, (_, i) => 2003 + i).filter((y) => y % 4 === 3).map((y) => <text key={y} x={x(y - 2003)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{y}</text>)}
                <line x1={x(8.5)} x2={x(8.5)} y1={T} y2={H - B} stroke="var(--text-muted)" strokeDasharray="3 4" />
                {view.scaled.map((s, k) => (
                  <motion.path key={`${k}-${mode}-${norm}-${a}-${b}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }}
                    d={s.map((v, i) => `${i ? "L" : "M"}${x(i)},${T + (1 - v / view.max) * (H - T - B)}`).join(" ")} fill="none" stroke={COLORS[k]} strokeWidth="2.6" />
                ))}
              </svg>
            </section>
          </Reveal>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {[a, b].map((n, k) => {
              const row = table?.countries.find((c) => c.country === n);
              const s = view.series[k];
              const best = [...s].sort((p, q) => (q.value ?? 0) - (p.value ?? 0))[0];
              return (
                <Reveal key={n} delay={k * 0.08}>
                  <section className="card p-5">
                    <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[k] }} /><h2 className="display text-3xl">{n}</h2></div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div><p className="text-xs text-[var(--text-muted)]">2012 step</p><p className="display tabular text-2xl">×{(stepRatio(annualTotals(data[k], 2009, 2014)) ?? NaN).toFixed(2)}</p></div>
                      <div><p className="text-xs text-[var(--text-muted)]">Busiest year</p><p className="display tabular text-2xl">{best?.year}</p><p className="tabular text-xs text-[var(--text-secondary)]">{fmt(best?.value)}</p></div>
                      <div><p className="text-xs text-[var(--text-muted)]">Held-out R²</p><p className="display tabular text-2xl">{row?.r2_model.toFixed(2)}</p></div>
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
