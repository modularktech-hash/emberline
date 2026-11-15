"use client";

import { fmtClock, fmtNum, fmtPct, fmtR2, fmtRatio } from "@/lib/format";
import { Eyebrow } from "@/components/Figure";
import { getParams, getParamsFull, loadJson } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import { fmt } from "@/lib/ember";
import { Failed, InfoDot, Loading, PageHead, Reveal } from "@/components/ui";
import { useMemo, useState } from "react";
import { median } from "@/lib/ember";
import { fitTag, prettyName } from "@/lib/names";
import { CountryPicker } from "@/components/CountryPicker";
import { ScrollBox, SortTh, TableSearch, useTable } from "@/components/TableTools";
import type { CountryFit } from "@/lib/types";
import { CI_NOT_ESTIMATED, coefCiEstimated } from "@/lib/fitFlags";
import { CoverageSummaryText, useCoverageState, CoverageError } from "@/components/CoverageNote";
import { STATUS_LABEL } from "@/lib/coverage";
import { MethodNotes, ValidationPlot } from "@/components/ValidationPlot";
import { EventsTest } from "@/components/EventsTest";
import { Benchmark, CannotDo, HeadlineTable, ProofSection, StepCollapse } from "@/components/Proof";

const W = 640, H = 260, L = 40, R = 14, T = 14, B = 34;
// Okabe–Ito based: every pair stays apart under deuteranopia, protanopia and tritanopia (scripts/check_color_access.py).
const HUES = ["#d55e00", "#6b5300", "#0072b2", "#cc79a7", "#009e73", "#882255"];

function Bar({ value, tone }: { value: number; tone: "good" | "bad" }) {
  const w = Math.max(2, Math.min(100, Math.abs(value) * 100));
  return (
    <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-2)] align-middle">
      <span className="block h-full rounded-full" style={{ width: `${tone === "good" ? w : 100}%`, background: tone === "good" ? "var(--ember)" : "var(--grey-1)" }} />
    </span>
  );
}

type ValCol = "name" | "fit" | "r2" | "raw" | "thr" | "bias" | "rmse" | "n";
type StepCol = "name" | "fit" | "splice" | "aqua" | "harm" | "gap";
type DriftCol = "name" | "fit" | "y0" | "y1" | "y2" | "y3";

const FitBadge = ({ c }: { c: CountryFit }) =>
  c.fit_source === "pooled" ? <span title="Too few training matches for its own curve: uses the pooled curve of the own-fit countries" className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ember)]">pooled</span> : null;

interface BridgeScore { n_months: number; median_ape_pct: number | null; p80_ape_pct: number | null; bias_pct: number | null; r2: number | null }
interface BridgeSummary { median_of_country_median_ape_pct: number | null; median_bias_pct: number | null; median_r2: number | null; pooled_log10_r2: number | null; countries_median_ape_le_threshold: number }
interface BridgeFile {
  train_years: [number, number]; train_start_note?: string; test_years: [number, number]; n_countries: number; n_pass: number; pass_rule: string; score_definition: string;
  typical_error_definition: string; type_filter_note: string; input_filters: string; untested: string; fit_version: string;
  summary: { bridged: BridgeSummary; unbridged: BridgeSummary }; current_month?: { month: string; n_countries_harmonized: number };
  countries: Record<string, { ratio: number; test_bridged: BridgeScore; test_unbridged: BridgeScore; typical_error_pct: number | null; pass: boolean }>;
}

