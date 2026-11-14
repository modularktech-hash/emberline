"use client";

import { fmtClock, fmtNum, fmtPct, fmtR2, fmtRatio } from "@/lib/format";
import { Eyebrow } from "@/components/Figure";
import { getParams } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import { fmt } from "@/lib/ember";
import { PageHead, Reveal } from "@/components/ui";
import { useMemo, useState } from "react";
import { median } from "@/lib/ember";
import { fitTag, prettyName } from "@/lib/names";
import { CountryPicker } from "@/components/CountryPicker";
import { ScrollBox, SortTh, TableSearch, useTable } from "@/components/TableTools";
import type { CountryFit } from "@/lib/types";

const W = 640, H = 260, L = 40, R = 14, T = 14, B = 34;
const HUES = ["#d9431a", "#b8860b", "#3f7f96", "#7a4fa0", "#2f8f5b", "#96221a"];

function Bar({ value, tone }: { value: number; tone: "good" | "bad" }) {
  const w = Math.max(2, Math.min(100, Math.abs(value) * 100));
  return (
    <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-2)] align-middle">
      <span className="block h-full rounded-full" style={{ width: `${tone === "good" ? w : 100}%`, background: tone === "good" ? "var(--ember)" : "#d8b4ac" }} />
    </span>
  );
}

type ValCol = "name" | "fit" | "r2" | "raw" | "thr" | "bias" | "n";
type StepCol = "name" | "fit" | "splice" | "aqua" | "harm" | "gap";
type DriftCol = "name" | "fit" | "y0" | "y1" | "y2" | "y3";

const FitBadge = ({ c }: { c: CountryFit }) =>
  c.fit_source === "pooled" ? <span title="Too few training matches for its own curve: uses the pooled curve of the own-fit countries" className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ember)]">pooled</span> : null;

