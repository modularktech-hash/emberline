"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { BOX_FIELDS, bboxCrossesAntimeridian, cellsExtent, geomBbox, normalizeDrawnBbox, validateBoxInput, validateRing, type Bbox, type BoxField, type Ring } from "@/lib/aoi";
import { DotStat } from "@/components/DotMatrix";
import { MonthToDateCard } from "@/components/MonthToDate";
import { HotspotDownload } from "@/components/HotspotDownload";
import { MONTHS, annualTotals, downloadCsv, fmt, stepRatio, type YearTotal } from "@/lib/ember";
import { fitFlags } from "@/lib/fitFlags";
import { areaKey, areaLabel, geomOf, makeArea, useAreaData, type Area } from "@/lib/useArea";
import { areaFromQuery, areaToQuery, intParam, reproducingUrl, useUrlState } from "@/lib/urlState";
import { CopyLink } from "@/components/CopyLink";
import { prettyName } from "@/lib/names";
import { getParams } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import type { Series } from "@/lib/types";
import { boxScope, scopeCsvHeader } from "@/lib/scope";
import { ScopePanel } from "@/components/ScopePanel";
import { ViewExports } from "@/components/ViewExports";
import { buildBrief } from "@/lib/brief";
import { UNC_LABEL, UNC_NOT_TOTAL, fmtUnc, uncFor, useUncertainty } from "@/lib/uncertainty";
import { getProof } from "@/lib/data";
import { mostUnusualMonth } from "@/lib/unusual";
import { InfoDot } from "@/components/ui";
import { CriticalPeriods } from "@/components/CriticalPeriods";
import { FireReport } from "@/components/FireReport";
import { findingLines } from "@/lib/findings";

const AoiMap = dynamic(() => import("@/components/AoiMap").then((m) => m.AoiMap), { ssr: false });

/** One-click areas of interest (west, south, east, north). */
const PRESETS: Array<[string, Bbox]> = [
  ["Amazon basin", [-66, -12, -52, -2]],
  ["Sierra Nevada, California", [-122, 36, -118, 40.5]],
  ["Pantanal", [-59, -21, -55, -16]],
  ["Central Africa savanna", [15, -12, 30, -4]],
];

const FIRST = 2003; // Aqua's first full year; the harmonized unit is Aqua-equivalent.

