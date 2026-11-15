"use client";

/**
 * R12: download what is on screen. Calendar and annual chart as SVG or PNG,
 * the analytics as JSON, and for drawn areas the cell-level aggregate CSV for
 * the chosen months. Every value comes from the view the user is looking at.
 */
import { useState } from "react";
import { annualSvg, calendarSvg, downloadBlob, downloadPng, downloadSvg } from "@/lib/exportViz";
import { MONTHS, downloadCsv, type YearTotal } from "@/lib/ember";
import { cellToLatLng } from "h3-js";
import type { AreaRow, CalendarRow } from "@/lib/types";

export interface ViewExportInput {
  name: string;            // file-name stem
  place: string;
  mode: "raw" | "harmonized";
  unit: string;
  fitVersion: string;
  range: { lo: number; hi: number; loYm: number; hiYm: number; label: string; inRange: (r: { year: number; month: number }) => boolean };
  rows: CalendarRow[];     // the shown series, every month of the shown years
  max: number;
  raw: YearTotal[];
  harm: YearTotal[];
  step: { raw: number | null; harmonized: number | null };
  extra: Record<string, unknown>; // provenance: scope, fit status, reproduce link...
  cells?: { rows: AreaRow[]; resolution: number } | null;
}

const ymTag = (t: number) => `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;

export function ViewExports({ v }: { v: ViewExportInput }) {
  const [msg, setMsg] = useState<string | null>(null);
  const tag = `${v.name}_${v.mode}_${ymTag(v.range.loYm)}_${ymTag(v.range.hiYm)}`;
  const shown = v.rows.filter((r) => r.year >= v.range.lo && r.year <= v.range.hi).map((r) => (v.range.inRange(r) ? r : { ...r, value: null }));
  const cal = () => calendarSvg({ place: `${v.place} · ${v.mode === "raw" ? "raw, uncorrected" : "harmonized"} · ${v.range.label}`, from: v.range.lo, to: v.range.hi, rows: shown, max: v.max });
  const chart = () => annualSvg({ title: `${v.place} · detections per year · ${v.range.label}`, raw: v.raw, harm: v.harm, mode: v.mode, note: v.mode === "harmonized" ? `fit ${v.fitVersion}` : "" });
  const inR = v.rows.filter(v.range.inRange).filter((r) => r.value != null);
  const peak = inR.length ? inR.reduce((a, b) => ((b.value ?? 0) > (a.value ?? 0) ? b : a)) : null;
  const series = v.mode === "raw" ? v.raw : v.harm;
  const best = [...series].filter((t) => t.value != null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] ?? null;
  const png = (n: string, svg: string) => downloadPng(n, svg).catch((e: Error) => setMsg(`PNG failed: ${e.message}. The SVG works in every browser.`));

  const json = () => downloadBlob(`emberline_analytics_${tag}.json`, new Blob([JSON.stringify({
    product: "Emberline analytics for the current view",
    area: v.place, series: v.mode, unit: v.unit, date_range: { start: ymTag(v.range.loYm), end: ymTag(v.range.hiYm), inclusive: true },
    fit_version: v.mode === "harmonized" ? v.fitVersion : null,
    busiest_month: peak ? { year: peak.year, month: peak.month, value: peak.value } : null,
    busiest_year: best ? { year: best.year, value: best.value, partial: v.range.loYm % 12 !== 0 || v.range.hiYm % 12 !== 11 } : null,
    total: inR.reduce((a, r) => a + (r.value ?? 0), 0),
    step_2012: { ...v.step, definition: "mean yearly count 2012-2014 / mean 2009-2011" },
    annual: { raw: v.raw, harmonized: v.harm },
    monthly: v.rows.filter(v.range.inRange).map((r) => ({ year: r.year, month: r.month, value: r.value, basis: r.basis })),
    ...v.extra,
    generated_utc: new Date().toISOString(),
  }, null, 1)], { type: "application/json" }));

  const cellCsv = () => {
    if (!v.cells) return;
    const rs = v.cells.rows.filter(v.range.inRange);
    downloadCsv(`emberline_cells_${v.name}_${ymTag(v.range.loYm)}_${ymTag(v.range.hiYm)}.csv`, {
      product: "Emberline cell-level AGGREGATES (not individual detections): monthly counts per H3 cell and FIRMS country file",
      area: v.place,
      date_range: `${ymTag(v.range.loYm)} to ${ymTag(v.range.hiYm)} (inclusive, whole months)`,
      h3_resolution: `${v.cells.resolution} (~1,770 km² cells); lat/lon are cell centres`,
      columns: "n_modis = RAW MODIS Terra+Aqua; n_aqua = RAW Aqua; n_viirs = RAW Suomi-NPP VIIRS; n_harmonized = HARMONIZED Aqua-equivalent (observed Aqua before 2012, predicted from VIIRS after); blank n_harmonized = country without a fit, UNCORRECTED",
      fit_version: v.fitVersion,
      ...Object.fromEntries(Object.entries(v.extra).filter(([, x]) => typeof x === "string")) as Record<string, string>,
    }, ["cell", "lat", "lon", "country", "year", "month", "n_modis", "n_aqua", "n_viirs", "n_harmonized"],
    rs.map((r) => { const [la, lo] = cellToLatLng(r.cell); return [r.cell, la.toFixed(4), lo.toFixed(4), r.country, r.year, r.month, r.n_modis, r.n_aqua, r.n_viirs, r.n_harm == null ? "" : Math.round(r.n_harm * 1000) / 1000]; }));
    setMsg(`Cell CSV: ${rs.length.toLocaleString("en")} cell-months.`);
  };

  const btn = "rounded-full border border-[var(--hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--text-primary)]";
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Download this view" data-testid="view-exports">
      <span className="text-xs text-[var(--text-muted)]">Download this view ({MONTHS[v.range.loYm % 12]} {v.range.lo} – {MONTHS[v.range.hiYm % 12]} {v.range.hi}):</span>
      <button type="button" className={btn} onClick={() => downloadSvg(`emberline_calendar_${tag}.svg`, cal())}>Calendar SVG</button>
      <button type="button" className={btn} onClick={() => png(`emberline_calendar_${tag}.png`, cal())}>Calendar PNG</button>
      <button type="button" className={btn} onClick={() => downloadSvg(`emberline_annual_${tag}.svg`, chart())}>Chart SVG</button>
      <button type="button" className={btn} onClick={() => png(`emberline_annual_${tag}.png`, chart())}>Chart PNG</button>
      <button type="button" className={btn} onClick={json}>Analytics JSON</button>
      {v.cells && <button type="button" className={btn} onClick={cellCsv}>Cell CSV (aggregated)</button>}
      {msg && <span className="text-xs text-[var(--text-secondary)]" role="status">{msg}</span>}
    </div>
  );
}