/** "Bridging to today": the NOAA-20 to Suomi-NPP bridge and its held-out test, read from bridge.json (scripts/build_bridge.py). */
function BridgeSection() {
  const { data: b } = useParquet(() => loadJson<BridgeFile>("bridge.json").catch(() => null), "bridge");
  if (!b) return null;
  const rows = Object.entries(b.countries).sort((x, y) => prettyName(x[0]).localeCompare(prettyName(y[0])));
  const [t0, t1] = b.test_years;
  const ape = (v: number | null) => (v == null ? "—" : `${fmtNum(v, 1)}%`);
  const summ = (s: BridgeSummary) => `${ape(s.median_of_country_median_ape_pct)} median miss · bias ${s.median_bias_pct == null ? "not recorded" : fmtPct(s.median_bias_pct)} · R² ${fmtR2(s.median_r2)} · ${s.countries_median_ape_le_threshold} of ${b.n_countries} within 25%`;
  return (
    <Reveal><section id="bridge" className="card mt-6 min-w-0 scroll-mt-24 p-5 sm:p-6" data-testid="method-bridge">
      <h2 className="display flex items-center gap-2.5 text-2xl">Bridging to today: NOAA-20 → Suomi-NPP <InfoDot k="bridge" align="start" /></h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        The record from 2012 is built from Suomi-NPP. The current month is only available from NOAA-20, the same VIIRS design on another satellite.
        Per country, the published correction is applied to NOAA-20 detections and scaled by one ratio r = harmonized Suomi-NPP ÷ harmonized NOAA-20 over {b.train_years[0]}–{b.train_years[1]}.
        It is then scored on {t0}–{t1}, which it never saw, against the harmonized Suomi-NPP months. Suomi-NPP has not drifted, so those years are a valid target.
      </p>
      <dl className="tabular mt-4 grid gap-3 sm:grid-cols-3">
        <div><dt className="text-xs text-[var(--text-muted)]">Countries passing</dt><dd className="text-2xl text-[var(--text-primary)]">{b.n_pass} / {b.n_countries}</dd></div>
        <div><dt className="text-xs text-[var(--text-muted)]">Bridged, held-out {t0}–{t1}</dt><dd className="text-sm text-[var(--text-primary)]">{summ(b.summary.bridged)}</dd></div>
        <div><dt className="text-xs text-[var(--text-muted)]">Without the bridge (r = 1)</dt><dd className="text-sm text-[var(--text-primary)]">{summ(b.summary.unbridged)}</dd></div>
      </dl>
      <ScrollBox label="Bridge validation table">
        <table className="tabular mt-4 w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-2 pr-3 font-normal">Country</th><th className="px-3 font-normal">r</th><th className="px-3 font-normal">Median miss, no bridge</th><th className="px-3 font-normal">Median miss, bridged</th>
            <th className="px-3 font-normal">Bias, bridged</th><th className="px-3 font-normal">R², bridged</th><th className="px-3 font-normal">Months</th><th className="px-3 font-normal">Typical error now</th>
          </tr></thead>
          <tbody>{rows.map(([n, c]) => (
            <tr key={n} className="border-t border-[var(--hairline)]">
              <td className="py-2 pr-3">{prettyName(n)}{!c.pass && <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ember)]">raw only</span>}</td>
              <td className="px-3">{fmtNum(c.ratio, 3)}</td>
              <td className="px-3">{ape(c.test_unbridged.median_ape_pct)}</td>
              <td className="px-3">{ape(c.test_bridged.median_ape_pct)}</td>
              <td className="px-3">{c.test_bridged.bias_pct == null ? "—" : fmtPct(c.test_bridged.bias_pct)}</td>
              <td className="px-3">{fmtR2(c.test_bridged.r2)}</td>
              <td className="px-3">{c.test_bridged.n_months}</td>
              <td className="px-3">{c.typical_error_pct == null ? "—" : `±${fmtNum(c.typical_error_pct, 0)}%`}</td>
            </tr>))}</tbody>
        </table>
      </ScrollBox>
      <ul className="mt-3 max-w-3xl list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--text-muted)]">
        <li>Pass rule: {b.pass_rule}. Scores: {b.score_definition}.{b.train_start_note && <> Training: {b.train_start_note}.</>}</li>
        <li>Input: {b.input_filters}. {b.type_filter_note}</li>
        <li>Typical error: {b.typical_error_definition}.</li>
        <li>Not tested: {b.untested}. Fit {b.fit_version}.{b.current_month && <> Applied to {b.current_month.month}: {b.current_month.n_countries_harmonized} countries carry a harmonized month to date; every other country stays raw and uncorrected.</>}</li>
      </ul>
    </section></Reveal>
  );
}

