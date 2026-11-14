"use client";

/**
 * Method page: observed vs predicted held-out cell-months (E26), and the copy for the
 * evaluation population (E30), borrowed curves + transfer test (E28), matching-rule
 * sensitivity (E29) and coefficient-only uncertainty (E27). Every number is read from
 * the published files in /data at runtime; nothing here is typed in by hand.
 */
import { useMemo, useState } from "react";
import { fmtNum, fmtPct, fmtR2 } from "@/lib/format";
import { fmt, median } from "@/lib/ember";
import { prettyName } from "@/lib/names";
import { useParquet } from "@/lib/useParquet";
import { CountryPicker } from "@/components/CountryPicker";
import { Segmented } from "@/components/ui";

interface Metrics { r2: number; bias_pct: number; mae: number; rmse: number; n_cell_months: number }
interface VCountry { fit_source: "own" | "pooled"; model: Metrics; baseline_multiplicative: Metrics & { ratio: number }; n_points_total: number; points: Array<[number, number]> }
interface VPoints { fit_version: string; test_years: [number, number]; train_years: [number, number]; unit: string; sampling: string; countries: Record<string, VCountry> }
interface TArm { median_r2: number; n_r2_below_0: number; median_abs_bias_pct: number }
interface TGroup { n: number; own: TArm; pooled_curve_own_kappa: TArm; pooled_curve_pooled_kappa: TArm }
interface Transfer { fit_version: string; method: string; all_own_fit_countries: TGroup; pool_sources_left_out: TGroup; not_pool_sources: TGroup }
interface Uncert { fit_version: string; interval: string; covers: { included: string[]; not_included: string[] }; summary: { n_estimated: number; n_not_estimated_pooled: number; annual_rel_width_median: number; annual_rel_width_p90: number; annual_rel_width_max: number; annual_rel_width_population: string } }

