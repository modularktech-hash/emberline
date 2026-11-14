"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnnualLine } from "@/components/AnnualLine";
import { useDataset } from "@/components/DatasetBanner";
import { Failed, CountUp, PageHead, Reveal } from "@/components/ui";
import { Eyebrow } from "@/components/Figure";
import { fmtNum, fmtPct, fmtR2, fmtRatio } from "@/lib/format";
import { CountryPicker } from "@/components/CountryPicker";
import { CoverageNote, CoverageSummaryText, useCoverageState, CoverageError } from "@/components/CoverageNote";
import { STATUS_LABEL } from "@/lib/coverage";
import { FitQualityCard } from "@/components/FitQuality";
import { qualityCsvHeader } from "@/lib/quality";
import { MonthYearCalendar, type CellRef } from "@/components/MonthYearCalendar";
import { BOX_FIELDS, bboxCrossesAntimeridian, bboxToParents, cellsExtent, normalizeDrawnBbox, validateBoxInput, type Bbox, type BoxField } from "@/lib/aoi";
import { DotStat } from "@/components/DotMatrix";
import { MONTHS, annualTotals, downloadCsv, fmt, stepRatio } from "@/lib/ember";
import { fitFlags } from "@/lib/fitFlags";
import { areaKey, areaLabel, useAreaData, type Area } from "@/lib/useArea";
import { areaFromQuery, areaToQuery, intParam, useUrlState } from "@/lib/urlState";
import { CopyLink } from "@/components/CopyLink";
import { prettyName } from "@/lib/names";
import { getParams } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import type { Series } from "@/lib/types";

const AoiMap = dynamic(() => import("@/components/AoiMap").then((m) => m.AoiMap), { ssr: false });

const FIRST = 2003; // Aqua's first full year; the harmonized unit is Aqua-equivalent.