export function Method() {
  const { data: p, error, loading } = useParquet(() => getParams(), "params");
  const names = useMemo(() => (p ? Object.keys(p.countries) : []), [p]);
  const [pick, setPick] = useState("Canada");
  const origin = typeof window === "undefined" ? "https://<this-site>" : window.location.origin;
  const x = (frp: number) => L + (Math.log10(frp) / 3) * (W - L - R);
  const y = (prob: number) => T + (1 - prob) * (H - T - B);
  const curve = (b0: number, b1: number) =>
    Array.from({ length: 80 }, (_, i) => {
      const frp = 10 ** ((i / 79) * 3);
      return `${i ? "L" : "M"}${x(frp).toFixed(1)},${y(1 / (1 + Math.exp(-(b0 + b1 * Math.log(frp))))).toFixed(1)}`;
    }).join(" ");
  const C = (n: string) => p!.countries[n];
  const fitKey = (n: string) => (C(n).fit_source === "pooled" ? "pooled" : "own");

  const val = useTable<string, ValCol>(names, (n) => n, (n, k) => {
    const t = C(n).validation_test;
    return { name: prettyName(n), fit: fitKey(n), r2: t.model.r2, raw: t.raw_viirs.r2, thr: t.threshold.r2, bias: t.model.bias_pct, n: t.model.n_cell_months }[k];
  }, { k: "n", dir: -1 });
  const step = useTable<string, StepCol>(names, (n) => n, (n, k) => {
    const c = C(n).null_control;
    return { name: prettyName(n), fit: fitKey(n), splice: c.spliced_raw_step_ratio_2012, aqua: c.aqua_only_step_ratio_2012, harm: c.harmonized_step_ratio_2012, gap: Math.abs(c.harmonized_step_ratio_2012 - c.aqua_only_step_ratio_2012) }[k];
  }, { k: "name", dir: 1 });
  const drift = useTable<string, DriftCol>(names, (n) => n, (n, k) => {
    if (k === "name") return prettyName(n);
    if (k === "fit") return fitKey(n);
    return C(n).drift_era[Number(k.slice(1))]?.obs_over_pred;
  }, { k: "name", dir: 1 });

  const summary = useMemo(() => {
    if (!p) return null;
    const own = names.filter((n) => C(n).fit_source !== "pooled");
    const r2 = own.map((n) => C(n).validation_test.model.r2);
    const beats = names.filter((n) => C(n).validation_test.model.r2 > C(n).validation_test.raw_viirs.r2).length;
    const below0 = names.filter((n) => C(n).validation_test.model.r2 < 0).length;
    return { own: own.length, pooled: names.length - own.length, medianR2: median(r2), beats, below0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, names]);
  const failed = Object.keys(p?.failed ?? {}).sort((a, b) => prettyName(a).localeCompare(prettyName(b)));
  const tags = Object.fromEntries(names.map((n) => [n, fitTag(p, n)]));
  const sel = p && C(pick) ? pick : names[0];
  const driftYears = p && names.length ? C(names[0]).drift_era.map((d) => d.year) : [];
  const th = "sticky top-0 z-10 bg-[var(--surface-page)] px-3 py-2.5 font-normal first:pl-0";

  return (
    <div>
      <PageHead eyebrow="Science · method & proof" title="How we know the correction" italic="is real."
        lede="Three steps, tested on years the model never saw, checked against a sensor that never changed, and honest about where it is weakest. Every country is fitted separately: these are regional results, not a global correction." />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["01 · Match", "On the same day and place (within ~3.5 km), did the old sensor, Aqua MODIS, also see the fire that VIIRS saw? Both pass overhead in the early afternoon."],
          ["02 · Learn", "From 2012–2018 we learn, per country, the chance that MODIS sees a fire, given how much energy it radiates. Big fires: almost always. Small ones: rarely."],
          ["03 · Rebuild", "Every VIIRS detection is weighted by that chance. The total is the count a MODIS-class sensor would have made, comparable back to 2003."],
        ].map(([t, d]) => (
          <div key={t} className="card p-5"><Eyebrow>{t}</Eyebrow><p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{d}</p></div>
        ))}
      </div>

      {error && <p className="mt-8 text-sm text-[var(--text-secondary)]">Could not load the fit: {error.message}</p>}
      {loading && <div className="mt-8 h-64 animate-pulse rounded-2xl bg-[var(--surface-2)]" />}
      {p && summary && (
        <>
          <Reveal><section className="card mt-8 min-w-0 p-5 sm:p-6">
            <h2 className="display text-2xl">Tested on years the model never saw</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Fitted on {p.train_years[0]}–{p.train_years[1]}, scored on {p.test_years[0]}–{p.test_years[1]} against what Aqua MODIS actually observed,
              per ~250 km² cell and month. R² of 1 is perfect; below 0 is worse than guessing the average.
              {" "}{names.length} countries fitted: {summary.own} with their own curve, {summary.pooled} on the pooled curve (too few training matches of their own; marked).
              {" "}Median held-out R² over the own-fit countries: <span className="tabular text-[var(--text-primary)]">{fmtR2(summary.medianR2)}</span>.
              {" "}The model beats raw VIIRS on held-out R² in {summary.beats} of {names.length}. Fit {p.fit_version}.
            </p>
            <div className="mt-4"><TableSearch q={val.q} setQ={val.setQ} shown={val.shown.length} total={names.length} /></div>
            <ScrollBox>
              <table className="tabular w-full min-w-[760px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]">
                  <SortTh k="name" sort={val.sort} toggle={val.toggle}>Country</SortTh>
                  <SortTh k="r2" sort={val.sort} toggle={val.toggle}>Emberline R² (95% CI)</SortTh>
                  <SortTh k="raw" sort={val.sort} toggle={val.toggle}>Raw VIIRS R²</SortTh>
                  <SortTh k="thr" sort={val.sort} toggle={val.toggle}>Best single cut-off R²</SortTh>
                  <SortTh k="bias" sort={val.sort} toggle={val.toggle}>Bias</SortTh>
                  <SortTh k="n" sort={val.sort} toggle={val.toggle}>Cell-months</SortTh>
                </tr></thead>
                <tbody>
                  {val.shown.map((n) => {
                    const c = C(n); const t = c.validation_test; const ci = c.validation_test_ci95;
                    return (
                      <tr key={n} data-country={n} className="border-t border-[var(--hairline)]">
                        <td className="py-2.5 pr-3">{prettyName(n)}<FitBadge c={c} /></td>
                        <td className="px-3"><span className="text-[var(--ember)]">{fmtR2(t.model.r2)}</span> <span className="text-xs text-[var(--text-muted)]">({fmtR2(ci.r2[0])} to {fmtR2(ci.r2[1])})</span> <Bar value={t.model.r2} tone="good" /></td>
                        <td className="px-3 text-[var(--text-secondary)]">{fmtR2(t.raw_viirs.r2)}</td>
                        <td className="px-3 text-[var(--text-secondary)]">{fmtR2(t.threshold.r2)}</td>
                        <td className="px-3 text-[var(--text-secondary)]">{fmtPct(t.model.bias_pct)}</td>
                        <td className="px-3 text-[var(--text-muted)]">{fmt(t.model.n_cell_months)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollBox>
            {failed.length > 0 && (
              <details className="mt-4 text-sm text-[var(--text-secondary)]">
                <summary className="cursor-pointer">Not enough data to fit: {failed.length} countries and territories (no harmonized record, no score)</summary>
                <p className="mt-2 text-xs leading-relaxed">{failed.map(prettyName).join(", ")}. Their raw record, where one exists, is shown in the Explorer marked uncorrected.</p>
              </details>
            )}
          </section></Reveal>

          <Reveal><section className="card mt-6 min-w-0 p-5 sm:p-6">
            <h2 className="display text-2xl">The control: a sensor that did not change</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              How much did yearly counts change from 2009–11 to 2012–14? Aqua MODIS flew unchanged through both periods, so it shows what fire really did.
              A correct record should sit near Aqua, not near the raw splice. Sort by &ldquo;gap&rdquo; to see where it does not.
            </p>
            <div className="mt-4"><TableSearch q={step.q} setQ={step.setQ} shown={step.shown.length} total={names.length} /></div>
            <ScrollBox>
              <table className="tabular w-full min-w-[620px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]">
                  <SortTh k="name" sort={step.sort} toggle={step.toggle}>Country</SortTh>
                  <SortTh k="splice" sort={step.sort} toggle={step.toggle}>Raw splice (MODIS → VIIRS)</SortTh>
                  <SortTh k="aqua" sort={step.sort} toggle={step.toggle}>Aqua only (truth)</SortTh>
                  <SortTh k="harm" sort={step.sort} toggle={step.toggle}>Emberline</SortTh>
                  <SortTh k="gap" sort={step.sort} toggle={step.toggle} title="|Emberline − Aqua only|">Gap to Aqua</SortTh>
                </tr></thead>
                <tbody>
                  {step.shown.map((n) => { const k = C(n).null_control; return (
                    <tr key={n} className="border-t border-[var(--hairline)]">
                      <td className="py-2.5 pr-3">{prettyName(n)}<FitBadge c={C(n)} /></td>
                      <td className="px-3 text-[#96221a]">{fmtRatio(k.spliced_raw_step_ratio_2012)}</td>
                      <td className="px-3">{fmtRatio(k.aqua_only_step_ratio_2012)}</td>
                      <td className="px-3 text-[var(--ember)]">{fmtRatio(k.harmonized_step_ratio_2012)}</td>
                      <td className="px-3 text-[var(--text-muted)]">{fmtNum(Math.abs(k.harmonized_step_ratio_2012 - k.aqua_only_step_ratio_2012), 2)}</td>
                    </tr>); })}
                </tbody>
              </table>
            </ScrollBox>
          </section></Reveal>

          <Reveal><section className="card mt-6 min-w-0 p-5 sm:p-6">
            <h2 className="display text-2xl">What MODIS can and cannot see</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Fitted chance that Aqua MODIS also detects a fire VIIRS saw, by the fire&apos;s radiated power: every fitted country in grey, the chosen one in ember,
              the pooled curve dashed. The shaded band is the 9–11 MW
              range reported in the literature as MODIS &ldquo;thresholds of FRP detection&rdquo; (Laurent et al. 2019, citing Roberts &amp; Wooster 2008 and
              Schroeder et al. 2010) — a sanity check on the order of magnitude, not the same quantity.
            </p>
            <div className="mt-4"><CountryPicker value={sel} options={names} tags={tags} onChange={setPick} label="Highlight" /></div>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full max-w-3xl" role="img" aria-label={`Detection probability against fire radiative power, ${names.length} countries, ${prettyName(sel)} highlighted`}>
              <rect x={x(9)} width={x(11) - x(9)} y={T} height={H - T - B} fill="var(--text-primary)" opacity="0.08" />
              {[0, 0.5, 1].map((v) => (<g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--gridline)" /><text x={L - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)">{v}</text></g>))}
              {[1, 10, 100, 1000].map((f) => (<text key={f} x={x(f)} y={H - 16} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{f} MW</text>))}
              <text x={(W + L) / 2} y={H - 2} textAnchor="middle" fontSize="10" fill="var(--text-muted)">fire radiative power of the VIIRS detection</text>
              <path d={names.filter((n) => C(n).fit_source !== "pooled").map((n) => curve(C(n).logistic.b0, C(n).logistic.b1)).join(" ")} fill="none" stroke="var(--text-muted)" strokeOpacity="0.22" strokeWidth="1" />
              {p.pooled_model && <path d={curve(p.pooled_model.b0, p.pooled_model.b1)} fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="5 4" />}
              <path d={curve(C(sel).logistic.b0, C(sel).logistic.b1)} fill="none" stroke={HUES[0]} strokeWidth="2.6" />
            </svg>
            <p className="tabular mt-3 text-xs text-[var(--text-secondary)]">
              <span className="mr-1.5 inline-block h-0.5 w-5 align-middle" style={{ background: HUES[0] }} />
              {prettyName(sel)}: 50% at {fmtNum(C(sel).frp_at_p50_mw, 1)} MW ({fmtNum(C(sel).frp_at_p50_ci95_mw[0], 1)}–{fmtNum(C(sel).frp_at_p50_ci95_mw[1], 1)}), κ {fmtNum(C(sel).kappa, 3)}{C(sel).fit_source === "pooled" ? " · pooled curve" : ""}
              {p.pooled_model && <> · <span className="mx-1 inline-block w-5 border-t border-dashed border-[var(--ink)] align-middle" />pooled curve from {p.pooled_model.from_countries.length} own-fit countries</>}
              {" "}· grey: the {summary.own} own-fit curves
            </p>
          </section></Reveal>

          <Reveal><section className="card mt-6 min-w-0 p-5 sm:p-6">
            <h2 className="display text-2xl">The record is still shifting: orbital drift</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Since 2022 Aqua has been drifting to a later overpass. These years were never used for fitting. The table shows observed Aqua divided by our prediction,
              and Aqua&apos;s mean local solar time over fire detections. Emberline&apos;s record from 2012 is built from Suomi-NPP,
              which has not drifted, so it is not exposed to this. In {p.train_years[0]}–2021 the ratio simply scatters year to year; read the drift years against that.
            </p>
            <div className="mt-4"><TableSearch q={drift.q} setQ={drift.setQ} shown={drift.shown.length} total={names.length} /></div>
            <ScrollBox>
              <table className="tabular w-full min-w-[720px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]">
                  <SortTh k="name" sort={drift.sort} toggle={drift.toggle}>Country</SortTh>
                  {driftYears.map((yr, i) => <SortTh key={yr} k={`y${i}` as DriftCol} sort={drift.sort} toggle={drift.toggle}>{yr}</SortTh>)}
                  <th className={th}>2012–21 range</th>
                </tr></thead>
                <tbody>
                  {drift.shown.map((n) => { const c = C(n); const f = c.frozen_era_obs_over_pred.map((d) => d.obs_over_pred).filter(Number.isFinite); return (
                    <tr key={n} className="border-t border-[var(--hairline)]">
                      <td className="py-2.5 pr-3">{prettyName(n)}<FitBadge c={c} /></td>
                      {c.drift_era.map((d) => <td key={d.year} className="px-3">{fmtRatio(d.obs_over_pred)} <span className="text-xs text-[var(--text-muted)]">{fmtClock(d.aqua_lst)}</span></td>)}
                      <td className="px-3 text-[var(--text-muted)]">{f.length ? <>{fmtRatio(Math.min(...f))}–{fmtNum(Math.max(...f), 2)}</> : "—"}</td>
                    </tr>); })}
                </tbody>
              </table>
            </ScrollBox>
          </section></Reveal>

          <Reveal><section className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="card min-w-0 p-5 sm:p-6">
              <h2 className="display text-2xl">Limits</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                <li>Fitted per country, standing in for region. No land-cover split yet. Countries with too few training matches borrow a pooled curve (marked); {failed.length} are too sparse to fit at all.</li>
                <li>Matching is by day and ~3.5 km proximity, not exact pixel footprints.</li>
                <li>Scores are per small cell and month, which is noisy where fires are few and small. {summary.below0} of the {names.length} fitted countries score below 0 on held-out R² (worse than guessing the average); sort the table above by R² to see them. Treat those countries&apos; corrected records with caution.</li>
                <li>Daytime vegetation fires only; volcanoes, gas flares and offshore sources are excluded.</li>
                <li>Claims are regional. We do not claim a corrected global total.</li>
              </ul>
            </div>
            <div className="card min-w-0 p-5 sm:p-6">
              <h2 className="display text-2xl">Use the data</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">No account, no API key, no server. The files are plain Parquet:</p>
              <pre className="mt-3 max-w-full overflow-x-auto rounded-xl bg-[var(--surface-2)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]"><code>{`import polars as pl
cal = pl.read_parquet(
  "${origin}/data/calendar_harmonized_global.parquet")
print(cal.filter(pl.col("key") == "Canada"))`}</code></pre>
              <p className="mt-3 text-xs text-[var(--text-muted)]">Fit {p.fit_version} · unit: {p.unit} · also <code>/data/params_global.json</code>, <code>/data/calendar_raw_global.parquet</code> (raw, uncorrected).</p>
            </div>
          </section></Reveal>
        </>
      )}
    </div>
  );
}
