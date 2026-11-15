"use client";

import { fmtNum, fmtPct, fmtR2, fmtRatio } from "@/lib/format";
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
import { useUrlState } from "@/lib/urlState";
import { CopyLink } from "@/components/CopyLink";
import type { Series } from "@/lib/types";
import { prettyName } from "@/lib/names";

const COLORS = ["var(--c-harm)", "var(--c-raw)"];

export function ComparePage() {
  const { data: table, error: tableError, retry: tableRetry } = useParquet(() => getCountryTable(), "table");
  const { data: params, error: paramsError, retry: paramsRetry } = useParquet(() => getParams(), "params");
  // Fallback dataset: countries.json (world-only) is refused, so pick from the loaded fit's countries.
  const names = table?.countries.map((c) => c.country) ?? (params ? Object.keys(params.countries).sort() : []);
  const tags = Object.fromEntries((table?.countries ?? []).map((c) => [c.country, c.fit_source === "pooled" ? ("pooled" as const) : null]));
  const [a, setA] = useState("Canada");
  const [b, setB] = useState("Australia");
  const [mode, setMode] = useState<Series>("harmonized");
  const [norm, setNorm] = useState<"abs" | "idx">("idx");
  const [period, setPeriod] = useState<"own" | "common">("own");
  useUrlState((q) => {
    const ok = (s: string | null) => (s && /^[^\u0000-\u001f<>]{1,80}$/.test(s) ? s : null);
    setA(ok(q.get("a")) ?? "Canada"); setB(ok(q.get("b")) ?? "Australia");
    setMode(q.get("mode") === "raw" ? "raw" : "harmonized");
    setNorm(q.get("scale") === "abs" ? "abs" : "idx");
    setPeriod(q.get("period") === "common" ? "common" : "own");
  }, () => ({ a, b, mode, scale: norm, period: period === "common" ? "common" : null }), [a, b, mode, norm, period]);
  const { ref: chartRef, fs, narrow } = useChartScale(760);
  const { data, error, loading, retry } = useParquet(async () => Promise.all([a, b].map((k) => getCalendar({ scope: "country", keys: [k], mode }))), `${a}|${b}|${mode}`);

  const view = useMemo(() => {
    if (!data) return null;
    const series = data.map((cal) => annualTotals(cal, 2003, 2025));
    // Years with data (value not null) per side; "common" keeps only years both sides have.
    const has = series.map((s) => new Set(s.filter((x) => x.value !== null).map((x) => x.year)));
    const common = series[0].map((x) => x.year).filter((y) => has[0].has(y) && has[1].has(y));
    const inPeriod = (y: number, k: number) => (period === "common" ? common.includes(y) : has[k].has(y));
    const refs = series.map((s, k) => {
      const yrs = s.filter((x) => inPeriod(x.year, k)).map((x) => x.year);
      const mean = yrs.length ? s.filter((x) => yrs.includes(x.year)).reduce((t, x) => t + (x.value as number), 0) / yrs.length : null;
      const missing = s.filter((x) => x.value === null).map((x) => x.year);
      return { yrs, mean, missing };
    });
    // Missing years and years outside the period are gaps (null), never zero. A zero or absent mean cannot be indexed.
    const scaled = series.map((s, k) => s.map((x) => {
      if (x.value === null || !inPeriod(x.year, k)) return null;
      if (norm === "abs") return x.value;
      const m = refs[k].mean;
      return m ? (x.value / m) * 100 : null;
    }));
    const max = Math.max(1, ...scaled.flat().map((v) => v ?? 0)) * 1.06;
    return { series, scaled, max, refs, common, maxCell: Math.max(...data.map((c) => Math.max(1, ...c.rows.map((r) => r.value ?? 0)))) };
  }, [data, norm, period]);
  const W = 760, H = 300, L = 50, R = 16, T = 16, B = 28;
  const x = (i: number) => L + (i / 22) * (W - L - R);

  return (
    <div>
      <PageHead compact eyebrow="Explore · compare" info="aquaEquivalent" title="Which place burns more," italic="on the same footing?"
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
          <CopyLink />
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
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Period</p>
            <Segmented label="cmp-period" value={period} onChange={setPeriod} options={[{ value: "own", label: "Each side's years" }, { value: "common", label: "Common period" }]} />
          </div>
        </div>
        <p className="w-full text-xs leading-relaxed text-[var(--text-secondary)]">
          {norm === "idx"
            ? "Index, mean = 100: each region's yearly detections divided by its own country's mean over its reference period (below), ×100. 150 means half again as many detections as that region's usual year, so a small and a large region share one axis. The two indexes use different means, so equal index values are not equal counts."
            : "Absolute: yearly detection counts. The larger region dominates the axis."}
          {" "}Years with no data are left as gaps, never treated as zero. A region whose reference mean is zero cannot be indexed and is not drawn. &quot;Common period&quot; restricts both lines (and both means) to the years where both regions have data. The two calendars below share one colour scale.
        </p>
      </div>
      <p className="mt-2 px-1 text-xs text-[var(--text-muted)]">{names.length ? `${names.length} countries harmonized, with their own fit or a pooled fit (marked).` : ""} Countries without a fit (reasons on the Data page) have no harmonized record; their raw record is in the Explorer.{mode === "raw" && " Showing the raw record: uncorrected, with the 2012 sensor step."}</p>
      {paramsError && <div className="mt-6"><Failed error={paramsError} retry={paramsRetry} what="the fit" /></div>}
      {tableError && !paramsError && <p className="mt-4 text-sm text-[var(--text-secondary)]">Country summaries (countries.json) unavailable: {tableError.message} <button type="button" onClick={tableRetry} className="underline underline-offset-2">Retry</button></p>}
      {error && <div className="mt-6"><Failed error={error} retry={retry} what="the calendars" /></div>}
      {loading && <div className="mt-6"><Loading h={300} /></div>}
      {view && data && (
        <>
          <Reveal>
            <section className="window mt-6 p-4 sm:p-6">
              <Eyebrow>Yearly detections · {norm === "idx" ? "indexed, each region's own reference-period mean = 100" : "absolute"}{period === "common" ? " · common period" : ""}</Eyebrow>
              <ul className="mt-2 space-y-0.5 text-xs text-[var(--text-secondary)]" data-testid="cmp-reference">
                {view.refs.map((rf, k) => {
                  const span = (ys: number[]) => (ys.length ? (ys.length === ys[ys.length - 1] - ys[0] + 1 ? `${ys[0]}–${ys[ys.length - 1]}` : ys.join(", ")) : "none");
                  return (
                    <li key={`ref-${k}`}>
                      <span style={{ color: COLORS[k] }} className="font-medium">{k === 0 ? "A" : "B"} · {prettyName(k === 0 ? a : b)}</span>: reference years {span(rf.yrs)} (n = {rf.yrs.length}){norm === "idx" ? <>, mean {rf.mean === null ? "undefined (no years with data)" : rf.mean === 0 ? "0 — cannot be indexed, line not drawn" : fmt(rf.mean)}</> : null}
                      {rf.missing.length ? <>; no data in {span(rf.missing)} (gap)</> : null}
                    </li>
                  );
                })}
                {period === "common" && view.common.length === 0 && <li>The two regions share no year with data, so the common period is empty.</li>}
              </ul>
              <svg ref={chartRef} viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full overflow-visible">
                {[0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={T + (1 - f) * (H - T - B)} y2={T + (1 - f) * (H - T - B)} stroke="var(--gridline)" /><text x={L - 8} y={T + (1 - f) * (H - T - B) + 3.5} textAnchor="end" fontSize={fs(10)} fill="var(--text-muted)">{fmtCompact(f * view.max)}</text></g>)}
                {Array.from({ length: 23 }, (_, i) => 2003 + i).filter((y) => (narrow ? y % 8 === 3 : y % 4 === 3)).map((y) => <text key={y} x={x(y - 2003)} y={H - 8} textAnchor="middle" fontSize={fs(10)} fill="var(--text-muted)">{y}</text>)}
                <line x1={x(8.5)} x2={x(8.5)} y1={T} y2={H - B} stroke="var(--text-muted)" strokeDasharray="3 4" />
                {view.scaled.map((s, k) => (
                  <motion.path key={`${k}-${mode}-${norm}-${a}-${b}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }}
                    d={s.map((v, i) => (v === null ? "" : `${i && s[i - 1] !== null ? "L" : "M"}${x(i)},${T + (1 - v / view.max) * (H - T - B)}`)).join(" ")} fill="none" stroke={COLORS[k]} strokeWidth="2.6" />
                ))}
                {view.scaled.map((s, k) => {
                  // Direct labels at the line ends, nudged apart if they would overlap.
                  const lastIdx = (q: (number | null)[]) => { for (let i = q.length - 1; i >= 0; i -= 1) if (q[i] !== null) return i; return -1; };
                  if (lastIdx(s) < 0) return null;
                  const ys = view.scaled.map((q) => { const li = lastIdx(q); return li < 0 ? -999 : T + (1 - (q[li] as number) / view.max) * (H - T - B); });
                  let yy = ys[k] - 8;
                  if (k === 1 && Math.abs(ys[1] - ys[0]) < 14) yy = ys[0] + (ys[1] >= ys[0] ? 16 : -22);
                  return <text key={`lab-${k}`} x={x(lastIdx(s))} y={Math.max(T + 10, yy)} textAnchor="end" fontSize={fs(12)} fontWeight="600" fill={COLORS[k]}>{k === 0 ? "A" : "B"} · {prettyName(k === 0 ? a : b)}</text>;
                })}
              </svg>
              <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2" data-testid="cmp-quality" aria-label="Certainty of each series">
                {[a, b].map((n, k) => {
                  const f = params?.countries[n];
                  const q = f ? fitQuality(f) : null;
                  return (
                    <li key={`q-${k}`} className="flex items-start gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[var(--text-secondary)]">
                      <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[k] }} />
                      <span><b className="font-medium text-[var(--text-primary)]">{k === 0 ? "A" : "B"} · {prettyName(n)}</b>{" — "}
                        {mode === "raw" ? "raw record, uncorrected (no fit applied)" : q ? <>{q.origin}; {q.label}</> : "no published fit — no harmonized record"}</span>
                    </li>
                  );
                })}
              </ul>
              {mode === "harmonized" && (() => {
                const qs = [a, b].map((n) => params?.countries[n] ? fitQuality(params.countries[n]) : null);
                const differ = qs[0] && qs[1] && (qs[0].level !== qs[1].level || qs[0].origin !== qs[1].origin);
                return differ ? <p className="mt-2 text-xs text-[var(--text-secondary)]">The two series do not carry equal certainty: their corrections differ in origin or quality, so read differences between the lines with that in mind.</p> : null;
              })()}
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
                    <p className="tabular mt-3 text-xs text-[var(--text-secondary)]">≈ {row?.harm_per_10k_km2_yr != null ? fmtNum(row.harm_per_10k_km2_yr, 1) : "—"} harmonized detections per 10,000 km² per year (2003–2025 mean; approximate area from Natural Earth 1:110m{row?.land_area_km2 != null ? `, ${fmt(row.land_area_km2)} km²` : ", no outline for this country"})</p>
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