export function Explorer() {
  const [area, setArea] = useState<Area>({ kind: "country", name: "Canada" });
  const [mode, setMode] = useState<Series>("raw");
  const [from, setFrom] = useState(FIRST);
  const [to, setTo] = useState(2025);
  const [box, setBox] = useState(["", "", "", ""]);
  // Selected calendar month: kept across raw/harmonized and year changes.
  const [selCell, setSelCell] = useState<CellRef | null>(null);
  const lastCountry = useRef("Canada");
  // Typed-bounds validation: per-field messages plus one summary read out by screen readers.
  const [boxErr, setBoxErr] = useState<{ fields: Partial<Record<BoxField, string>>; message: string } | null>(null);
  useUrlState((q) => {
    const a = areaFromQuery(q);
    if (a?.ok) {
      setArea(a.area); setBoxErr(null);
      if (a.area.kind === "country") lastCountry.current = a.area.name; else if (a.fields) setBox(a.fields);
    } else if (a && !a.ok) { setBox(a.fields); setBoxErr({ fields: a.fieldErrors, message: a.message }); }
    else { setArea({ kind: "country", name: "Canada" }); }
    const m = q.get("mode");
    setMode(m === "harmonized" ? "harmonized" : "raw");
    const f = intParam(q, "from", FIRST, 2025) ?? FIRST, t = intParam(q, "to", FIRST, 2025) ?? 2025;
    if (f <= t) { setFrom(f); setTo(t); } else { setFrom(FIRST); setTo(2025); }
  }, () => ({ ...areaToQuery(area), mode, from: from === FIRST ? null : from, to: to === 2025 ? null : to }), [areaKey(area), mode, from, to]);
  const { data, error, loading, retry } = useAreaData(area);
  const ds = useDataset();
  const coverageState = useCoverageState();
  const coverage = coverageState.data;
  // The map (maplibre, ~1 MB of JS plus tiles) mounts only once the calendar has
  // its data and the map slot is near the viewport, so it never competes with it.
  const mapSlot = useRef<HTMLDivElement>(null);
  const [mapNear, setMapNear] = useState(false);
  useEffect(() => {
    const el = mapSlot.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setMapNear(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const showMap = mapNear && (!!data || !!error);

  const view = useMemo(() => {
    if (!data) return null;
    const lo = Math.max(from, data.raw.years[0]);
    const hi = Math.min(to, data.raw.years[1]);
    const raw = annualTotals(data.raw, lo, hi);
    const harm = annualTotals(data.harmonized, lo, hi);
    const inRange = (r: { year: number }) => r.year >= lo && r.year <= hi;
    const max = Math.max(1, ...data.raw.rows.filter(inRange).map((r) => r.value ?? 0), ...data.harmonized.rows.filter(inRange).map((r) => r.value ?? 0));
    return {
      lo, hi, raw, harm, max,
      stepRaw: stepRatio(annualTotals(data.raw, 2009, 2014)),
      stepHarm: stepRatio(annualTotals(data.harmonized, 2009, 2014)),
    };
  }, [data, from, to]);

  const selectBox = (drawn: Bbox) => {
    const bbox = normalizeDrawnBbox(drawn);
    setBoxErr(null);
    setBox(bbox.map((v) => v.toFixed(2)));
    setArea({ kind: "box", bbox, parents: bboxToParents(bbox) });
  };
  // Invalid or blank bounds never reach the query: the user's entry stays in
  // the fields, each bad field is marked, and the message is announced.
  const applyTyped = () => {
    const check = validateBoxInput(box);
    if (!check.ok) { setBoxErr({ fields: check.fieldErrors, message: check.message }); return; }
    setBoxErr(null);
    setArea({ kind: "box", bbox: check.bbox, parents: bboxToParents(check.bbox) });
  };

  const cal = data ? (mode === "raw" ? data.raw : data.harmonized) : null;
  // No harmonized series, but a raw one: a country without a fit (reason in coverage_status.json), or a box of such cells.
  const rawOnly = !!(data && cal && cal.keys.length === 0 && cal.uncorrectedKeys.length > 0);
  const notProcessed = !!(data && cal && cal.keys.length === 0 && !rawOnly);
  const fit = data && area.kind === "country" ? data.params.countries[area.name] : undefined;
  const unfitted = !!(data && area.kind === "country" && !fit);
  const flags = fit ? fitFlags(fit) : [];
  const boxCells = area.kind === "box" ? area.parents.length : 0;
  const cov = area.kind === "country" ? coverage?.countries[area.name] : undefined;
  const covLabel = cov && unfitted ? STATUS_LABEL[cov.status] : null;

  const exportCsv = () => {
    if (!data || !cal || !view) return;
    downloadCsv(
      `emberline_${areaLabel(area).replace(/[^a-z0-9]+/gi, "_")}_${mode}_${view.lo}-${view.hi}.csv`,
      {
        product: "Emberline burning activity calendar",
        area: areaLabel(area),
        years: `${view.lo}-${view.hi}`,
        series: mode,
        unit: cal.unit,
        fit_version: mode === "harmonized" ? data.params.fit_version : "n/a (raw record, uncorrected)",
        ...(fit ? { ...qualityCsvHeader(fit, data.params), ...(mode === "raw" ? { fit_quality_note: "applies to the harmonized series; this file is the raw record" } : {}) } : {}),
        ...(unfitted && cov ? { fit_status: `no fit: ${STATUS_LABEL[cov.status]}` } : {}),
        ...(mode === "harmonized" && flags.length ? { fit_flags: `suspicious (docs/results.md): ${flags.join("; ")}` } : {}),
        ...(area.kind === "box" ? { h3_res2_cells: `${cal.keys.length} with data of ${boxCells} touched` } : {}),
        ...(mode === "harmonized" && cal.uncorrectedKeys.length ? { excluded_uncorrected: `${cal.uncorrectedKeys.length} cells with a raw record but no fit are not included` } : {}),
        source: "NASA FIRMS: MODIS C6.1 (Terra, Aqua) and VIIRS 375 m (Suomi-NPP); daytime, vegetation fires, nominal+ confidence",
        downloaded: new Date().toISOString(),
      },
      ["year", "month", "detections", "basis"],
      cal.rows.filter((r) => r.year >= view.lo && r.year <= view.hi).map((r) => [r.year, r.month, r.value == null ? "" : Math.round(r.value * 100) / 100, r.basis]),
    );
  };

  const years = data ? Array.from({ length: data.raw.years[1] - FIRST + 1 }, (_, i) => FIRST + i) : [];

  return (
    <div>
      <PageHead compact eyebrow="Explorer · burning activity calendar" title="Every fitted country. Every month." italic="2003–2025."
        lede="Pick a country or draw a box, switch between the raw record (uncorrected) and the harmonized one, and download what you see. Archive 2001–2025; harmonized record 2003–2025." />
      <Coverage />

      <Reveal><section id="explorer" className="window scroll-mt-24">
        <div className="p-4 sm:p-7">
        {/* One toolbar: area (country or drawn box) · years · series · download. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3" role="toolbar" aria-label="Calendar controls">
          <div className="glass-thin flex p-1" role="group" aria-label="Area type">
            {(["country", "box"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={area.kind === k}
                onClick={() => {
                  if (k === "country") { if (area.kind === "box") setArea({ kind: "country", name: lastCountry.current }); }
                  else { document.getElementById("area")?.scrollIntoView({ behavior: "smooth", block: "center" }); document.getElementById("box-west")?.focus({ preventScroll: true }); }
                }}
                className={`min-h-[36px] rounded-full px-3.5 text-sm font-medium transition-colors ${area.kind === k ? "bg-[var(--ink)] text-[#f7f3e8]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {k === "country" ? "Country" : "Draw area"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Area">
            <CountryPicker value={area.kind === "country" ? area.name : ""} display={area.kind === "box" ? "Custom area" : undefined} options={data?.countries ?? ["Canada"]} tags={data?.tags} onChange={(c) => { lastCountry.current = c; setArea({ kind: "country", name: c }); }} />
            {fit?.fit_source === "pooled" && <span title="Too few training matches for its own curve: this country uses the pooled curve of the own-fit countries" className="self-center rounded-full bg-[var(--ember-soft)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--ember)]">pooled fit</span>}
            {fit && fit.fit_source !== "pooled" && flags.length === 0 && <span className="self-center rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">own fit · R² {fmtR2(fit.validation_test.model.r2)}</span>}
            {flags.length > 0 && <span title={`Flagged as suspicious (docs/results.md): ${flags.join("; ")}`} className="self-center rounded-full border border-[var(--ember)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--ember)]">check this fit</span>}
            {unfitted && <span title={covLabel ? `No fit: ${covLabel}` : undefined} className="self-center rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">raw only · uncorrected{covLabel && ` · ${covLabel}`}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]" role="group" aria-label="Years">
            <label className="flex items-center gap-1.5"><span className="sr-only">From year</span>
              <select value={from} onChange={(e) => setFrom(Math.min(Number(e.target.value), to))} className="field min-h-[36px] rounded-xl px-2 py-1 text-[var(--text-primary)]">
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
            <span aria-hidden>–</span>
            <label className="flex items-center gap-1.5"><span className="sr-only">To year</span>
              <select value={to} onChange={(e) => setTo(Math.max(Number(e.target.value), from))} className="field min-h-[36px] rounded-xl px-2 py-1 text-[var(--text-primary)]">
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
          </div>
          <div className="glass-thin flex p-1" role="group" aria-label="Series">
            {(["raw", "harmonized"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                className={`min-h-[36px] rounded-full px-4 text-sm font-medium transition-colors ${mode === m ? "bg-[var(--ink)] text-[#f7f3e8]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {m === "raw" ? "Raw record" : "Harmonized"}
              </button>
            ))}
          </div>
          <CopyLink className="ml-auto" />
          <button type="button" onClick={exportCsv} disabled={!view || notProcessed || rawOnly} className="pill-dark min-h-[40px] px-4 text-sm font-medium disabled:opacity-40">
            Download CSV
          </button>
        </div>

        {error && <div className="mt-8"><Failed error={error} retry={retry} what="the calendars for this area" /></div>}
        <CoverageError state={coverageState} className="mt-4" />
        {unfitted && area.kind === "country" && <CoverageNote country={area.name} coverage={coverage} className="mt-6" />}
        {loading && <div className="mt-8 h-[420px] animate-pulse rounded-2xl bg-[var(--surface-2)]" />}
        {notProcessed && data && (
          <div className="mt-8 rounded-2xl border border-[var(--hairline)] p-6 text-sm leading-relaxed text-[var(--text-secondary)]">
            {ds?.dataset === "world" ? (
              <>
                <p className="text-[var(--text-primary)]">No processed data in this area.</p>
                <p className="mt-1">
                  {area.kind === "box"
                    ? <>None of the {boxCells} ~300 km grid cells this box touches has a detection in the processed FIRMS record (every FIRMS country, {data.countries.length} with detections). Open ocean, ice and deserts often have none.</>
                    : <>{areaLabel(area)} has no calendar in the processed FIRMS record.</>}
                  {" "}No data is not the same as no fire, so nothing is shown.
                </p>
              </>
            ) : (
              <>
                <p className="text-[var(--text-primary)]">This area is not processed yet.</p>
                <p className="mt-1">The world files could not be loaded, so only the four-country fallback is available: {data.countries.map(prettyName).join(", ")}. No data is not the same as no fire, so nothing is shown.</p>
              </>
            )}
          </div>
        )}
        {rawOnly && data && (
          <div className="mt-8 rounded-2xl border border-[var(--hairline)] p-6 text-sm leading-relaxed text-[var(--text-secondary)]">
            <p className="text-[var(--text-primary)]">No harmonized record here.</p>
            <p className="mt-1">
              {area.kind === "country" ? <>{areaLabel(area)} has a raw FIRMS record but no fit{covLabel ? ` (${covLabel}, see below)` : ""}, so there is no corrected series.</> : <>Every cell this box touches has a raw FIRMS record but no harmonized one (a country without a fit — reasons on the Data page — or none of the Aqua/VIIRS detections the fit uses).</>}
              {" "}<button type="button" onClick={() => setMode("raw")} className="link-ul text-[var(--text-primary)]">Show the raw record</button> — it is uncorrected and keeps the 2012 sensor step.
            </p>
          </div>
        )}
        {data && cal && !notProcessed && !rawOnly && (cal.unknownKeys.length > 0 || cal.uncorrectedKeys.length > 0) && area.kind === "box" && (
          <p className="mt-6 rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            This box touches {boxCells} grid cells; {cal.keys.length} {cal.keys.length === 1 ? "has" : "have"} {mode === "raw" ? "a raw record" : "a harmonized record"} and {cal.keys.length === 1 ? "is" : "are"} summed here.
            {cal.unknownKeys.length > 0 && <> {cal.unknownKeys.length} {cal.unknownKeys.length === 1 ? "has" : "have"} no processed data (no detections).</>}
            {cal.uncorrectedKeys.length > 0 && <> {cal.uncorrectedKeys.length} {cal.uncorrectedKeys.length === 1 ? "has" : "have"} only a raw, uncorrected record (in a country without a fit, or with none of the Aqua/VIIRS detections the fit uses) and {cal.uncorrectedKeys.length === 1 ? "is" : "are"} left out of the harmonized series.</>}
          </p>
        )}

        {data && cal && view && !notProcessed && !rawOnly && (
          <div className="fade-in">
            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <Eyebrow>Burning activity calendar · {areaLabel(area)} · detections per month</Eyebrow>
                <p className={`rounded-full px-3 py-1 text-xs font-medium ${mode === "raw" ? "bg-[var(--surface-2)] text-[var(--text-primary)]" : "bg-[var(--ember-soft)] text-[var(--text-primary)]"}`}>
                  {mode === "raw" ? "Raw detections · uncorrected · MODIS to 2011, VIIRS from 2012" : `Harmonized · ${cal.unit} · fit ${data.params.fit_version}`}
                  <span className="text-[var(--text-muted)]"> · historical record {view.lo}–{view.hi}</span>
                </p>
              </div>
              <MonthYearCalendar cal={cal} from={view.lo} to={view.hi} max={view.max} selected={selCell} onSelect={setSelCell} areaName={areaLabel(area)} />
              {(() => {
                const rows = cal.rows.filter((r) => r.year >= view.lo && r.year <= view.hi && r.value !== null);
                if (!rows.length) return null;
                const peak = rows.reduce((a, b) => ((b.value ?? 0) > (a.value ?? 0) ? b : a));
                const best = [...(mode === "raw" ? view.raw : view.harm)].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
                return (
                  <p className="mt-4 text-sm text-[var(--text-secondary)]">
                    Busiest month: <span className="text-[var(--text-primary)]">{MONTHS[peak.month - 1]} {peak.year}</span> ({fmt(peak.value)}).
                    Busiest year: <span className="text-[var(--text-primary)]">{best.year}</span> ({fmt(best.value)}).
                  </p>
                );
              })()}
            </div>
            <div className="mt-8 grid gap-6 border-t border-[var(--hairline)] pt-6 lg:grid-cols-[1fr_17rem]">
              <div>
                <Eyebrow>Detections per year · {areaLabel(area)}</Eyebrow>
                <AnnualLine raw={view.raw} harmonized={view.harm} mode={mode} />
              </div>
              <div className="flex flex-col justify-center gap-5 border-t border-[var(--hairline)] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div>
                  <Eyebrow>The 2012 step</Eyebrow>
                  <p className="display tabular mt-3 text-6xl text-[var(--ember)]">
                    <DotStat text={fmtRatio(mode === "raw" ? view.stepRaw : view.stepHarm)} dot={8} />
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                    Mean yearly count 2012–14 over 2009–11.{" "}
                    {mode === "raw"
                      ? `Harmonized: ${fmtRatio(view.stepHarm)}.`
                      : `The raw record says ${fmtRatio(view.stepRaw)}.`}
                    {fit && ` The unchanged Aqua sensor alone: ${fmtRatio(fit.null_control.aqua_only_step_ratio_2012)}.`}
                  </p>
                </div>
                {fit && (
                  <div>
                    <Eyebrow>This country&apos;s held-out R²</Eyebrow>
                    <p className="display tabular mt-2 text-3xl"><CountUp to={fit.validation_test.model.r2} decimals={Math.abs(fit.validation_test.model.r2) >= 1 ? 1 : 2} /> <span className="stat-unit text-[var(--text-secondary)]">R²</span></p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                      Against observed Aqua, {data.params.test_years[0]}–{data.params.test_years[1]}, years the model never saw.
                      Raw VIIRS scores {fmtR2(fit.validation_test.raw_viirs.r2)}. Bias {fmtPct(fit.validation_test.model.bias_pct)}, RMSE {fmtNum(fit.validation_test.model.rmse, 1)} detections per cell-month. R² is not a percentage accuracy.
                      {fit.fit_source === "pooled" && " Pooled curve: this country had too few training matches for its own."}
                      {flags.length > 0 && <> <span className="text-[var(--ember)]">Flagged as suspicious ({flags.join("; ")}): the fit is shown, not hidden, but treat this harmonized record with caution.</span></>}
                    </p>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  {mode === "raw"
                    ? "Raw record, uncorrected: MODIS counts to 2011, VIIRS counts from 2012 — what a naive download shows."
                    : "Harmonized: the detections a MODIS-class sensor (Aqua) would have made, every year."}
                  {unfitted && ` This country has no fit${covLabel ? ` (${covLabel})` : ""}, so only the raw record exists.`}
                </p>
              </div>
            </div>

          </div>
        )}
        {fit && data && !notProcessed && <FitQualityCard fit={fit} params={data.params} className="mt-8" />}
        {data && (
          <details className="mt-6 rounded-2xl border border-[var(--hairline)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            <summary className="cursor-pointer font-medium text-[var(--text-primary)]">Provenance</summary>
            <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="text-[var(--text-muted)]">Fit version</dt><dd className="tabular">{data.params.fit_version} · trained {data.params.train_years[0]}–{data.params.train_years[1]}, tested {data.params.test_years[0]}–{data.params.test_years[1]}</dd>
              <dt className="text-[var(--text-muted)]">Files</dt><dd>{ds?.dataset === "world" ? "calendar_raw_global.parquet, calendar_harmonized_global.parquet, params_global.json" : "four-country fallback: calendar_raw.parquet, calendar_harmonized.parquet, params.json"}</dd>
              <dt className="text-[var(--text-muted)]">Source</dt><dd>NASA FIRMS archive: MODIS C6.1 (Terra, Aqua), VIIRS 375 m (Suomi-NPP); daytime vegetation-fire detections, nominal and high confidence</dd>
              {coverage && ds?.dataset === "world" && <><dt className="text-[var(--text-muted)]">Coverage</dt><dd><CoverageSummaryText coverage={coverage} /></dd></>}
              <dt className="text-[var(--text-muted)]">Record</dt><dd>Archive 2001–2025; harmonized 2003–2025. Historical snapshot: the live globe is a separate, uncorrected layer.</dd>
            </dl>
          </details>
        )}
        </div>
      </section></Reveal>

      <Reveal>
      <section id="area" className="mt-10 grid scroll-mt-24 gap-6 lg:grid-cols-[1fr_20rem]">
        <div ref={mapSlot}>
          {showMap ? <AoiMap bbox={area.kind === "box" ? area.bbox : null} cells={area.kind === "box" ? data?.raw.keys : undefined} onSelect={selectBox} className="h-[340px]" />
            : <div className="h-[340px] rounded-2xl border border-[var(--hairline)] bg-[var(--surface-2)]" aria-label="Map loading" />}
        </div>
        <div className="card p-5">
          <Eyebrow>Choose your own area</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            Press <span className="text-[var(--text-primary)]">Draw area</span> and drag a box on the map, or type bounds in degrees.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {["West", "South", "East", "North"].map((l, i) => {
              const fieldErr = boxErr?.fields[BOX_FIELDS[i]];
              return (
              <label key={l} className="text-xs text-[var(--text-muted)]">{l}
                <input id={i === 0 ? "box-west" : undefined} inputMode="decimal" value={box[i]}
                  onChange={(e) => {
                    setBox(box.map((v, j) => (j === i ? e.target.value : v)));
                    if (fieldErr) setBoxErr((prev) => prev && { ...prev, fields: { ...prev.fields, [BOX_FIELDS[i]]: undefined } });
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") applyTyped(); }}
                  placeholder={["-9.5", "37", "-6.2", "42.2"][i]}
                  aria-invalid={fieldErr ? true : undefined}
                  aria-describedby={fieldErr ? `box-err-${BOX_FIELDS[i]}` : "box-help"}
                  className={`tabular mt-1 w-full field rounded-xl px-2.5 py-1.5 text-sm text-[var(--text-primary)] ${fieldErr ? "outline outline-2 outline-[var(--ember)]" : ""}`} />
                {fieldErr && <span id={`box-err-${BOX_FIELDS[i]}`} className="mt-1 block text-[11px] leading-snug text-[var(--ember)]">{fieldErr}</span>}
              </label>
              );
            })}
          </div>
          <p id="box-help" className="mt-2 text-[11px] leading-snug text-[var(--text-muted)]">
            Latitude −90 to 90, longitude −180 to 180, south below north. A west value greater than east means the box crosses the 180° meridian (W 170, E −170 is the 20° over the Pacific).
          </p>
          <div role="alert" aria-live="assertive" className="mt-2 text-xs leading-relaxed text-[var(--ember)]">
            {boxErr && <>Not searched: {boxErr.message}</>}
          </div>
          <button type="button" onClick={applyTyped} className="mt-3 w-full rounded-lg pill-dark px-3 py-2.5 text-sm font-medium">Show this area</button>
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
            {area.kind === "box" && data && (() => { const ex = cellsExtent(data.raw.keys); return (
              <span className="mb-2 block rounded-lg bg-[var(--surface-2)] p-2 text-[var(--text-secondary)]">
                <span className="block">Requested: {area.bbox.map((v) => v.toFixed(2)).join(", ")} (W, S, E, N){bboxCrossesAntimeridian(area.bbox) && " — crosses the 180° meridian"}</span>
                <span className="block">Effective coverage: {data.raw.keys.length} of {area.parents.length} touched cells have data{ex ? <>, spanning {ex.map((v) => v.toFixed(1)).join(", ")}</> : ""} — dashed blue on the map.</span>
              </span>); })()}
            Areas resolve to the ~300 km grid cells (H3 resolution 2) they touch, anywhere in the processed FIRMS record, so a small box reports its surrounding cell. Every touched cell is included, up to the whole globe: the cells are enumerated exactly, not sampled, and none is dropped. A cell is summed whole: it can straddle a border.
          </p>
        </div>
      </section>
      </Reveal>
    </div>
  );
}

/**
 * Coverage in one line, counted from params_global.json (own fit, pooled fit,
 * no fit). The reason-coded breakdown (coverage_status.json) is under Provenance.
 */
function Coverage() {
  const { data: p } = useParquet(() => getParams(), "params");
  const ds = useDataset();
  if (!p) return null;
  const fits = Object.values(p.countries);
  const pooled = fits.filter((f) => f.fit_source === "pooled").length;
  const failed = Object.keys(p.failed ?? {}).length;
  return (
    <p data-testid="coverage-summary" className="-mt-4 mb-5 max-w-3xl text-sm text-[var(--text-secondary)]">
      Coverage: <span className="tabular text-[var(--text-primary)]">{fits.length - pooled}</span> countries with their own fit,{" "}
      <span className="tabular text-[var(--text-primary)]">{pooled}</span> on the pooled fit,{" "}
      <span className="tabular text-[var(--text-primary)]">{failed}</span> without a fit (raw record only where one exists, uncorrected). Reasons under Provenance.
      {ds?.dataset === "four" && " The world files could not be loaded: showing the four-country fallback."}
    </p>
  );
}
