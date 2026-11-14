"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnnualLine } from "@/components/AnnualLine";
import { CountUp, PageHead, Reveal } from "@/components/ui";
import { Eyebrow } from "@/components/Figure";
import { fmtR2, fmtRatio } from "@/lib/format";
import { CountryPicker } from "@/components/CountryPicker";
import { MonthYearCalendar } from "@/components/MonthYearCalendar";
import { bboxToParents, type Bbox } from "@/lib/aoi";
import { DotStat } from "@/components/DotMatrix";
import { MONTHS, annualTotals, downloadCsv, fmt, stepRatio } from "@/lib/ember";
import { areaLabel, useAreaData, type Area } from "@/lib/useArea";
import { prettyName } from "@/lib/names";
import type { Series } from "@/lib/types";

const AoiMap = dynamic(() => import("@/components/AoiMap").then((m) => m.AoiMap), { ssr: false });

const FIRST = 2003; // Aqua's first full year; the harmonized unit is Aqua-equivalent.

export function Explorer() {
  const [area, setArea] = useState<Area>({ kind: "country", name: "Canada" });
  const [mode, setMode] = useState<Series>("raw");
  const [from, setFrom] = useState(FIRST);
  const [to, setTo] = useState(2025);
  const [box, setBox] = useState(["", "", "", ""]);
  const { data, error, loading } = useAreaData(area);
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

  const selectBox = (bbox: Bbox) => {
    setBox(bbox.map((v) => v.toFixed(2)));
    setArea({ kind: "box", bbox, parents: bboxToParents(bbox) });
  };
  const applyTyped = () => {
    const [w, s, e, n] = box.map(Number);
    if ([w, s, e, n].every(Number.isFinite) && e > w && n > s) selectBox([w, s, e, n]);
  };

  const cal = data ? (mode === "raw" ? data.raw : data.harmonized) : null;
  // No harmonized series, but a raw one: a country too sparse to fit, or a box of such cells.
  const rawOnly = !!(data && cal && cal.keys.length === 0 && cal.uncorrectedKeys.length > 0);
  const notProcessed = !!(data && cal && cal.keys.length === 0 && !rawOnly);
  const fit = data && area.kind === "country" ? data.params.countries[area.name] : undefined;
  const unfitted = !!(data && area.kind === "country" && !fit);
  const boxCells = area.kind === "box" ? area.parents.length : 0;

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
      <PageHead eyebrow="Explorer · burning activity calendar" title="Any area. Every month." italic="Since 2001."
        lede="Pick a region or draw your own, flip between the raw and harmonized record, choose the years, and download exactly what you see." />

      <Reveal><section id="explorer" className="window scroll-mt-24">
        <div className="flex items-center gap-3 bg-white/30 px-4 py-2.5">
          <span className="flex gap-1.5">{[0, 1, 2].map((d) => <span key={d} className="h-2.5 w-2.5 rounded-full bg-[rgba(18,23,21,0.14)]" />)}</span>
          <span className="tabular mx-auto rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">emberline / burning-activity-calendar</span>
        </div>
        <div className="p-4 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Area">
            <CountryPicker value={area.kind === "country" ? area.name : ""} display={area.kind === "box" ? "Custom area" : undefined} options={data?.countries ?? ["Canada"]} tags={data?.tags} onChange={(c) => setArea({ kind: "country", name: c })} />
            {area.kind === "box" && <span className="rounded-full border border-[var(--ember)] bg-[var(--ember-soft)] px-3.5 py-1.5 text-sm">Custom area</span>}
            {fit?.fit_source === "pooled" && <span title="Too few training matches for its own curve: this country uses the pooled curve of the own-fit countries" className="self-center rounded-full bg-[var(--ember-soft)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--ember)]">pooled fit</span>}
            {unfitted && <span className="self-center rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">raw only · uncorrected</span>}
          </div>
          <div className="glass-thin flex p-1" role="group" aria-label="Series">
            {(["raw", "harmonized"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${mode === m ? "bg-[var(--ink)] text-[#f7f3e8]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {m === "raw" ? "Raw record" : "Harmonized"}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-8 text-sm text-[var(--text-secondary)]">Could not load the data files: {error.message}</p>}
        {loading && <div className="mt-8 h-[420px] animate-pulse rounded-2xl bg-[var(--surface-2)]" />}
        {notProcessed && data && (
          <div className="mt-8 rounded-2xl border border-[var(--hairline)] p-6 text-sm leading-relaxed text-[var(--text-secondary)]">
            {data.raw.dataset === "world" ? (
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
              {area.kind === "country" ? <>{areaLabel(area)} has a raw FIRMS record but too few matched detections for a fit, so there is no corrected series.</> : <>Every cell this box touches has a raw FIRMS record but no harmonized one (a country too sparse to fit, or none of the Aqua/VIIRS detections the fit uses).</>}
              {" "}<button type="button" onClick={() => setMode("raw")} className="link-ul text-[var(--text-primary)]">Show the raw record</button> — it is uncorrected and keeps the 2012 sensor step.
            </p>
          </div>
        )}
        {data && cal && !notProcessed && !rawOnly && (cal.unknownKeys.length > 0 || cal.uncorrectedKeys.length > 0) && area.kind === "box" && (
          <p className="mt-6 rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            This box touches {boxCells} grid cells; {cal.keys.length} {cal.keys.length === 1 ? "has" : "have"} {mode === "raw" ? "a raw record" : "a harmonized record"} and {cal.keys.length === 1 ? "is" : "are"} summed here.
            {cal.unknownKeys.length > 0 && <> {cal.unknownKeys.length} {cal.unknownKeys.length === 1 ? "has" : "have"} no processed data (no detections).</>}
            {cal.uncorrectedKeys.length > 0 && <> {cal.uncorrectedKeys.length} {cal.uncorrectedKeys.length === 1 ? "has" : "have"} only a raw, uncorrected record (in a country too sparse to fit, or with none of the Aqua/VIIRS detections the fit uses) and {cal.uncorrectedKeys.length === 1 ? "is" : "are"} left out of the harmonized series.</>}
          </p>
        )}

        {data && cal && view && !notProcessed && !rawOnly && (
          <div className="fade-in">
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_17rem]">
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
                    <Eyebrow>Held-out accuracy</Eyebrow>
                    <p className="display tabular mt-2 text-3xl"><CountUp to={fit.validation_test.model.r2} decimals={Math.abs(fit.validation_test.model.r2) >= 1 ? 1 : 2} /> <span className="stat-unit text-[var(--text-secondary)]">R²</span></p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                      Against observed Aqua, {data.params.test_years[0]}–{data.params.test_years[1]}, years the model never saw.
                      Raw VIIRS scores {fmtR2(fit.validation_test.raw_viirs.r2)}.
                      {fit.fit_source === "pooled" && " Pooled curve: this country had too few training matches for its own."}
                    </p>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  {mode === "raw"
                    ? "Raw record, uncorrected: MODIS counts to 2011, VIIRS counts from 2012 — what a naive download shows."
                    : "Harmonized: the detections a MODIS-class sensor (Aqua) would have made, every year."}
                  {unfitted && " This country is too sparse to fit, so only the raw record exists."}
                </p>
              </div>
            </div>

            <div className="mt-8 border-t border-[var(--hairline)] pt-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <Eyebrow>Burning activity calendar · detections per month</Eyebrow>
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <label className="flex items-center gap-1.5">From
                    <select value={from} onChange={(e) => setFrom(Math.min(Number(e.target.value), to))} className="field rounded-xl px-2 py-1">
                      {years.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">to
                    <select value={to} onChange={(e) => setTo(Math.max(Number(e.target.value), from))} className="field rounded-xl px-2 py-1">
                      {years.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={exportCsv} className="glass rounded-full px-3.5 py-1 font-medium text-[var(--text-primary)]">
                    Download CSV
                  </button>
                </div>
              </div>
              <MonthYearCalendar cal={cal} from={view.lo} to={view.hi} max={view.max} />
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
          </div>
        )}
        </div>
      </section></Reveal>

      <Reveal>
      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div ref={mapSlot}>
          {showMap ? <AoiMap bbox={area.kind === "box" ? area.bbox : null} onSelect={selectBox} className="h-[340px]" />
            : <div className="h-[340px] rounded-2xl border border-[var(--hairline)] bg-[var(--surface-2)]" aria-label="Map loading" />}
        </div>
        <div className="card p-5">
          <Eyebrow>Choose your own area</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            Press <span className="text-[var(--text-primary)]">Draw area</span> and drag a box on the map, or type bounds in degrees.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {["West", "South", "East", "North"].map((l, i) => (
              <label key={l} className="text-xs text-[var(--text-muted)]">{l}
                <input inputMode="decimal" value={box[i]} onChange={(e) => setBox(box.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder={["-9.5", "37", "-6.2", "42.2"][i]}
                  className="tabular mt-1 w-full field rounded-xl px-2.5 py-1.5 text-sm text-[var(--text-primary)]" />
              </label>
            ))}
          </div>
          <button type="button" onClick={applyTyped} className="mt-3 w-full rounded-lg pill-dark px-3 py-2.5 text-sm font-medium">Show this area</button>
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
            Areas resolve to the ~300 km grid cells (H3 resolution 2) they touch, anywhere in the processed FIRMS record, so a small box reports its surrounding cell. A cell is summed whole: it can straddle a border.
          </p>
        </div>
      </section>
      </Reveal>
    </div>
  );
}
