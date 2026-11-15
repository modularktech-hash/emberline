"use client";

/**
 * Method "Proof" panels: the 2012 step collapse (A1), the held-out benchmark (A2),
 * the False-Record Counter (P1) and Find the Seam (P2). Every number is read from
 * /data/proof.json, written by scripts/build_proof.py from the published files.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getProof, type BenchSeries, type ProofBenchCounts, type ProofFile, type ProofStepRow, type RecordSeries } from "@/lib/data";
import { useParquet } from "@/lib/useParquet";
import { fmtNum, fmtPct, fmtR2, fmtRatio } from "@/lib/format";
import { prettyName } from "@/lib/names";
import { Segmented } from "@/components/ui";
import { CountryPicker } from "@/components/CountryPicker";
import { Eyebrow } from "@/components/Figure";

const RAW = "var(--c-raw)";
const pct = (v: number | null | undefined, dp = 1) => (v == null || !Number.isFinite(v) ? "—" : `${fmtNum(v * 100, dp)}%`);

function useProof(enabled = true) {
  return useParquet(() => (enabled ? getProof() : new Promise<ProofFile>(() => {})), enabled ? "proof" : "proof-wait");
}

/** Starts loading only once the element is near the viewport (home page). */
function useNear<T extends HTMLElement>(lazy: boolean) {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(!lazy);
  useEffect(() => {
    if (near || !ref.current) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "600px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near]);
  return { ref, near };
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">{children}</p>;
}

/* ------------------------------------------------------------ A1: step collapse */
/** The 171 (or 342) dots, drawn once per data/toggle change; hover only redraws the small highlight overlay. */
const Marks = memo(function Marks({ rows, kind, dom }: { rows: ProofStepRow[]; kind: "harm" | "raw"; dom: readonly [number, number] }) {
  const lx = (v: number) => SL + ((Math.log10(v) - dom[0]) / (dom[1] - dom[0])) * (SW - SL - SR);
  const ly = (v: number) => SH - SB - ((Math.log10(v) - dom[0]) / (dom[1] - dom[0])) * (SH - ST - SB);
  const color = kind === "harm" ? "var(--ember)" : RAW, op = kind === "harm" ? 0.9 : 0.22, r = 3.4;
  return (
    <>
      {rows.map((c) => {
        const cx = lx(c.aqua), cy = ly(kind === "harm" ? c.harm : c.raw);
        return (
          <g key={c.country} data-c={c.country}>
            {c.fit_source === "pooled"
              ? <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} transform={`rotate(45 ${cx} ${cy})`} fill="var(--surface-page)" stroke={color} strokeWidth="1.4" opacity={op} />
              : <circle cx={cx} cy={cy} r={r} fill={color} opacity={op} />}
            <circle cx={cx} cy={cy} r={9} fill="transparent"><title>{`${prettyName(c.country)}${c.fit_source === "pooled" ? " (pooled curve)" : ""}: Aqua ${fmtRatio(c.aqua)}, ${kind === "harm" ? `harmonized ${fmtRatio(c.harm)}` : `raw splice ${fmtRatio(c.raw)}`}`}</title></circle>
          </g>
        );
      })}
    </>
  );
});

const SW = 560, SH = 420, SL = 52, SR = 14, ST = 14, SB = 44;

export function StepCollapse({ lazy = false, compact = false }: { lazy?: boolean; compact?: boolean }) {
  const { ref, near } = useNear<HTMLDivElement>(lazy);
  const { data, error } = useProof(near);
  const [sel, setSel] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(true);
  const sc = data?.step_collapse;
  const dom = useMemo(() => {
    if (!sc) return null;
    const vals = sc.countries.flatMap((c) => [c.aqua, c.harm, c.raw]);
    return [Math.log10(Math.min(...vals)) - 0.05, Math.log10(Math.max(...vals)) + 0.05] as const;
  }, [sc]);
  const pick = sc && sel ? sc.countries.find((c) => c.country === sel) : undefined;
  const pickFrom = (e: React.SyntheticEvent) => { const c = (e.target as Element).closest?.("[data-c]")?.getAttribute("data-c"); if (c && c !== sel) setSel(c); };

  return (
    <div ref={ref} className={compact ? "" : "card mt-8 min-w-0 p-5 sm:p-6"} data-testid="step-collapse">
      {!compact && <Eyebrow>Proof · the 2012 step</Eyebrow>}
      <h2 className={`display ${compact ? "text-xl" : "mt-2 text-2xl"}`}>The sensor jump collapses onto the unchanged sensor</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        Each country&apos;s change in yearly fire counts from 2009–11 to 2012–14. Across: Aqua MODIS alone, a sensor that did not change.
        Up: the same step in our harmonized record (ember) and in the naive splice of MODIS onto VIIRS (blue).
        On the diagonal the record moves exactly as the unchanged sensor does. Hover or tap a dot.
      </p>
      {error && <p className="mt-4 text-sm text-[var(--text-secondary)]">Could not load proof.json: {error.message}</p>}
      {!sc || !dom ? (!error && <div className="mt-4 h-72 animate-pulse rounded-2xl bg-[var(--surface-2)]" />) : (() => {
        const lx = (v: number) => SL + ((Math.log10(v) - dom[0]) / (dom[1] - dom[0])) * (SW - SL - SR);
        const ly = (v: number) => SH - SB - ((Math.log10(v) - dom[0]) / (dom[1] - dom[0])) * (SH - ST - SB);
        const ticks = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32].filter((t) => Math.log10(t) >= dom[0] && Math.log10(t) <= dom[1]);
        const band = Math.log10(sc.within_factor);
        const lo = 10 ** dom[0], hi = 10 ** dom[1];
        const hl = (c: ProofStepRow, v: number, kind: "harm" | "raw") => {
          const cx = lx(c.aqua), cy = ly(v), color = kind === "harm" ? "var(--ember)" : RAW;
          return <circle key={kind} cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeWidth="2" pointerEvents="none" />;
        };
        const s = sc.all;
        return (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Segmented label="Raw splice dots" value={showRaw ? "on" : "off"} onChange={(v) => setShowRaw(v === "on")} options={[{ value: "on", label: "Show raw splice" }, { value: "off", label: "Harmonized only" }]} />
            </div>
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,34rem)_1fr]">
              <svg viewBox={`0 0 ${SW} ${SH}`} className="w-full touch-manipulation" role="img" onPointerLeave={() => setSel(null)}
                aria-label={`Log-log scatter of 2012 step ratios for ${s.n} fitted countries: unchanged Aqua across, harmonized and raw splice up. Harmonized within ×${sc.within_factor} of the diagonal in ${s.within_1_25_harm} countries, raw splice in ${s.within_1_25_raw}.`}>
                {ticks.map((t) => (
                  <g key={t}>
                    <line x1={lx(t)} x2={lx(t)} y1={ST} y2={SH - SB} stroke="var(--gridline)" />
                    <line x1={SL} x2={SW - SR} y1={ly(t)} y2={ly(t)} stroke="var(--gridline)" />
                    <text x={lx(t)} y={SH - SB + 14} textAnchor="middle" fontSize="10" fill="var(--text-muted)">×{t}</text>
                    <text x={SL - 6} y={ly(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)">×{t}</text>
                  </g>
                ))}
                <polygon fill="var(--ember)" opacity="0.07" points={[
                  [lx(lo), ly(Math.min(hi, lo * 10 ** band))], [lx(hi / 10 ** band), ly(hi)], [lx(hi), ly(hi)], [lx(hi), ly(hi / 10 ** band)], [lx(lo * 10 ** band), ly(lo)], [lx(lo), ly(lo)],
                ].map((p) => p.join(",")).join(" ")} />
                <line x1={lx(lo)} y1={ly(lo)} x2={lx(hi)} y2={ly(hi)} stroke="var(--ink)" strokeWidth="1.2" strokeDasharray="5 4" />
                <text x={SW - SR - 4} y={ly(hi) + 14} textAnchor="end" fontSize="10" fill="var(--text-muted)">1:1 · same step as Aqua</text>
                <g onPointerOver={pickFrom} onClick={pickFrom} style={{ cursor: "pointer" }}>
                  {showRaw && <Marks rows={sc.countries} kind="raw" dom={dom} />}
                  <Marks rows={sc.countries} kind="harm" dom={dom} />
                </g>
                {pick && showRaw && <line x1={lx(pick.aqua)} x2={lx(pick.aqua)} y1={ly(pick.raw)} y2={ly(pick.harm)} stroke="var(--text-muted)" strokeDasharray="2 3" pointerEvents="none" />}
                {pick && showRaw && hl(pick, pick.raw, "raw")}
                {pick && hl(pick, pick.harm, "harm")}
                <text x={(SW + SL) / 2} y={SH - 6} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">Aqua MODIS only (unchanged sensor): 2012–14 ÷ 2009–11</text>
                <text transform={`translate(12 ${(SH - SB + ST) / 2}) rotate(-90)`} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">record&apos;s step, same years</text>
              </svg>
              <div className="min-w-0 text-sm">
                <div className="rounded-2xl border border-[var(--hairline)] p-4" aria-live="polite">
                  {pick ? (
                    <>
                      <p className="font-medium text-[var(--text-primary)]">{prettyName(pick.country)}{pick.fit_source === "pooled" && <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ember)]">pooled</span>}</p>
                      <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div><dt className="text-[var(--text-muted)]">Aqua only</dt><dd className="text-base text-[var(--text-primary)]">{fmtRatio(pick.aqua)}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Harmonized</dt><dd className="text-base text-[var(--ember)]">{fmtRatio(pick.harm)}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Raw splice</dt><dd className="text-base" style={{ color: RAW }}>{fmtRatio(pick.raw)}</dd></div>
                      </dl>
                    </>
                  ) : <p className="text-[var(--text-secondary)]">Hover or tap a dot to see the country.</p>}
                </div>
                <p className="mt-4 leading-relaxed text-[var(--text-secondary)]" data-testid="step-summary">
                  Typical distance from the unchanged sensor&apos;s step (median of |log(record ÷ Aqua)|, as a factor):{" "}
                  <span className="tabular text-[var(--ember)]">×{fmtNum(s.median_factor_harm, 2)}</span> harmonized against{" "}
                  <span className="tabular" style={{ color: RAW }}>×{fmtNum(s.median_factor_raw, 2)}</span> raw.
                  {" "}Within ×{sc.within_factor} of the diagonal: <span className="tabular text-[var(--text-primary)]">{s.within_1_25_harm} of {s.n}</span> harmonized,{" "}
                  <span className="tabular text-[var(--text-primary)]">{s.within_1_25_raw} of {s.n}</span> raw.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--ember)] align-middle" /> own-fit country ({sc.own.n}; {sc.own.within_1_25_harm} within ×{sc.within_factor})
                  {" "}<span className="ml-2 mr-1 inline-block h-2 w-2 rotate-45 border border-[var(--ember)] align-middle" /> pooled curve ({sc.pooled.n}; {sc.pooled.within_1_25_harm} within).
                  {" "}Shaded band: within ×{sc.within_factor}. Aqua is reference observations, not ground truth. Regional (per country) results.
                </p>
              </div>
            </div>
            {compact && <p className="mt-4 text-sm"><Link className="link-ul" href="/method#proof">Benchmarks and two blind tests on the Method page →</Link></p>}
          </>
        );
      })()}
    </div>
  );
}