export function Explorer() {
  const [area, setArea] = useState<Area>({ kind: "country", name: "Canada" });
  const [mode, setMode] = useState<Series>("harmonized");
  const [from, setFrom] = useState(FIRST);
  const [to, setTo] = useState(2025);
  // R8: the range runs from a start month to an end month (inclusive), not only whole years.
  const [fromM, setFromM] = useState(1);
  const [toM, setToM] = useState(12);
  const [box, setBox] = useState(["", "", "", ""]);
  // Selected calendar month: kept across raw/harmonized and year changes.
  const [selCell, setSelCell] = useState<CellRef | null>(null);
  const lastCountry = useRef("Canada");
  // Typed-bounds validation: per-field messages plus one summary read out by screen readers.
  const [boxErr, setBoxErr] = useState<{ fields: Partial<Record<BoxField, string>>; message: string } | null>(null);
  const viewQuery = () => ({ ...areaToQuery(area), mode, from: from === FIRST ? null : from, to: to === 2025 ? null : to, fm: fromM === 1 ? null : fromM, tm: toM === 12 ? null : toM, sel: selCell ? `${selCell.year}-${selCell.month}` : null });
  useUrlState((q) => {
    const a = areaFromQuery(q);
    if (a?.ok) {
      setArea(a.area); setBoxErr(null);
      if (a.area.kind === "country") lastCountry.current = a.area.name; else if (a.fields) setBox(a.fields);
    } else if (a && !a.ok) { setBox(a.fields); setBoxErr({ fields: a.fieldErrors, message: a.message }); }
    else { setArea({ kind: "country", name: "Canada" }); }
    const sm = /^(\d{4})-(\d{1,2})$/.exec(q.get("sel") ?? "");
    setSelCell(sm && Number(sm[1]) >= FIRST && Number(sm[1]) <= 2025 && Number(sm[2]) >= 1 && Number(sm[2]) <= 12 ? { year: Number(sm[1]), month: Number(sm[2]) } : null);
    const m = q.get("mode");
    setMode(m === "raw" ? "raw" : "harmonized");
    const f = intParam(q, "from", FIRST, 2025) ?? FIRST, t = intParam(q, "to", FIRST, 2025) ?? 2025;
    const fm = intParam(q, "fm", 1, 12) ?? 1, tm = intParam(q, "tm", 1, 12) ?? 12;
    if (f * 12 + fm <= t * 12 + tm) { setFrom(f); setTo(t); setFromM(fm); setToM(tm); } else { setFrom(FIRST); setTo(2025); setFromM(1); setToM(12); }
  }, () => viewQuery(), [areaKey(area), mode, from, to, fromM, toM, selCell?.year, selCell?.month]);
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
    const loYm = lo * 12 + (from >= data.raw.years[0] ? fromM : 1) - 1, hiYm = hi * 12 + (to <= data.raw.years[1] ? toM : 12) - 1;
    const inRange = (r: { year: number; month: number }) => { const t = r.year * 12 + r.month - 1; return t >= loYm && t <= hiYm; };
    const raw = rangeAnnual(data.raw.rows, lo, hi, inRange);
    const harm = rangeAnnual(data.harmonized.rows, lo, hi, inRange);
    const max = Math.max(1, ...data.raw.rows.filter(inRange).map((r) => r.value ?? 0), ...data.harmonized.rows.filter(inRange).map((r) => r.value ?? 0));
    const fm = MONTHS[(loYm % 12)], tm = MONTHS[hiYm % 12];
    return {
      lo, hi, raw, harm, max, inRange, loYm, hiYm,
      label: `${fm} ${lo} – ${tm} ${hi}`, partial: loYm % 12 !== 0 || hiYm % 12 !== 11,
      stepRaw: stepRatio(annualTotals(data.raw, 2009, 2014)),
      stepHarm: stepRatio(annualTotals(data.harmonized, 2009, 2014)),
    };
  }, [data, from, to, fromM, toM]);

  const selectBox = (drawn: Bbox) => {
    const bbox = normalizeDrawnBbox(drawn);
    setBoxErr(null);
    setBox(bbox.map((v) => v.toFixed(2)));
    setArea(makeArea({ kind: "box", bbox }));
  };
  const selectPolygon = (drawn: Ring) => {
    const check = validateRing(drawn);
    if (!check.ok) { setBoxErr({ fields: {}, message: check.message }); return; }
    setBoxErr(null);
    const bb = geomBbox({ kind: "polygon", ring: check.ring });
    setBox(bb.map((v) => v.toFixed(2)));
    setArea(makeArea({ kind: "polygon", ring: check.ring }));
  };
  // Invalid or blank bounds never reach the query: the user's entry stays in
  // the fields, each bad field is marked, and the message is announced.
  const applyTyped = () => {
    const check = validateBoxInput(box);
    if (!check.ok) { setBoxErr({ fields: check.fieldErrors, message: check.message }); return; }
    setBoxErr(null);
    setArea(makeArea({ kind: "box", bbox: check.bbox }));
  };

  const cal = data ? (mode === "raw" ? data.raw : data.harmonized) : null;
  // No harmonized series, but a raw one: a country without a fit (reason in coverage_status.json), or a box of such cells.
  const rawOnly = !!(data && cal && cal.keys.length === 0 && cal.uncorrectedKeys.length > 0);
  const notProcessed = !!(data && cal && cal.keys.length === 0 && !rawOnly);
  const fit = data && area.kind === "country" ? data.params.countries[area.name] : undefined;
  const unfitted = !!(data && area.kind === "country" && !fit);
  const flags = fit ? fitFlags(fit) : [];
  const boxCells = area.kind !== "country" ? area.cells.length : 0;
  const cov = area.kind === "country" ? coverage?.countries[area.name] : undefined;
  const covLabel = cov && unfitted ? STATUS_LABEL[cov.status] : null;
  const unc = useUncertainty();
  const proof = useParquet(() => getProof(), "proof");
  // Held-out (2019–2021) error of the country whose fit this view uses: the country itself, or the fitted country with most detections in a drawn area.
  const errCountry = area.kind === "country" ? (fit ? area.name : null) : data?.cells?.countries.find((c) => c.fitted)?.country ?? null;
  const errRow = errCountry && proof.data?.fit_version === data?.params.fit_version ? proof.data?.limits.per_country[errCountry] : undefined;
  const errPooled = errCountry ? data?.params.countries[errCountry]?.fit_source === "pooled" : false;
  const unusual = useMemo(() => (mode === "harmonized" && cal && cal.keys.length ? mostUnusualMonth(cal.rows, [FIRST, 2025]) : null), [mode, cal]);
  const harmUnusual = useMemo(() => (data && data.harmonized.keys.length ? mostUnusualMonth(data.harmonized.rows, [FIRST, 2025]) : null), [data]);
  const reportCell = selCell ?? (harmUnusual ? { year: harmUnusual.year, month: harmUnusual.month } : null);
  const ex = proof.data?.worked_example;
  // The worked example keeps its name instead of showing as bare coordinates.
  const sameBox = (bb: Bbox) => area.kind === "box" && area.bbox.every((v, i) => Math.abs(v - bb[i]) < 1e-6);
  const place = ex && sameBox(ex.bbox) ? "New South Wales, Australia (example box)" : PRESETS.find(([, bb]) => sameBox(bb))?.[0].concat(" (box)") ?? areaLabel(area);
  const openExample = () => {
    if (!ex) return;
    const [w, so, e, n] = ex.bbox;
    setBox([w, so, e, n].map((v) => v.toFixed(2)));
    setBoxErr(null);
    setArea(makeArea({ kind: "box", bbox: ex.bbox }));
    setMode("harmonized");
    setSelCell({ year: ex.unusual.year, month: ex.unusual.month });
  };
  const openPreset = (bbox: Bbox) => { setBox(bbox.map((v) => v.toFixed(2))); setBoxErr(null); setArea(makeArea({ kind: "box", bbox })); setMode("harmonized"); setSelCell(null); };
  const [cited, setCited] = useState(false);
  const copyCitation = () => {
    if (!data || !view) return;
    const text = `Emberline (2026). Harmonized MODIS–VIIRS burning activity calendar, fit ${data.params.fit_version}. Area: ${place}. Period: ${view.label}. Series: ${mode === "raw" ? "raw (uncorrected)" : "harmonized, Aqua-MODIS-equivalent detections"}. Source data: NASA FIRMS, MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi-NPP). ${reproducingUrl(viewQuery())}`;
    navigator.clipboard?.writeText(text).then(() => { setCited(true); setTimeout(() => setCited(false), 2000); }, () => {});
  };
  const busiestYear = view ? [...(mode === "raw" ? view.raw : view.harm)].filter((r) => r.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]?.year ?? null : null;
  // E27: coefficient-only intervals for harmonized country totals (busiest year, selected year/month).
  const uncRows = mode === "harmonized" && area.kind === "country" && data && busiestYear != null ? [
    { label: `Busiest year ${busiestYear}`, u: uncFor(unc.data, data.params.fit_version, area.name, busiestYear) },
    ...(selCell ? [
      { label: `Selected year ${selCell.year}`, u: uncFor(unc.data, data.params.fit_version, area.name, selCell.year) },
      { label: `Selected month ${MONTHS[selCell.month - 1]} ${selCell.year}`, u: uncFor(unc.data, data.params.fit_version, area.name, selCell.year, selCell.month) },
    ] : []),
  ] : null;
  const scope = useMemo(() => (area.kind !== "country" && data && cal ? boxScope(area.kind === "box" ? area : { ...area, bbox: undefined }, data.cells, data.raw, cal) : null), [area, data, cal]);

  const mtdArea = useMemo(() => (area.kind !== "country" && data?.cells ? { label: areaLabel(area), cells: area.cells, rows: data.cells.rows } : null), [area, data]);

  const exportCsv = () => {
    if (!data || !cal || !view) return;
    downloadCsv(
      `emberline_calendar_${areaLabel(area).replace(/[^a-z0-9]+/gi, "_")}_${mode}_${ymTag(view.loYm)}_${ymTag(view.hiYm)}.csv`,
      {
        product: `Emberline burning activity calendar: monthly ${mode === "raw" ? "RAW (uncorrected)" : "HARMONIZED"} detection counts summed over the area (aggregated, not individual hotspots)`,
        area: areaLabel(area),
        date_range: `${ymTag(view.loYm)} to ${ymTag(view.hiYm)} (inclusive, whole months)`,
        series: mode,
        unit: cal.unit,
        fit_version: mode === "harmonized" ? data.params.fit_version : "n/a (raw record, uncorrected)",
        ...(fit ? { ...qualityCsvHeader(fit, data.params), ...(mode === "raw" ? { fit_quality_note: "applies to the harmonized series; this file is the raw record" } : {}) } : {}),
        ...(unfitted && cov ? { fit_status: `no fit: ${STATUS_LABEL[cov.status]}` } : {}),
        ...(mode === "harmonized" && flags.length ? { fit_flags: `suspicious (docs/results.md): ${flags.join("; ")}` } : {}),
        ...(area.kind !== "country" ? { h3_res4_cells: `${cal.keys.length} with data of ${boxCells} selected` } : {}),
        ...(scope ? scopeCsvHeader(scope) : {}),
        ...(mode === "harmonized" && cal.uncorrectedKeys.length ? { excluded_uncorrected: `${cal.uncorrectedKeys.length} cells with a raw record but no fit are not included` } : {}),
        source: "NASA FIRMS: MODIS C6.1 (Terra, Aqua) and VIIRS 375 m (Suomi-NPP); daytime, vegetation fires, nominal+ confidence",
        downloaded: new Date().toISOString(),
        ...(uncRows ? {
          coefficient_interval_95: uncRows.map((r) => `${r.label}: ${fmtUnc(r.u)}`).join("; "),
          coefficient_interval_label: `${UNC_LABEL} ${UNC_NOT_TOTAL} 2.5th-97.5th percentile over bootstrap draws; source harmonized_uncertainty.json`,
        } : {}),
        reproduce: reproducingUrl(viewQuery()),
      },
      ["year", "month", "detections", "basis"],
      cal.rows.filter(view.inRange).map((r) => [r.year, r.month, r.value == null ? "" : Math.round(r.value * 100) / 100, r.basis]),
    );
  };

  // E09: deterministic, self-contained HTML brief built from the values on screen.
  const exportBrief = () => {
    if (!data || !cal || !view) return;
    const html = buildBrief({
      place: place, areaKind: area.kind, from: view.lo, to: view.hi, mode, unit: cal.unit,
      rows: cal.rows.filter((r) => r.year >= view.lo && r.year <= view.hi).map((r) => (view.inRange(r) ? r : { ...r, value: null })), max: view.max,
      annual: mode === "raw" ? view.raw : view.harm, params: data.params, fit,
      noFitReason: unfitted ? covLabel : null, unc: uncRows, scope,
      dataset: ds?.dataset === "world" ? "world files (calendar_*_global.parquet, params_global.json)" : "four-country fallback (calendar_raw.parquet, calendar_harmonized.parquet, params.json)",
      url: reproducingUrl(viewQuery()), generated: new Date().toISOString(),
      findings: data.harmonized.keys.length ? findingLines({ harm: data.harmonized.rows, raw: data.raw.rows, cell: reportCell, from: view.lo, to: view.hi, err: errRow?.[0] != null && errRow[1] != null ? [errRow[0], errRow[1]] : null }) : [],
    });
    const href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = `emberline_brief_${areaLabel(area).replace(/[^a-z0-9]+/gi, "_")}_${mode}_${ymTag(view.loYm)}_${ymTag(view.hiYm)}.html`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const years = data ? Array.from({ length: data.raw.years[1] - FIRST + 1 }, (_, i) => FIRST + i) : [];

  return (
    <div>
      <PageHead compact eyebrow="Explore · calendar" info="calendar" title="How much burned here," italic="month by month?"
        lede="A burning activity calendar for your area of interest. Pick an area and a date range to see its critical periods, the years with the highest burning activity and how this month compares with the historical median. A detection is one active-fire hotspot seen by a satellite. Harmonized record 2003–2025; 2026 so far as provisional raw counts." />
      <Coverage />

      <Reveal><section id="explorer" className="window scroll-mt-24">
        <div className="p-4 sm:p-7">
        {/* One toolbar: area (country or drawn box) · years · series · download. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3" role="toolbar" aria-label="Calendar controls">
          <div className="glass-thin flex p-1" role="group" aria-label="Area type">
            {(["country", "box"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={k === "country" ? area.kind === "country" : area.kind !== "country"}
                onClick={() => {
                  if (k === "country") { if (area.kind !== "country") setArea({ kind: "country", name: lastCountry.current }); }
                  else { document.getElementById("area")?.scrollIntoView({ behavior: "smooth", block: "center" }); document.getElementById("box-west")?.focus({ preventScroll: true }); }
                }}
                className={`min-h-[36px] rounded-full px-3.5 text-sm font-medium transition-colors ${(k === "country") === (area.kind === "country") ? "bg-[var(--ink)] text-[var(--on-ink)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {k === "country" ? "Country" : "Draw area"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Area">
            <CountryPicker value={area.kind === "country" ? area.name : ""} display={area.kind !== "country" ? "Custom area" : undefined} options={data?.countries ?? ["Canada"]} tags={data?.tags} onChange={(c) => { lastCountry.current = c; setArea({ kind: "country", name: c }); }} />
            {fit?.fit_source === "pooled" && <span title="Too few training matches for its own curve: this country uses the pooled curve of the own-fit countries" className="self-center rounded-full bg-[var(--ember-soft)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--ember)]">pooled fit</span>}
            {fit && fit.fit_source !== "pooled" && flags.length === 0 && <span className="self-center rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">own fit · R² {fmtR2(fit.validation_test.model.r2)}</span>}
            {flags.length > 0 && <span title={`Flagged as suspicious (docs/results.md): ${flags.join("; ")}`} className="self-center rounded-full border border-[var(--ember)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--ember)]">check this fit</span>}
            {unfitted && <span title={covLabel ? `No fit: ${covLabel}` : undefined} className="self-center rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">raw only · uncorrected{covLabel && ` · ${covLabel}`}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]" role="group" aria-label="Date range">
            <label className="flex items-center gap-1"><span className="sr-only">From month</span>
              <select data-testid="from-month" value={fromM} onChange={(e) => { const m = Number(e.target.value); if (from * 12 + m <= to * 12 + toM) setFromM(m); }} className="field min-h-[36px] rounded-xl px-2 py-1 text-[var(--text-primary)]">
                {MONTHS.map((mm, i) => <option key={mm} value={i + 1}>{mm}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1"><span className="sr-only">From year</span>
              <select data-testid="from-year" value={from} onChange={(e) => { const y = Number(e.target.value); if (y * 12 + fromM <= to * 12 + toM) setFrom(y); else { setFrom(y); setTo(y); setToM(Math.max(fromM, toM)); } }} className="field min-h-[36px] rounded-xl px-2 py-1 text-[var(--text-primary)]">
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
            <span aria-hidden>–</span>
            <label className="flex items-center gap-1"><span className="sr-only">To month</span>
              <select data-testid="to-month" value={toM} onChange={(e) => { const m = Number(e.target.value); if (from * 12 + fromM <= to * 12 + m) setToM(m); }} className="field min-h-[36px] rounded-xl px-2 py-1 text-[var(--text-primary)]">
                {MONTHS.map((mm, i) => <option key={mm} value={i + 1}>{mm}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1"><span className="sr-only">To year</span>
              <select data-testid="to-year" value={to} onChange={(e) => { const y = Number(e.target.value); if (from * 12 + fromM <= y * 12 + toM) setTo(y); else { setTo(y); setFrom(y); setFromM(Math.min(fromM, toM)); } }} className="field min-h-[36px] rounded-xl px-2 py-1 text-[var(--text-primary)]">
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
          </div>
          <div className="glass-thin flex p-1" role="group" aria-label="Series">
            {(["harmonized", "raw"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                className={`min-h-[36px] rounded-full px-4 text-sm font-medium transition-colors ${mode === m ? "bg-[var(--ink)] text-[var(--on-ink)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {m === "raw" ? "Raw (as recorded)" : "Harmonized (corrected)"}
              </button>
            ))}
          </div>
          <Link href={`/report?${new URLSearchParams(Object.entries(areaToQuery(area)).filter(([, v]) => v) as Array<[string, string]>).toString()}${selCell ? `&y=${selCell.year}&m=${selCell.month}` : ""}`} className="glass-thin ml-auto inline-flex min-h-[36px] items-center px-3.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Get a report</Link>
          <CopyLink />
          <button type="button" onClick={exportCsv} disabled={!view || notProcessed || rawOnly} className="pill-dark min-h-[40px] px-4 text-sm font-medium disabled:opacity-40">
            Calendar CSV
          </button>
          <button type="button" data-testid="copy-citation" onClick={copyCitation} disabled={!view} className="glass-thin min-h-[40px] px-4 text-sm font-medium disabled:opacity-40" aria-live="polite">
            {cited ? "Citation copied" : "Copy citation"}
          </button>
          <button type="button" onClick={exportBrief} disabled={!view || notProcessed || rawOnly} className="pill-dark min-h-[40px] px-4 text-sm font-medium disabled:opacity-40">
            Download brief
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3" data-testid="how-to">
          {[
            ["1", "Pick your area", "A country above, a quick area below, or draw your own on the map."],
            ["2", "Read the verdict", "The fire report says how unusual a month was. Click any month in the calendar to change it."],
            ["3", "Take it with you", "Download the brief, the calendar or the hotspots, or copy a link to this exact view."],
          ].map(([n, t, d]) => (
            <div key={n} className="flex gap-3 rounded-2xl bg-[var(--surface-alt)] p-3.5">
              <span className="dot-num text-2xl leading-none text-[var(--red)]">{n}</span>
              <p className="text-[13px] leading-snug text-[var(--text-secondary)]"><span className="block font-medium text-[var(--text-primary)]">{t}</span>{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          Quick areas:{" "}
          {ex && <><button type="button" data-testid="nsw-example" onClick={openExample} className="link-ul font-medium text-[var(--text-primary)]">New South Wales, {MONTHS[ex.unusual.month - 1]} {ex.unusual.year} (worked example)</button> · </>}
          {PRESETS.map(([name, bb], i) => (
            <span key={name}>{i > 0 && " · "}<button type="button" data-testid={`preset-${i}`} onClick={() => openPreset(bb)} className="link-ul text-[var(--text-primary)]">{name}</button></span>
          ))}
        </p>
        <nav aria-label="On this page" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <span>Jump to</span>
          {[["#report", "Verdict"], ["#calendar", "Calendar"], ["#critical", "Critical periods"], ["#this-month", "This month vs median"], ["#hotspots", "Hotspot CSV"], ["#area", "Draw an area"]].map(([h, t]) => (
            <a key={h} href={h} className="link-ul text-[var(--text-primary)]">{t}</a>
          ))}
        </nav>
        {data && reportCell && data.harmonized.keys.length > 0 && !notProcessed && (
          <div id="report" className="scroll-mt-24"><FireReport place={place} year={reportCell.year} month={reportCell.month} harm={data.harmonized.rows} raw={data.raw.rows}
            err={errRow?.[0] != null && errRow[1] != null ? [errRow[0], errRow[1]] : null} errCountry={errCountry} pooled={!!errPooled} fitVersion={data.params.fit_version} picked={!!selCell} /></div>
        )}
        {error && <div className="mt-8"><Failed error={error} retry={retry} what="the calendars for this area" /></div>}
        <CoverageError state={coverageState} className="mt-4" />
        {unfitted && area.kind === "country" && <CoverageNote country={area.name} coverage={coverage} className="mt-6" />}
        {loading && <div className="mt-8 h-[420px] dot-skel" />}
        {notProcessed && data && (
          <div className="mt-8 rounded-2xl border border-[var(--hairline)] p-6 text-sm leading-relaxed text-[var(--text-secondary)]">
            {ds?.dataset === "world" ? (
              <>
                <p className="text-[var(--text-primary)]">No processed data in this area.</p>
                <p className="mt-1">
                  {area.kind !== "country"
                    ? <>None of the {boxCells} grid cells (~45 km) whose centre is in this area has a detection in the processed FIRMS record (every FIRMS country, {data.countries.length} with detections). Open ocean, ice and deserts often have none.</>
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
        {data && cal && !notProcessed && !rawOnly && (cal.unknownKeys.length > 0 || cal.uncorrectedKeys.length > 0) && area.kind !== "country" && (
          <p className="mt-6 rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            This area selects {boxCells} grid cells; {cal.keys.length} {cal.keys.length === 1 ? "has" : "have"} {mode === "raw" ? "a raw record" : "a harmonized record"} and {cal.keys.length === 1 ? "is" : "are"} summed here.
            {cal.unknownKeys.length > 0 && <> {cal.unknownKeys.length} {cal.unknownKeys.length === 1 ? "has" : "have"} no processed data (no detections).</>}
            {cal.uncorrectedKeys.length > 0 && <> {cal.uncorrectedKeys.length} {cal.uncorrectedKeys.length === 1 ? "has" : "have"} only a raw, uncorrected record (in a country without a fit, or with none of the Aqua/VIIRS detections the fit uses) and {cal.uncorrectedKeys.length === 1 ? "is" : "are"} left out of the harmonized series.</>}
          </p>
        )}

        {scope && <ScopePanel scope={scope} mode={mode} />}
        {data && cal && view && !notProcessed && !rawOnly && (
          <div className="fade-in">
            <div id="calendar" className="mt-6 scroll-mt-24">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <Eyebrow>Burning activity calendar · {place} · detections per month</Eyebrow>
                <p className={`rounded-full px-3 py-1 text-xs font-medium ${mode === "raw" ? "bg-[var(--surface-2)] text-[var(--text-primary)]" : "bg-[var(--ember-soft)] text-[var(--text-primary)]"}`}>
                  {mode === "raw" ? "Raw: hotspots as each satellite recorded them, not corrected · MODIS to 2011, VIIRS from 2012" : `Harmonized: corrected to one scale across the 2012 satellite change · ${cal.unit} · fit ${data.params.fit_version}`}
                  <span className="text-[var(--text-muted)]"> · {view.label}</span>
                </p>
              </div>
              <MonthYearCalendar cal={cal} from={view.lo} to={view.hi} max={view.max} selected={selCell} onSelect={setSelCell} areaName={areaLabel(area)} inRange={view.partial ? view.inRange : undefined} />
              {(() => {
                const rows = cal.rows.filter((r) => view.inRange(r) && r.value !== null);
                if (!rows.length) return null;
                const peak = rows.reduce((a, b) => ((b.value ?? 0) > (a.value ?? 0) ? b : a));
                const best = [...(mode === "raw" ? view.raw : view.harm)].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
                const partialYear = view.partial && (best.year === view.lo || best.year === view.hi);
                return (
                  <p className="mt-4 text-sm text-[var(--text-secondary)]">
                    Busiest month: <span className="text-[var(--text-primary)]">{MONTHS[peak.month - 1]} {peak.year}</span> ({fmt(peak.value)}).
                    Busiest year: <span className="text-[var(--text-primary)]">{best.year}</span> ({fmt(best.value)}{partialYear ? ", months inside the range only" : ""}).
                    {" "}Total {view.label}: <span className="text-[var(--text-primary)]">{fmt(rows.reduce((a, r) => a + (r.value ?? 0), 0))}</span>.
                  </p>
                );
              })()}
              <div id="critical" className="scroll-mt-24"><CriticalPeriods rows={cal.rows} from={view.lo} to={view.hi} place={place} mode={mode} /></div>
              {mode === "harmonized" && (unusual || errCountry) && (
                <div data-testid="heldout-context" className="mt-3 rounded-xl border border-[var(--hairline)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {unusual && (
                    <p data-testid="unusual-month">
                      <span className="font-medium text-[var(--text-primary)]">Most unusual month, {FIRST}–2025:</span>{" "}
                      <span className="tabular text-[var(--text-primary)]">{MONTHS[unusual.month - 1]} {unusual.year}</span>, {fmt(unusual.value)} harmonized detections,
                      {" "}rank {unusual.rank} of {unusual.nYears} years for that month. The other {unusual.nRef} {MONTHS[unusual.month - 1]}s, same area and series: median <span className="tabular">{fmt(unusual.median)}</span>, range <span className="tabular">{fmt(unusual.min)}–{fmt(unusual.max)}</span>.
                      {" "}Historical context, not a forecast. <InfoDot k="unusualMonth" align="start" />
                    </p>
                  )}
                  {errCountry && (
                    <p data-testid="typical-error" className={unusual ? "mt-1" : ""}>
                      <span className="font-medium text-[var(--text-primary)]">Typical error on years the model never saw: {errRow?.[0] != null ? `±${fmtNum(errRow[0], 0)}%` : "not recorded"}</span>
                      {errRow?.[0] != null && <> (median monthly miss, 2019–2021; not a confidence interval). 1 month in 5 missed by more than ±{fmtNum(errRow[1], 0)}%</>}. Held-out error of {prettyName(errCountry)}&apos;s harmonized monthly total against what Aqua recorded{area.kind !== "country" && ", the fitted country with most detections in this area; not computed for the drawn area itself"}.
                      {errPooled && <span className="text-[var(--ember)]"> Pooled fit: less reliable than an own fit.</span>}
                      {errRow && errRow[2] === 0 && " Few fires here, so errors are larger."}
                      {" "}<InfoDot k="typicalError" align="start" />
                    </p>
                  )}
                </div>
              )}
              {uncRows && (
                <div data-testid="unc-note" className="mt-3 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  <p className="font-medium text-[var(--text-primary)]">Range from re-fitting the model (95% coefficient interval), harmonized country total</p>
                  <ul className="tabular mt-1">
                    {uncRows.map((r) => <li key={r.label}>{r.label}: <span className="text-[var(--text-primary)]">{fmtUnc(r.u)}</span></li>)}
                  </ul>
                  <p className="mt-1">{UNC_LABEL} {UNC_NOT_TOTAL}{!selCell && " Select a month in the calendar to see its year and month."}</p>
                </div>
              )}
            </div>
            <div className="mt-8 grid gap-6 border-t border-[var(--hairline)] pt-6 lg:grid-cols-[1fr_17rem]">
              <div>
                <Eyebrow>Detections per year · {areaLabel(area)}</Eyebrow>
                <AnnualLine raw={view.raw} harmonized={view.harm} mode={mode} />
                <ViewExports v={{
                  name: areaLabel(area).replace(/[^a-z0-9]+/gi, "_"), place: areaLabel(area), mode, unit: cal.unit, fitVersion: data.params.fit_version,
                  range: view, rows: cal.rows, max: view.max, raw: view.raw, harm: view.harm, step: { raw: view.stepRaw, harmonized: view.stepHarm },
                  extra: {
                    ...(scope ? scopeCsvHeader(scope) : {}),
                    ...(data.cells && data.cells.uncorrected.detections ? { uncorrected_raw_detections_left_out_of_harmonized: String(data.cells.uncorrected.detections), uncorrected_countries: data.cells.uncorrected.countries.join("; ") } : {}),
                    ...(unfitted ? { fit_status: `no fit${covLabel ? `: ${covLabel}` : ""}; raw only, uncorrected` } : {}),
                    source: "NASA FIRMS: MODIS C6.1 (Terra, Aqua) and VIIRS 375 m (Suomi-NPP); daytime, vegetation fires, nominal+ confidence",
                    reproduce: reproducingUrl(viewQuery()),
                  },
                  cells: data.cells ? { rows: data.cells.rows, resolution: data.cells.index.resolution } : null,
                }} />
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
                    <Eyebrow>How well the correction tracks Aqua here</Eyebrow>
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
        <MonthToDateCard country={area.kind === "country" ? area.name : undefined} area={mtdArea} range={[view?.lo ?? from, view?.hi ?? to]} />
        <div id="hotspots" className="scroll-mt-24"><HotspotDownload area={area.kind === "country" ? { kind: "country", name: area.name } : { kind: "geom", geom: geomOf(area) }} /></div>
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
          {showMap ? <AoiMap bbox={area.kind === "box" ? area.bbox : null} ring={area.kind === "polygon" ? area.ring : null} cells={area.kind !== "country" ? data?.raw.keys : undefined} onSelect={selectBox} onPolygon={selectPolygon} className="h-[340px]" />
            : <div className="h-[340px] rounded-2xl border border-[var(--hairline)] bg-[var(--surface-2)]" role="status" aria-label="Map loading" />}
        </div>
        <div className="card p-5">
          <Eyebrow>Choose your own area</Eyebrow>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            On the map, press <span className="text-[var(--text-primary)]">Draw box</span> and drag, or <span className="text-[var(--text-primary)]">Draw polygon</span> and click the corners (double-click or Enter to finish). Or type bounds in degrees.
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
            {area.kind !== "country" && data && (() => { const ex = cellsExtent(data.raw.keys); const bb = area.kind === "box" ? area.bbox : geomBbox(geomOf(area)); return (
              <span className="mb-2 block rounded-lg bg-[var(--surface-2)] p-2 text-[var(--text-secondary)]">
                <span className="block">{area.kind === "polygon" ? `Polygon, ${area.ring.length} corners, bounds` : "Requested"}: {bb.map((v) => v.toFixed(2)).join(", ")} (W, S, E, N){area.kind === "box" && bboxCrossesAntimeridian(area.bbox) && " — crosses the 180° meridian"}</span>
                <span className="block">Effective coverage: {data.raw.keys.length} of {area.cells.length} selected cells have data{ex ? <>, spanning {ex.map((v) => v.toFixed(1)).join(", ")}</> : ""} — dashed blue on the map.</span>
              </span>); })()}
            Areas resolve to the ~45 km grid cells (H3 resolution 4, ~1,770 km²) whose centre lies inside them, anywhere in the processed FIRMS record; an area smaller than one cell uses the cell under its centre. Only the files holding those cells are downloaded (a few hundred KB each), never individual detections. Border cells keep each country&apos;s own fit; cells of countries without a fit stay raw and are left out of the harmonized series.
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
      Corrected for <span className="tabular text-[var(--text-primary)]">{fits.length}</span> countries: <span className="tabular text-[var(--text-primary)]">{fits.length - pooled}</span> with their own fit,{" "}
      <span className="tabular text-[var(--text-primary)]">{pooled}</span> borrowing a shared (pooled) one.{" "}
      <span className="tabular text-[var(--text-primary)]">{failed}</span> have no fit and are shown raw only, uncorrected. Reasons under Provenance.
      {ds?.dataset === "four" && " The world files could not be loaded: showing the four-country fallback."}
    </p>
  );
}

const ymTag = (t: number) => `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;

/** Yearly totals over the months inside the range; a year with no known month is null. */
function rangeAnnual(rows: Array<{ year: number; month: number; value: number | null }>, lo: number, hi: number,
  inRange: (r: { year: number; month: number }) => boolean): YearTotal[] {
  const out: YearTotal[] = [];
  for (let y = lo; y <= hi; y += 1) {
    const ys = rows.filter((r) => r.year === y && inRange(r) && r.value !== null);
    out.push({ year: y, value: ys.length ? ys.reduce((a, r) => a + (r.value ?? 0), 0) : null });
  }
  return out;
}