const cache = new Map<string, Promise<unknown>>();
function getJson<T>(f: string): Promise<T> {
  if (!cache.has(f)) cache.set(f, fetch(`/data/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); }));
  return cache.get(f) as Promise<T>;
}
/** Optional file: resolves to null instead of failing the page. */
const maybe = <T,>(f: string) => getJson<T>(f).catch(() => null);

const W = 360, H = 300, L = 46, R = 12, T = 12, B = 40;
const MIN_POINTS = 1000; // examples drawn only from countries with at least this many held-out cell-months

export function ValidationPlot() {
  const { data, error } = useParquet(() => getJson<VPoints>("validation_points.json"), "validation_points");
  const names = useMemo(() => (data ? Object.keys(data.countries) : []), [data]);
  const examples = useMemo(() => {
    if (!data) return null;
    const own = names.filter((n) => data.countries[n].fit_source === "own" && data.countries[n].n_points_total >= MIN_POINTS)
      .sort((a, b) => data.countries[b].model.r2 - data.countries[a].model.r2);
    return own.length ? { strong: own[0], weak: own[own.length - 1] } : null;
  }, [data, names]);
  const [mode, setMode] = useState<"strong" | "weak" | "other">("strong");
  const [other, setOther] = useState("Canada");
  if (error) return <p className="mt-6 text-sm text-[var(--text-secondary)]">Could not load validation_points.json: {error.message}</p>;
  if (!data || !examples) return <div className="mt-6 h-72 animate-pulse rounded-2xl bg-[var(--surface-2)]" />;
  const sel = mode === "other" ? (data.countries[other] ? other : names[0]) : examples[mode];
  const c = data.countries[sel];
  const max = Math.max(1, ...c.points.flat());
  const s = (v: number) => Math.sqrt(Math.max(0, v) / max);
  const x = (v: number) => L + s(v) * (W - L - R);
  const y = (v: number) => H - B - s(v) * (H - T - B);
  const ticks = [0, 1, 5, 20, 50, 100, 200, 500, 1000, 2000, 5000].filter((t) => t <= max);
  const resid = c.points.map(([o, p]) => p - o);
  const over = resid.filter((r) => r > 0).length, under = resid.filter((r) => r < 0).length;

  return (
    <div className="mt-6 rounded-2xl border border-[var(--hairline)] p-4 sm:p-5" data-testid="obs-pred">
      <h3 className="display text-xl">Observed against predicted, on held-out cell-months</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        Each dot is one H3 resolution-5 cell (~250 km²) in one month of {data.test_years[0]}–{data.test_years[1]}, years the fit ({data.train_years[0]}–{data.train_years[1]}) never saw:
        observed Aqua MODIS detections across, the model&apos;s Aqua-equivalent estimate up. On the dashed line the estimate is exact.
        Strong and weak examples are the own-fit countries with the highest and lowest held-out R² among those with at least {fmt(MIN_POINTS)} held-out cell-months.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmented label="Example country" value={mode} onChange={setMode} options={[
          { value: "strong", label: `Strong: ${prettyName(examples.strong)}` },
          { value: "weak", label: `Weak: ${prettyName(examples.weak)}` },
          { value: "other", label: "Any country" },
        ]} />
        {mode === "other" && <CountryPicker value={sel} options={names} onChange={setOther} label="Country" />}
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
          aria-label={`${prettyName(sel)}: ${c.points.length} sampled held-out cell-months, observed against predicted Aqua detections, square-root axes; held-out R² ${fmtR2(c.model.r2)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={T} y2={H - B} stroke="var(--gridline)" />
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--gridline)" />
              <text x={x(t)} y={H - B + 13} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{t}</text>
              <text x={L - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">{t}</text>
            </g>
          ))}
          <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} stroke="var(--ink)" strokeDasharray="4 3" strokeWidth="1" />
          {c.points.map(([o, p], i) => <circle key={i} cx={x(o)} cy={y(p)} r={2.2} fill="var(--ember)" fillOpacity="0.45" />)}
          <text x={(W + L) / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">observed Aqua detections per cell-month (√ scale)</text>
          <text transform={`translate(11 ${(H - B + T) / 2}) rotate(-90)`} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">predicted (√ scale)</text>
        </svg>
        <div className="text-sm text-[var(--text-secondary)]">
          <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-1.5">
            <dt>Fit</dt><dd className="text-[var(--text-primary)]">{c.fit_source === "own" ? "own curve" : "borrowed (pooled) curve"}</dd>
            <dt>Held-out R²</dt><dd className="text-[var(--text-primary)]">{fmtR2(c.model.r2)}</dd>
            <dt>One-ratio baseline R²</dt><dd>{fmtR2(c.baseline_multiplicative.r2)}</dd>
            <dt>Bias (total)</dt><dd>{fmtPct(c.model.bias_pct)}</dd>
            <dt>RMSE</dt><dd>{fmtNum(c.model.rmse, 2)} per cell-month</dd>
            <dt>Cell-months scored</dt><dd>{fmt(c.model.n_cell_months)}</dd>
            <dt>Dots shown</dt><dd>{fmt(c.points.length)} (sample)</dd>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
            Residuals in this sample: {fmt(over)} cell-months over-predicted, {fmt(under)} under-predicted, {fmt(c.points.length - over - under)} exact.
            Both axes use a square-root scale so the many small counts stay readable; zero is at the corner. Metrics are computed on all held-out cell-months, the dots are a sample ({data.sampling.split(",")[0]}).
            The published points carry no month, so residuals by month are not shown.
          </p>
        </div>
      </div>
    </div>
  );
}