export function Method() {
  // The small fit file draws everything but the drift table, which waits for the full one (it alone reads the per-year drift fields).
  const { data: core, error, loading, retry } = useParquet(() => getParams(), "params");
  const { data: full, error: fullError, retry: fullRetry } = useParquet(() => getParamsFull(), "params-full");
  const p = full ?? core;
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
  const coverageState = useCoverageState();
  const coverage = coverageState.data;
  const C = (n: string) => p!.countries[n];
  const fitKey = (n: string) => (C(n).fit_source === "pooled" ? "pooled" : "own");

  const val = useTable<string, ValCol>(names, (n) => n, (n, k) => {
    const t = C(n).validation_test;
    return { name: prettyName(n), fit: fitKey(n), r2: t.model.r2, raw: t.raw_viirs.r2, thr: t.threshold.r2, bias: t.model.bias_pct, rmse: t.model.rmse, n: t.model.n_cell_months }[k];
  }, { k: "n", dir: -1 });
  const step = useTable<string, StepCol>(names, (n) => n, (n, k) => {
    const c = C(n).null_control;
    return { name: prettyName(n), fit: fitKey(n), splice: c.spliced_raw_step_ratio_2012, aqua: c.aqua_only_step_ratio_2012, harm: c.harmonized_step_ratio_2012, gap: Math.abs(c.harmonized_step_ratio_2012 - c.aqua_only_step_ratio_2012) }[k];
  }, { k: "name", dir: 1 });
  const drift = useTable<string, DriftCol>(names, (n) => n, (n, k) => {
    if (k === "name") return prettyName(n);
    if (k === "fit") return fitKey(n);
    return full?.countries[n]?.drift_era[Number(k.slice(1))]?.obs_over_pred;
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
  const driftYears = full && names.length && full.countries[names[0]] ? full.countries[names[0]].drift_era.map((d) => d.year) : [];
  const th = "sticky top-0 z-10 bg-[var(--surface-page)] px-3 py-2.5 font-normal first:pl-0";

  return (
    <div>
      <PageHead compact eyebrow="Proof · method and validation" info="heldOut" title="How do we know the repair" italic="is real?"
        lede="Three steps, tested on years the model never saw, checked against a sensor that never changed, and honest about where it is weakest. Countries with enough data get their own fitted curve; smaller ones borrow a shared (pooled) curve, counted and marked below. These are regional results, not a global correction." />
      <HeadlineTable />
      <div id="step-collapse" className="scroll-mt-24"><StepCollapse /></div>
      <EventsTest />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["01 · Match", "Each VIIRS detection gets a yes/no label: “seen by Aqua” if Aqua MODIS detected fire on the same UTC date in the same small grid cell (H3 resolution 7) or one of its 6 neighbours, about 3.5 km. Both satellites pass at about 13:30 local time in 2012–2021, so they look at nearly the same moment."],
          ["02 · Learn", "From 2012–2018 we learn, per country, the chance that MODIS sees a fire, given how much energy it radiates. Big fires: almost always. Small ones: rarely."],
          ["03 · Rebuild", "Every VIIRS detection is weighted by that chance. The total is the count a MODIS-class sensor would have made, comparable back to 2003."],
        ].map(([t, d]) => (
          <div key={t} className="card p-5"><Eyebrow>{t}</Eyebrow><p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{d}</p></div>
        ))}
      </div>

      {error && <div className="mt-8"><Failed error={error} retry={retry} what="the fit (params)" /></div>}
      <CoverageError state={coverageState} className="mt-4" />
      {loading && <div className="mt-8 h-64 dot-skel" />}
      {p && summary && (
        <>
          <Reveal><section className="card mt-8 min-w-0 p-5 sm:p-6">
            <h2 className="display text-2xl">Evidence in brief</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="method-summary">
              {[
                ["Trained on", `${p.train_years[0]}–${p.train_years[1]}`],
                ["Tested on (held out)", `${p.test_years[0]}–${p.test_years[1]}`],
                ["Reference sensor", "Aqua MODIS (unchanged)"],
                ["Countries fitted", `${summary.own} own · ${summary.pooled} pooled`],
                ["Median held-out R² (own fits)", fmtR2(summary.medianR2)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-[var(--hairline)] p-3">
                  <dt className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
                  <dd className="tabular mt-1 text-lg font-medium text-[var(--text-primary)]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {summary.below0} of {names.length} fitted countries score below 0 on held-out R² (weak fits).{" "}
              <button type="button" className="link-ul text-[var(--text-primary)]" onClick={() => { val.setSort({ k: "r2", dir: 1 }); document.getElementById("val-table")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                Show the weakest fits first
              </button>
            </p>
            <ValidationPlot />
            <h2 id="val-table" className="display mt-8 scroll-mt-24 text-2xl">Tested on years the model never saw</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Fitted on {p.train_years[0]}–{p.train_years[1]}, scored on {p.test_years[0]}–{p.test_years[1]} against Aqua reference observations,
              per ~250 km² cell and month. R² of 1 is perfect; below 0 is worse than guessing the average.
              {" "}{names.length} countries fitted: {summary.own} with their own curve, {summary.pooled} on the pooled curve (too few training matches of their own; marked).
              {" "}Median held-out R² over the own-fit countries: <span className="tabular text-[var(--text-primary)]">{fmtR2(summary.medianR2)}</span>.
              {" "}The model beats raw VIIRS on held-out R² in {summary.beats} of {names.length}. Fit {p.fit_version}.
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
              R² is held-out R², not a percentage accuracy. Bias = (predicted − observed Aqua total) ÷ observed, over the test years. RMSE is in detections per H3 resolution-5 cell (~250 km²) and month.
              The 95% intervals come from 200 bootstrap resamples of the test cells (cells drawn with replacement, all their months kept).
              This validation cell is far smaller than the ~300 km grid cells (H3 resolution 2) that a drawn box in the Explorer resolves to; those coarse cells only decide which data is summed, not how it is scored.
            </p>
            <div className="mt-4"><TableSearch q={val.q} setQ={val.setQ} shown={val.shown.length} total={names.length} /></div>
            <ScrollBox label="Held-out validation table">
              <table className="tabular w-full min-w-[840px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]">
                  <SortTh k="name" sort={val.sort} toggle={val.toggle}>Country</SortTh>
                  <SortTh k="r2" sort={val.sort} toggle={val.toggle}>Emberline R² (95% CI)</SortTh>
                  <SortTh k="raw" sort={val.sort} toggle={val.toggle}>Raw VIIRS R²</SortTh>
                  <SortTh k="thr" sort={val.sort} toggle={val.toggle}>Best single cut-off R²</SortTh>
                  <SortTh k="bias" sort={val.sort} toggle={val.toggle}>Bias</SortTh>
                  <SortTh k="rmse" sort={val.sort} toggle={val.toggle} title="Root-mean-square error, detections per cell-month">RMSE</SortTh>
                  <SortTh k="n" sort={val.sort} toggle={val.toggle}>Cell-months</SortTh>
                </tr></thead>
                <tbody>
                  {val.shown.map((n) => {
                    const c = C(n); const t = c.validation_test; const ci = c.validation_test_ci95;
                    return (
                      <tr key={n} data-country={n} className="border-t border-[var(--hairline)]">
                        <td className="py-2.5 pr-3">{prettyName(n)}<FitBadge c={c} /></td>
                        <td className="px-3">{t.model.r2 < 0 && <span className="mr-1.5 rounded-full bg-[var(--surface-2)] px-1.5 font-mono text-[10px] uppercase text-[var(--text-secondary)]">weak</span>}<span className="text-[var(--ember)]">{fmtR2(t.model.r2)}</span> <span className="text-xs text-[var(--text-muted)]">({fmtR2(ci.r2[0])} to {fmtR2(ci.r2[1])})</span> <Bar value={t.model.r2} tone="good" /></td>
                        <td className="px-3 text-[var(--text-secondary)]">{fmtR2(t.raw_viirs.r2)}</td>
                        <td className="px-3 text-[var(--text-secondary)]">{fmtR2(t.threshold.r2)}</td>
                        <td className="px-3 text-[var(--text-secondary)]">{fmtPct(t.model.bias_pct)}</td>
                        <td className="px-3 text-[var(--text-secondary)]">{fmtNum(t.model.rmse, 2)}</td>
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
                {coverage && (
                  <>
                    <p className="mt-2 text-xs leading-relaxed">Reason-coded (coverage_status.json): <CoverageSummaryText coverage={coverage} />. The fitter raised a TypeError for each of these; every one was traced to an empty or degenerate data window, not a numerical failure.</p>
                    <ul className="mt-1 gap-x-6 text-xs leading-relaxed sm:columns-2 lg:columns-3">
                      {failed.map((n) => coverage.countries[n] && <li key={n}>{prettyName(n)}: {STATUS_LABEL[coverage.countries[n].status]}{coverage.countries[n].has_raw_calendar ? "" : " · no calendar"}</li>)}
                    </ul>
                  </>
                )}
              </details>
            )}
          </section></Reveal>

          <Reveal><section className="card mt-6 min-w-0 p-5 sm:p-6" data-testid="matching">
            <h2 className="display text-2xl">How the matching works, in plain words</h2>
            <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
              <li><span className="text-[var(--text-primary)]">A label, not a pairing.</span> Every Suomi-NPP VIIRS detection is labelled &ldquo;seen by Aqua&rdquo; (yes) or not (no). Yes means Aqua MODIS detected fire on the same UTC date in the same H3 resolution-7 cell or one of its 6 neighbours (about 3.5 km). It is not a one-to-one pairing: an Aqua detection is never used up, so several VIIRS pixels of one fire can all be labelled seen by it, and no VIIRS pixel is matched twice. κ later converts from VIIRS pixels to MODIS detections.</li>
              <li><span className="text-[var(--text-primary)]">Same time of day.</span> In {p.train_years[0]}–2021 both Aqua and Suomi-NPP cross at about 13:30 local solar time, daytime passes only, which limits the difference in when each sensor looks. That stops in 2022, when Aqua starts to drift (see below), which is why the fit uses 2012–2018 and tests on 2019–2021.</li>
              <li><span className="text-[var(--text-primary)]">Known limitation: dense fire areas.</span> Where many fires burn close together, a VIIRS detection can be labelled &ldquo;seen&rdquo; because Aqua saw a neighbouring fire, not this one. That pushes the fitted chance of detection up. The per-country κ, fitted so the training-years total equals Aqua&apos;s, absorbs part of this, not all of it.</li>
            </ul>
          </section></Reveal>

          <Benchmark />
          <ProofSection />
          <CannotDo />

          <Reveal><MethodNotes /></Reveal>

          <Reveal><section className="card mt-6 min-w-0 p-5 sm:p-6">
            <h2 className="display text-2xl">The control: a sensor that did not change</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              How much did yearly counts change from 2009–11 to 2012–14? Aqua MODIS flew unchanged through both periods, so its own ratio is the reference: Aqua reference observations, not ground truth.
              A correct record should sit near Aqua, not near the raw splice. Sort by &ldquo;gap&rdquo; to see where it does not.
            </p>
            <div className="mt-4"><TableSearch q={step.q} setQ={step.setQ} shown={step.shown.length} total={names.length} /></div>
            <ScrollBox label="Null-control step table">
              <table className="tabular w-full min-w-[620px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]">
                  <SortTh k="name" sort={step.sort} toggle={step.toggle}>Country</SortTh>
                  <SortTh k="splice" sort={step.sort} toggle={step.toggle}>Raw splice (MODIS → VIIRS)</SortTh>
                  <SortTh k="aqua" sort={step.sort} toggle={step.toggle}>Aqua only (reference observations)</SortTh>
                  <SortTh k="harm" sort={step.sort} toggle={step.toggle}>Emberline</SortTh>
                  <SortTh k="gap" sort={step.sort} toggle={step.toggle} title="|Emberline − Aqua only|">Gap to Aqua</SortTh>
                </tr></thead>
                <tbody>
                  {step.shown.map((n) => { const k = C(n).null_control; return (
                    <tr key={n} className="border-t border-[var(--hairline)]">
                      <td className="py-2.5 pr-3">{prettyName(n)}<FitBadge c={C(n)} /></td>
                      <td className="px-3 text-[var(--c-raw)]">{fmtRatio(k.spliced_raw_step_ratio_2012)}</td>
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
              {prettyName(sel)}: 50% at {fmtNum(C(sel).frp_at_p50_mw, 1)} MW ({coefCiEstimated(C(sel)) ? <>{fmtNum(C(sel).frp_at_p50_ci95_mw[0], 1)}–{fmtNum(C(sel).frp_at_p50_ci95_mw[1], 1)}</> : CI_NOT_ESTIMATED}), κ {fmtNum(C(sel).kappa, 3)}{C(sel).fit_source === "pooled" ? " · pooled curve" : ""}
              {p.pooled_model && <> · <span className="mx-1 inline-block w-5 border-t border-dashed border-[var(--ink)] align-middle" />pooled curve from {p.pooled_model.from_countries.length} own-fit countries</>}
              {" "}· grey: the {summary.own} own-fit curves
            </p>
          </section></Reveal>

          <Reveal><section className="card mt-6 min-w-0 p-5 sm:p-6">
            <h2 className="display text-2xl">κ: from probabilities to a MODIS-scale count</h2>
            <p className="tabular mt-3 font-mono text-sm text-[var(--text-primary)]">Aqua-equivalent count = κ × Σ P(FRPᵢ), summed over the VIIRS detections</p>
            <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
              <li><span className="text-[var(--text-primary)]">What it is.</span> One fire seen by VIIRS at 375 m can light several VIIRS pixels inside a single 1 km MODIS pixel, while MODIS records it once. So Σ P, the expected number of VIIRS detections MODIS would also have flagged, still counts in VIIRS pixels. κ converts that to MODIS detections.</li>
              <li><span className="text-[var(--text-primary)]">How it is estimated.</span> Per country, on the training years only ({p.train_years[0]}–{p.train_years[1]}): κ = (number of Aqua detections) ÷ Σ P over that country&apos;s Suomi-NPP detections. Countries with fewer than 500 Aqua training detections borrow the pooled κ ({p.pooled_model ? fmtNum(p.pooled_model.kappa, 3) : "—"}); {names.filter((n) => C(n).kappa_source === "pooled").length} do.</li>
              <li><span className="text-[var(--text-primary)]">Why it is needed after the probability weighting.</span> P answers &ldquo;would MODIS have seen this VIIRS detection?&rdquo;, one detection at a time; it says nothing about how many VIIRS detections make up one MODIS detection. Without κ the total would carry that pixel-count ratio. With κ the training-years total equals Aqua&apos;s by construction; the held-out years test whether that still holds.</li>
              <li><span className="text-[var(--text-primary)]">How uncertain it is.</span> The fit stores no interval for κ on its own. The end-to-end check is the held-out bias above, with its bootstrap interval, scored on years κ never saw. Across the {summary.own} own-fit countries κ ranges {fmtNum(Math.min(...names.filter((n) => C(n).kappa_source !== "pooled").map((n) => C(n).kappa)), 3)}–{fmtNum(Math.max(...names.filter((n) => C(n).kappa_source !== "pooled").map((n) => C(n).kappa)), 3)} (median {fmtNum(median(names.filter((n) => C(n).kappa_source !== "pooled").map((n) => C(n).kappa)), 3)}), so it is a country property, not a constant.</li>
            </ul>
            <p className="mt-3 text-xs text-[var(--text-muted)]">Source: scripts/fit_harmonization.py, step 3. The logistic curve&apos;s intervals come from 50 bootstrap refits on up to 200,000 resampled training detections. Countries on the borrowed (pooled) curve have no coefficient interval: their curve is a detection-weighted average of the own-fit countries&apos; coefficients, which was not resampled, so its uncertainty is not estimated (not zero). Their held-out score intervals above are computed as for every other country.</p>
          </section></Reveal>

          <BridgeSection />

          <Reveal><section className="card mt-6 min-w-0 p-5 sm:p-6">
            <h2 className="display text-2xl">The record is still shifting: orbital drift</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Since 2022 Aqua has been drifting to a later overpass. These years were never used for fitting. The table shows observed Aqua divided by our prediction,
              and Aqua&apos;s mean local solar time over fire detections. Emberline&apos;s record from 2012 is built from Suomi-NPP,
              which has not drifted, so it is not exposed to this. In {p.train_years[0]}–2021 the ratio simply scatters year to year; read the drift years against that.
            </p>
            {!full && <div className="mt-4">{fullError ? <Failed error={fullError} retry={fullRetry} what="the drift table" /> : <Loading h={240} />}</div>}
            {full && <><div className="mt-4"><TableSearch q={drift.q} setQ={drift.setQ} shown={drift.shown.length} total={names.length} /></div>
            <ScrollBox label="Drift-era table">
              <table className="tabular w-full min-w-[720px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]">
                  <SortTh k="name" sort={drift.sort} toggle={drift.toggle}>Country</SortTh>
                  {driftYears.map((yr, i) => <SortTh key={yr} k={`y${i}` as DriftCol} sort={drift.sort} toggle={drift.toggle}>{yr}</SortTh>)}
                  <th className={th}>2012–21 range</th>
                </tr></thead>
                <tbody>
                  {drift.shown.filter((n) => full.countries[n]).map((n) => { const c = full.countries[n]; const f = c.frozen_era_obs_over_pred.map((d) => d.obs_over_pred).filter(Number.isFinite); return (
                    <tr key={n} className="border-t border-[var(--hairline)]">
                      <td className="py-2.5 pr-3">{prettyName(n)}<FitBadge c={c} /></td>
                      {c.drift_era.map((d) => <td key={d.year} className="px-3">{fmtRatio(d.obs_over_pred)} <span className="text-xs text-[var(--text-muted)]">{fmtClock(d.aqua_lst)}</span></td>)}
                      <td className="px-3 text-[var(--text-muted)]">{f.length ? <>{fmtRatio(Math.min(...f))}–{fmtNum(Math.max(...f), 2)}</> : "—"}</td>
                    </tr>); })}
                </tbody>
              </table>
            </ScrollBox></>}
          </section></Reveal>

          <Reveal><section className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="card min-w-0 p-5 sm:p-6">
              <h2 className="display text-2xl">Limits</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                <li>Fitted per country, standing in for region. No land-cover split yet. {names.length} countries harmonized: {summary.own} with their own fit, {summary.pooled} with a pooled fit (marked); {failed.length} shown raw (too few detections to fit).</li>
                <li>Matching is by UTC day and ~3.5 km proximity, not exact pixel footprints; in dense fire areas a neighbouring fire can make a VIIRS detection count as seen (see the matching section).</li>
                <li>Scores are per small cell and month, which is noisy where fires are few and small. {summary.below0} of the {names.length} fitted countries score below 0 on held-out R² (worse than guessing the average); sort the table above by R² to see them. Treat those countries&apos; corrected records with caution.</li>
                <li>Daytime vegetation fires only; volcanoes, gas flares and offshore sources are excluded from the archive. The 2026 near-real-time data has no such type filter; the NOAA-20 bridge is fitted without it for that reason.</li>
                <li>Claims are regional. We do not claim a corrected global total.</li>
              </ul>
            </div>
            <div className="card min-w-0 p-5 sm:p-6">
              <h2 className="display text-2xl">Use the data</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">No account, no API key, no server. The files are plain Parquet:</p>
              <pre tabIndex={0} role="region" aria-label="Python example" className="mt-3 max-w-full overflow-x-auto rounded-xl bg-[var(--surface-2)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]"><code>{`import polars as pl
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