/* ------------------------------------------------------------ A2: benchmark */
const SERIES: Array<{ k: BenchSeries; label: string; note: string }> = [
  { k: "model", label: "Emberline (FRP logistic)", note: "per-country detection curve × κ" },
  { k: "ratio", label: "One ratio", note: "VIIRS count × training-years Aqua/VIIRS ratio" },
  { k: "threshold", label: "Single FRP cut-off", note: "count VIIRS detections above one MW cut-off" },
  { k: "raw_viirs", label: "Raw VIIRS", note: "no correction" },
];

export function Benchmark() {
  const { data, error } = useProof();
  const [group, setGroup] = useState<"all" | "own" | "pooled">("all");
  const [pick, setPick] = useState("Canada");
  if (error) return <p className="mt-6 text-sm text-[var(--text-secondary)]">Could not load proof.json: {error.message}</p>;
  if (!data) return <div className="card mt-6 h-72 animate-pulse" />;
  const b = data.benchmark;
  const g: ProofBenchCounts = b[group];
  const names = b.countries.map((c) => c.country);
  const row = b.countries.find((c) => c.country === pick) ?? b.countries[0];
  const wins: Record<BenchSeries, Array<[string, number | null]>> = {
    model: [],
    ratio: [["higher R²", g.beats_ratio_r2], ["lower MAE", g.beats_ratio_mae], ["lower RMSE", g.beats_ratio_rmse]],
    threshold: [["higher R²", g.beats_threshold_r2], ["lower RMSE", g.beats_threshold_rmse]],
    raw_viirs: [["higher R²", g.beats_raw_r2], ["lower RMSE", g.beats_raw_rmse]],
  };
  return (
    <section className="card mt-6 min-w-0 p-5 sm:p-6" data-testid="benchmark">
      <Eyebrow>Proof · benchmark</Eyebrow>
      <h2 className="display mt-2 text-2xl">Against simpler corrections, on held-out years</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        Four ways to put VIIRS counts on the Aqua MODIS scale, scored on the same held-out 2019–2021 cell-months (fit on 2012–2018).
        The plain result: the model is far better than raw VIIRS or a single cut-off, and roughly level with one country-wide ratio (median R² {fmtR2(b.all.median_r2.model)} against {fmtR2(b.all.median_r2.ratio)}).
        It beats that ratio on held-out R² in <span className="tabular text-[var(--text-primary)]">{b.all.beats_ratio_r2} of {b.all.n}</span> countries
        and has lower mean absolute error in <span className="tabular text-[var(--text-primary)]">{b.all.beats_ratio_mae} of {b.all.n}</span>.
      </p>
      <div className="mt-4"><Segmented label="Countries" value={group} onChange={setGroup} options={[
        { value: "all", label: `All fitted (${b.all.n})` }, { value: "own", label: `Own curve (${b.own.n})` }, { value: "pooled", label: `Pooled curve (${b.pooled.n})` },
      ]} /></div>
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Benchmark summary table">
        <table className="tabular w-full min-w-[560px] text-sm">
          <thead><tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-2 pr-3 font-normal">Method</th>
            <th className="px-3 font-normal">Median R²</th>
            <th className="px-3 font-normal">Median RMSE</th>
            <th className="px-3 font-normal">Model is better in</th>
          </tr></thead>
          <tbody>
            {SERIES.map((s) => (
              <tr key={s.k} className="border-t border-[var(--hairline)] align-top">
                <td className="py-2.5 pr-3"><span className={s.k === "model" ? "text-[var(--ember)]" : "text-[var(--text-primary)]"}>{s.label}</span><span className="block text-xs text-[var(--text-muted)]">{s.note}</span></td>
                <td className="px-3 py-2.5">{fmtR2(g.median_r2[s.k])}</td>
                <td className="px-3 py-2.5">{fmtNum(g.median_rmse[s.k], 2)}</td>
                <td className="px-3 py-2.5 text-[var(--text-secondary)]">{s.k === "model" ? "—" : wins[s.k].map(([l, v]) => <span key={l} className="block">{v} of {s.k === "ratio" ? g.n_with_ratio : g.n} · {l}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>
        {b.definition} Ratio baseline: {b.ratio_definition}. R² and RMSE on the same rows rank methods the same way, so their counts match; MAE weighs errors differently.
        Medians are over countries ({g.n}); MAE is published for the model and the ratio only. {g.model_r2_below_zero} of these {g.n} have a negative model R².
      </Note>
      <div className="mt-6 rounded-2xl border border-[var(--hairline)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <CountryPicker value={row.country} options={names} onChange={setPick} label="Country" />
          {row.fit_source === "pooled" && <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ember)]">pooled curve</span>}
          <span className="text-xs text-[var(--text-muted)]">{fmtNum(row.n_cell_months)} held-out cell-months</span>
        </div>
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={`Benchmark for ${prettyName(row.country)}`}>
          <table className="tabular w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-1.5 pr-3 font-normal">Method</th><th className="px-3 font-normal">R²</th><th className="px-3 font-normal">RMSE</th><th className="px-3 font-normal">MAE</th><th className="px-3 font-normal">Bias</th></tr></thead>
            <tbody>
              {SERIES.map((s) => { const m = row[s.k]; return (
                <tr key={s.k} className="border-t border-[var(--hairline)]">
                  <td className={`py-2 pr-3 ${s.k === "model" ? "text-[var(--ember)]" : ""}`}>{s.label}</td>
                  {m ? <><td className="px-3">{fmtR2(m.r2)}</td><td className="px-3">{fmtNum(m.rmse, 2)}</td><td className="px-3">{m.mae != null ? fmtNum(m.mae, 2) : <span className="text-[var(--text-muted)]">not published</span>}</td><td className="px-3">{fmtPct(m.bias_pct)}</td></>
                    : <td className="px-3 text-[var(--text-muted)]" colSpan={4}>unavailable</td>}
                </tr>); })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Observed-against-predicted dots for every country (sampled held-out pairs from validation_points.json) are in the plot above.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ P1 + P2 */
const REC: Array<{ k: RecordSeries; label: string; color: string }> = [
  { k: "raw_splice", label: "Naive raw splice (MODIS → VIIRS in 2012)", color: RAW },
  { k: "modis", label: "Unchanged MODIS (Terra + Aqua, all years)", color: "var(--ink)" },
  { k: "harmonized", label: "Emberline harmonized", color: "var(--ember)" },
];

function RecordCounter({ p }: { p: ProofFile }) {
  const r = p.records;
  const own = Object.keys(r.countries);
  const [mode, setMode] = useState<string>("all");
  const [other, setOther] = useState(r.examples[0] ?? own[0]);
  const sel = mode === "other" ? (r.countries[other] ? other : own[0]) : mode;
  const c: Partial<Record<RecordSeries, number>> = sel === "all" ? r.median_per_country : r.countries[sel] ?? {};
  return (
    <div className="mt-6" data-testid="record-counter">
      <h3 className="display text-xl">False-Record Counter</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        For {r.n_countries} own-fit countries, each calendar month of each year 2012–2021 is <em>flagged as a record</em> when its count is higher than every
        same-month count in 2003–2011. A sensor switch that sees more small fires makes most later months look like records; a consistent record should
        flag about as often as the unchanged sensor does.
      </p>
      <div className="mt-4 space-y-3" role="list">
        {REC.map((s) => { const v = r.series[s.k]; return (
          <div key={s.k} role="listitem">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"><span className="text-[var(--text-primary)]">{s.label}</span>
              <span className="tabular text-[var(--text-secondary)]"><span className="text-lg" style={{ color: s.color }}>{pct(v.share)}</span> · {fmtNum(v.flagged)} of {fmtNum(v.of)} country-months</span></div>
            <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className="h-full rounded-full" style={{ width: `${v.share * 100}%`, background: s.color }} />
              <div className="absolute inset-y-0 w-px bg-[var(--text-primary)]" style={{ left: `${r.chance_reference.share * 100}%` }} aria-hidden />
            </div>
          </div>); })}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">Thin mark: the {pct(r.chance_reference.share, 0)} order-statistics reference ({r.chance_reference.definition}). Trends and real extreme years move every series away from it.</p>
      <div className="mt-5 rounded-2xl border border-[var(--hairline)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Example country" value={mode} onChange={setMode} options={[{ value: "all", label: `All ${r.n_countries} countries (median)` }, { value: "other", label: "One country" }]} />
          {mode === "other" && <CountryPicker value={sel} options={own} onChange={setOther} label="Country" />}
        </div>
        <dl className="tabular mt-3 grid gap-3 sm:grid-cols-3" data-testid="record-example">
          {REC.map((s) => (
            <div key={s.k}><dt className="text-xs text-[var(--text-muted)]">{s.label}</dt><dd className="mt-0.5 text-base"><span className="text-xl" style={{ color: s.color }}>{c[s.k] ?? "—"}</span> <span className="text-[var(--text-secondary)]">of {r.per_country_of} months flagged as a record{sel === "all" ? ", median country" : ""}</span></dd></div>
          ))}
        </dl>
      </div>
      <Note>{r.definition}</Note>
    </div>
  );
}

function FindTheSeam({ p }: { p: ProofFile }) {
  const s = p.seam;
  const hist = (k: "raw" | "harm") => s.candidates.map((y) => Object.values(s.countries).filter((c) => c[k] === y).length);
  const raw = hist("raw"), harm = hist("harm");
  const max = Math.max(...raw, ...harm, 1);
  const W = 560, H = 190, L = 8, B = 22, bw = (W - 2 * L) / s.candidates.length;
  return (
    <div className="mt-10" data-testid="find-the-seam">
      <h3 className="display text-xl">Find the Seam: a blind test</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        Without being told where the sensor changed, look at each own-fit country&apos;s yearly series and find the year with the biggest jump between the
        three years before and the three years from it (largest |log ratio| of consecutive 3-year means), among the candidate years {s.candidates[0]}–{s.candidates[s.candidates.length - 1]} ({s.candidates.length} candidates).
        If the seam is gone, 2012 should win only about as often as any other year.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="seam-counts">
        {[
          ["Raw splice: 2012 is the biggest step", `${s.raw_2012} of ${s.n_countries}`, RAW],
          ["Harmonized: 2012 is the biggest step", `${s.harm_2012} of ${s.n_countries}`, "var(--ember)"],
          ["Chance (any one candidate year)", `${fmtNum(s.chance_2012, 1)} of ${s.n_countries}`, "var(--ink)"],
        ].map(([k, v, col]) => (
          <div key={k} className="rounded-2xl border border-[var(--hairline)] p-3"><p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{k}</p><p className="tabular mt-1 text-2xl" style={{ color: col }}>{v}</p></div>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full max-w-3xl" role="img" aria-label={`Year of the biggest step per country: raw splice peaks at 2012 with ${s.raw_2012} countries; harmonized has ${s.harm_2012} at 2012`}>
        {s.candidates.map((y, i) => {
          const x = L + i * bw, h1 = (raw[i] / max) * (H - B - 12), h2 = (harm[i] / max) * (H - B - 12);
          return (
            <g key={y}>
              <rect x={x + bw * 0.12} width={bw * 0.36} y={H - B - h1} height={h1} fill={RAW} opacity="0.55"><title>{`${y}: raw ${raw[i]}`}</title></rect>
              <rect x={x + bw * 0.52} width={bw * 0.36} y={H - B - h2} height={h2} fill="var(--ember)"><title>{`${y}: harmonized ${harm[i]}`}</title></rect>
              {(raw[i] > 0 || harm[i] > 0) && <text x={x + bw / 2} y={H - B - Math.max(h1, h2) - 3} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{raw[i]}/{harm[i]}</text>}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fill={y === 2012 ? "var(--text-primary)" : "var(--text-muted)"}>{String(y).slice(2)}</text>
            </g>
          );
        })}
        <line x1={L} x2={W - L} y1={H - B} y2={H - B} stroke="var(--gridline)" />
      </svg>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        <span className="mr-1 inline-block h-2 w-2 align-middle" style={{ background: RAW, opacity: 0.55 }} /> raw splice
        <span className="ml-3 mr-1 inline-block h-2 w-2 align-middle bg-[var(--ember)]" /> harmonized · countries whose biggest step falls in each year (’06–’19), labelled raw/harmonized.
      </p>
      <Note>{s.definition}{s.skipped.length ? ` Skipped (no annual series): ${s.skipped.map(prettyName).join(", ")}.` : ""} A big step in another year can be a real fire change; this test only asks whether the sensor seam still stands out.</Note>
    </div>
  );
}

export function ProofSection() {
  const { data, error } = useProof();
  return (
    <section id="proof" className="card mt-6 min-w-0 scroll-mt-24 p-5 sm:p-6" data-testid="proof">
      <Eyebrow>Proof · two blind tests</Eyebrow>
      <h2 className="display mt-2 text-2xl">Does the seam still show?</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        Two checks that use no fitting target at all: they only ask whether 2012 still looks special, in each country, under each series. Regional (per-country) results; fit {data?.fit_version ?? "…"}.
      </p>
      {error && <p className="mt-4 text-sm text-[var(--text-secondary)]">Could not load proof.json: {error.message}</p>}
      {!data && !error && <div className="mt-4 h-72 animate-pulse rounded-2xl bg-[var(--surface-2)]" />}
      {data && <><RecordCounter p={data} /><FindTheSeam p={data} /></>}
    </section>
  );
}