export function MethodNotes() {
  const { data } = useParquet(async () => ({
    v: await getJson<VPoints>("validation_points.json"),
    t: await maybe<Transfer>("transfer_validation.json"),
    u: await maybe<Uncert>("harmonized_uncertainty.json"),
  }), "method_notes");
  const pooled = useMemo(() => {
    if (!data) return null;
    const cs = Object.values(data.v.countries);
    const p = cs.filter((c) => c.fit_source === "pooled").map((c) => c.model.r2);
    const o = cs.filter((c) => c.fit_source === "own").map((c) => c.model.r2);
    return { n: p.length, nOwn: o.length, median: median(p), below0: p.filter((r) => r < 0).length, ownMedian: median(o) };
  }, [data]);
  if (!data || !pooled) return null;
  const t = data.t?.all_own_fit_countries;
  const u = data.u;
  return (
    <section className="card mt-6 min-w-0 p-5 sm:p-6" data-testid="method-notes">
      <h2 className="display text-2xl">What the scores mean, and what they leave out</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-base font-medium text-[var(--text-primary)]">What the scores are computed on</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            Each held-out score compares, for every H3 resolution-5 cell (~250 km²) and month in {data.v.test_years[0]}–{data.v.test_years[1]}, the number of Aqua MODIS detections with the model&apos;s Aqua-equivalent estimate.
            A cell-month is included when Aqua or Suomi-NPP VIIRS saw at least one fire there; months when neither saw anything are left out, so the scores describe agreement where at least one record saw fire, not across every square kilometre.
            Cell-months where only VIIRS saw fire count as an observed zero. Counts are compared as they are (no log), and R² is measured against the average of this table, so a negative R² means the estimate did worse than that average.
            The intervals resample whole cells and describe the uncertainty of the score, not of any single month&apos;s count. Raw VIIRS, the FRP cut-off and the single-ratio baseline are scored on exactly the same cell-months.
          </p>
        </div>
        <div>
          <h3 className="text-base font-medium text-[var(--text-primary)]">{pooled.nOwn} own fits, {pooled.n} borrowed curves</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {pooled.nOwn} countries have a curve fitted on their own detections. {pooled.n} have too few training detections (under 5,000 Suomi-NPP detections in {data.v.train_years[0]}–{data.v.train_years[1]}) for a curve of their own.
            They borrow one shared curve whose two coefficients, and κ, are the averages of larger countries&apos; fitted values, each weighted by how many training detections that country had.
            This is an average of coefficients, not a model fitted to all those detections at once. No uncertainty is estimated for a borrowed curve.
            None of these {pooled.n} countries helped build the curve, so their held-out scores show how well it transfers: median held-out R² <span className="tabular text-[var(--text-primary)]">{fmtR2(pooled.median)}</span> ({pooled.below0} of {pooled.n} below zero)
            against <span className="tabular text-[var(--text-primary)]">{fmtR2(pooled.ownMedian)}</span> for countries with their own curve. Treat borrowed-curve results as experimental.
          </p>
          {t && (
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)]">Transfer test.</span> Rebuilding the shared curve without each of the {t.n} own-fit countries in turn and scoring it on that country&apos;s held-out years:
              the borrowed curve with the country&apos;s own κ gives median R² <span className="tabular text-[var(--text-primary)]">{fmtR2(t.pooled_curve_own_kappa.median_r2)}</span> against <span className="tabular">{fmtR2(t.own.median_r2)}</span> for the country&apos;s own curve,
              while the borrowed curve with the shared κ gives <span className="tabular">{fmtR2(t.pooled_curve_pooled_kappa.median_r2)}</span> and a median absolute bias of <span className="tabular">{fmtNum(t.pooled_curve_pooled_kappa.median_abs_bias_pct, 1)}%</span> (own: <span className="tabular">{fmtNum(t.own.median_abs_bias_pct, 1)}%</span>).
              The borrowed curve&apos;s shape works; the shared κ is the weak part. All countries in this test had enough detections for their own fit, so it does not test the small countries that actually borrow. Source: transfer_validation.json.
            </p>
          )}
        </div>
        <div>
          <h3 className="text-base font-medium text-[var(--text-primary)]">The 50% point depends on the matching rule</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            A VIIRS detection counts as &ldquo;also seen by Aqua&rdquo; when Aqua detected fire in the same or a neighbouring resolution-7 cell on the same UTC day. Refitting a few countries with a stricter or looser rule moves the fire power at which the curve crosses 50% several-fold,
            while held-out scores barely change, because κ rescales the total. So the 50% point is a property of this matching rule, not a physical detection threshold of MODIS. The sensitivity runs are described in docs/results.md; they are not published as the model.
          </p>
        </div>
        {u && (
          <div>
            <h3 className="text-base font-medium text-[var(--text-primary)]">Uncertainty of the harmonized totals</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)]">Range from fit-coefficient uncertainty only — excludes κ, model-form, matching-rule and drift uncertainty.</span>{" "}
              For the {u.summary.n_estimated} own-fit countries, the curve was refitted on cell-resampled training data and each draw carried through to yearly and monthly totals from 2012 ({u.interval}).
              For country-years with at least 100 detections the range is narrow: median width <span className="tabular">{fmtNum(u.summary.annual_rel_width_median * 100, 2)}%</span> of the total, 90th percentile <span className="tabular">{fmtNum(u.summary.annual_rel_width_p90 * 100, 1)}%</span>, largest <span className="tabular">{fmtNum(u.summary.annual_rel_width_max * 100, 1)}%</span>.
              It is not a confidence interval of the fire count. The {u.summary.n_not_estimated_pooled} borrowed-curve countries: uncertainty not estimated.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">Not included: {u.covers.not_included.join("; ")}. Source: harmonized_uncertainty.json.</p>
          </div>
        )}
      </div>
    </section>
  );
}
