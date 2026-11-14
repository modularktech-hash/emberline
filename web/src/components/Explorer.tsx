"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnnualLine } from "@/components/AnnualLine";
import { PageHead } from "@/components/ui";
import { CountryPicker } from "@/components/CountryPicker";
import { MonthYearCalendar } from "@/components/MonthYearCalendar";
import { bboxToParents, type Bbox } from "@/lib/aoi";
import { DotStat } from "@/components/DotMatrix";
import { MONTHS, annualTotals, downloadCsv, fmt, stepRatio } from "@/lib/ember";
import { areaLabel, useAreaData, type Area } from "@/lib/useArea";
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
  const notProcessed = data && cal && cal.keys.length === 0;
  const fit = data && area.kind === "country" ? data.params.countries[area.name] : undefined;

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
        fit_version: mode === "harmonized" ? data.params.fit_version : "n/a (uncorrected)",
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

      <section id="explorer" className="window scroll-mt-24">
        <div className="flex items-center gap-3 bg-white/30 px-4 py-2.5">
          <span className="flex gap-1.5">{[0, 1, 2].map((d) => <span key={d} className="h-2.5 w-2.5 rounded-full bg-[rgba(18,23,21,0.14)]" />)}</span>
          <span className="tabular mx-auto rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">emberline / burning-activity-calendar</span>
        </div>
        <div className="p-4 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Area">
            <CountryPicker value={area.kind === "country" ? area.name : "Custom area"} options={data?.countries ?? ["Canada"]} onChange={(c) => setArea({ kind: "country", name: c })} />
            {area.kind === "box" && <span className="rounded-full border border-[var(--ember)] bg-[var(--ember-soft)] px-3.5 py-1.5 text-sm">Custom area</span>}
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
            <p className="text-[var(--text-primary)]">This area is not processed yet.</p>
            <p className="mt-1">Current coverage: {data.countries.join(", ")}. No data is not the same as no fire, so nothing is shown.</p>
          </div>
        )}

        {data && cal && view && !notProcessed && (
          <>
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_17rem]">
              <div>
                <p className="eyebrow">Detections per year · {areaLabel(area)}</p>
                <AnnualLine raw={view.raw} harmonized={view.harm} mode={mode} />
              </div>
              <div className="flex flex-col justify-center gap-5 border-t border-[var(--hairline)] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div>
                  <p className="eyebrow">The 2012 step</p>
                  <p className="display tabular mt-3 text-6xl text-[var(--ember)]">
                    <DotStat text={`×${((mode === "raw" ? view.stepRaw : view.stepHarm) ?? NaN).toFixed(2)}`} dot={8} />
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                    Mean yearly count 2012–14 over 2009–11.{" "}
                    {mode === "raw"
                      ? `Harmonized: ×${(view.stepHarm ?? NaN).toFixed(2)}.`
                      : `The raw record says ×${(view.stepRaw ?? NaN).toFixed(2)}.`}
                    {fit && ` The unchanged Aqua sensor alone: ×${fit.null_control.aqua_only_step_ratio_2012.toFixed(2)}.`}
                  </p>
                </div>
                {fit && (
                  <div>
                    <p className="eyebrow">Held-out accuracy</p>
                    <p className="display tabular mt-1 text-3xl">R² {fit.validation_test.model.r2.toFixed(2)}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                      Against observed Aqua, {data.params.test_years[0]}–{data.params.test_years[1]}, years the model never saw.
                      Raw VIIRS scores {fit.validation_test.raw_viirs.r2.toFixed(1)}.
                    </p>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  {mode === "raw"
                    ? "Raw: MODIS counts to 2011, VIIRS counts from 2012 — what a naive download shows."
                    : "Harmonized: the detections a MODIS-class sensor (Aqua) would have made, every year."}
                </p>
              </div>
            </div>

            <div className="mt-8 border-t border-[var(--hairline)] pt-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <p className="eyebrow">Burning activity calendar · detections per month</p>
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
          </>
        )}
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div ref={mapSlot}>
          {showMap ? <AoiMap bbox={area.kind === "box" ? area.bbox : null} onSelect={selectBox} className="h-[340px]" />
            : <div className="h-[340px] rounded-2xl border border-[var(--hairline)] bg-[var(--surface-2)]" aria-label="Map loading" />}
        </div>
        <div className="card p-5">
          <p className="eyebrow">Choose your own area</p>
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
            Areas resolve to the ~300 km grid cells they touch, so a small box reports its surrounding cell.
          </p>
        </div>
      </section>
    </div>
  );
}
