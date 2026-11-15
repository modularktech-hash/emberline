import { MONTHS, fmt, rampBreaks, rampIndex, type YearTotal } from "@/lib/ember";
import { fitQuality, qualityCsvHeader } from "@/lib/quality";
import { fmtBounds, CELL_SIZE_NOTE, SELECTION_RULE, type BoxScope } from "@/lib/scope";
import { UNC_LABEL, UNC_NOT_TOTAL, fmtUnc, type UncResult } from "@/lib/uncertainty";
import type { CalendarRow, CountryFit, Params } from "@/lib/types";

/**
 * E09: a self-contained, deterministic HTML evidence brief, built client-side
 * from exactly the values the Explorer shows. No generated prose: every
 * sentence is a template filled with on-page numbers.
 */
export interface BriefInput {
  place: string;
  areaKind: "country" | "box" | "polygon";
  from: number;
  to: number;
  mode: "raw" | "harmonized";
  unit: string;
  rows: CalendarRow[]; // calendar rows within [from, to]
  max: number; // shared colour-scale maximum, as on the page
  annual: YearTotal[];
  params: Params;
  fit?: CountryFit;
  noFitReason?: string | null;
  unc?: Array<{ label: string; u: UncResult }> | null;
  scope?: BoxScope | null;
  dataset: string;
  url: string;
  generated: string; // ISO time
  /** Plain-language findings (lib/findings.ts), shown first. */
  findings?: string[];
}

/** Hex values of the light --seq-0..7 ramp in styles/tokens.css, copied because the brief must stand alone. */
const HEX = ["#e9e9e5", "#f6e3b8", "#f7c26a", "#f29a3e", "#e46a26", "#c63f1c", "#93221a", "#531114"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Busiest month and year exactly as Explorer computes them. */
export function busiest(rows: CalendarRow[], annual: YearTotal[]) {
  const known = rows.filter((r) => r.value !== null);
  const peak = known.length ? known.reduce((a, b) => ((b.value ?? 0) > (a.value ?? 0) ? b : a)) : null;
  const best = [...annual].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] ?? null;
  return { peak, best };
}

export function calendarSvg(b: Pick<BriefInput, "place" | "from" | "to" | "rows" | "max">): string {
  const years: number[] = [];
  for (let y = b.from; y <= b.to; y += 1) years.push(y);
  const cw = 34, ch = 16, left = 44, top = 20;
  const w = left + 12 * cw + 4, h = top + years.length * ch + 40;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="Detections per month, ${esc(b.place)}, ${b.from}–${b.to}">`, `<rect width="${w}" height="${h}" fill="#ffffff"/>`];
  out.push(`<defs><pattern id="nd" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#ffffff"/><line x1="0" y1="0" x2="0" y2="4" stroke="#bbb" stroke-width="1.5"/></pattern></defs>`);
  MONTHS.forEach((m, i) => out.push(`<text x="${left + i * cw + cw / 2}" y="${top - 6}" font-size="10" text-anchor="middle" fill="#555">${m}</text>`));
  years.forEach((y, j) => {
    out.push(`<text x="${left - 6}" y="${top + j * ch + ch - 4}" font-size="10" text-anchor="end" fill="#555">${y}</text>`);
    for (let m = 1; m <= 12; m += 1) {
      const r = b.rows.find((x) => x.year === y && x.month === m);
      const v = r ? r.value : null;
      const idx = rampIndex(v, b.max);
      const fill = idx == null ? "url(#nd)" : HEX[idx];
      out.push(`<rect x="${left + (m - 1) * cw + 1}" y="${top + j * ch + 1}" width="${cw - 2}" height="${ch - 2}" fill="${fill}"><title>${MONTHS[m - 1]} ${y}: ${v == null ? "no data" : fmt(v)}</title></rect>`);
    }
  });
  const ly = top + years.length * ch + 14;
  const br = rampBreaks(b.max);
  out.push(`<rect x="${left}" y="${ly}" width="12" height="10" fill="${HEX[0]}"/><text x="${left + 16}" y="${ly + 9}" font-size="9" fill="#555">0</text>`);
  br.forEach((v, i) => {
    const x = left + 40 + i * 50;
    out.push(`<rect x="${x}" y="${ly}" width="12" height="10" fill="${HEX[i + 1]}"/><text x="${x + 16}" y="${ly + 9}" font-size="9" fill="#555">≥${fmt(v)}</text>`);
  });
  out.push(`<rect x="${left}" y="${ly + 14}" width="12" height="10" fill="url(#nd)"/><text x="${left + 16}" y="${ly + 23}" font-size="9" fill="#555">no data (not the same as no fire) · square-root colour scale, shared by raw and harmonized</text>`);
  out.push("</svg>");
  return out.join("");
}

export function buildBrief(b: BriefInput): string {
  const { peak, best } = busiest(b.rows, b.annual);
  const basis = b.mode === "raw"
    ? "Raw record, uncorrected: MODIS counts to 2011, VIIRS counts from 2012 (keeps the 2012 sensor step)."
    : `Harmonized estimate (${esc(b.unit)}): observed Aqua MODIS before 2012, predicted from Suomi-NPP VIIRS with fit ${esc(b.params.fit_version)} from 2012. An estimate, not an observation.`;
  const kv = (rows: Array<[string, string]>) => `<table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("")}</table>`;

  let quality: string;
  if (b.fit) {
    const q = fitQuality(b.fit);
    const h = qualityCsvHeader(b.fit, b.params);
    quality = kv([["Fit quality", esc(h.fit_quality)], ["Fit origin", esc(h.fit_origin)], ["Held-out evaluation", esc(h.fit_evaluation)], ["Interpretation", esc(q.interpretation)]])
      + (b.mode === "raw" ? `<p class="note">These metrics describe the harmonized series; this brief shows the raw record.</p>` : "");
  } else if (b.areaKind === "country") {
    quality = `<p>No fit for this country${b.noFitReason ? ` (${esc(b.noFitReason)})` : ""}: only the raw, uncorrected record exists.</p>`;
  } else {
    quality = `<p>Custom area: the published calendars do not map grid cells to countries, so no single fit-quality label applies. Check the fit of each country involved in the Explorer.</p>`;
  }

  const unc = b.unc && b.unc.length
    ? `<ul>${b.unc.map((r) => `<li>${esc(r.label)}: ${esc(fmtUnc(r.u))}</li>`).join("")}</ul><p class="note">${esc(UNC_LABEL)} ${esc(UNC_NOT_TOTAL)} 2.5th–97.5th percentile over bootstrap draws (harmonized_uncertainty.json).</p>`
    : `<p>${b.mode === "raw" ? "Not applicable: raw record." : b.areaKind !== "country" ? "Not estimated for custom areas (intervals are published per country)." : "Not available."}</p>`;

  const s = b.scope;
  const coverage = s
    ? kv([
        [s.ring ? "Polygon bounding box (W, S, E, N)" : "Requested bounds (W, S, E, N)", esc(fmtBounds(s.requested)) + (s.antimeridian ? " — crosses the 180° meridian" : "")],
        ["Effective bounds of summed cells", s.effective ? esc(fmtBounds(s.effective, 2)) : "none"],
        ["Selection", esc(SELECTION_RULE)],
        ["Grid", `H3 resolution ${s.resolution} (${CELL_SIZE_NOTE})`],
        ["Cells", `${s.touched.length} touched · ${s.withRaw.length} with data · ${s.summed.length} summed`],
        ["Contributing country files", esc(s.countries.map((c) => `${c.country}${c.fitted ? "" : " (no fit, uncorrected)"}`).join(", ") || "none")],
      ]) + `<p class="warn">Whole cells are summed, so the result follows the cells, not the exact outline. Cell IDs are in the cell-level CSV.</p>`
    : `<p>Country total: every detection assigned to ${esc(b.place)} in the processed FIRMS record (dataset: ${esc(b.dataset)}).</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Emberline evidence brief · ${esc(b.place)} · ${b.from}–${b.to}</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d1a16;background:#fbf8f1;max-width:760px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
table{border-collapse:collapse;width:100%}th{text-align:left;font-weight:500;color:#555;padding:2px 10px 2px 0;vertical-align:top;width:34%}td{padding:2px 0;word-break:break-word}
.note{color:#555;font-size:12px}.warn{color:#a33a12;font-size:12px}svg{max-width:100%;height:auto}code{font-size:11px}
</style></head><body>
<h1>Evidence brief: ${esc(b.place)}</h1>
<p class="note">Emberline burning activity calendar · ${b.from}–${b.to} · generated ${esc(b.generated)}</p>
${b.findings && b.findings.length ? `<h2>Findings</h2><ul>${b.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
<h2>Basis</h2><p>${basis}</p>
<h2>Calendar: detections per month</h2>${calendarSvg(b)}
<h2>Summary</h2>${kv([
    ["Busiest month", peak ? `${MONTHS[peak.month - 1]} ${peak.year} (${fmt(peak.value)})` : "none"],
    ["Busiest year", best && best.value != null ? `${best.year} (${fmt(best.value)})` : "none"],
    ["Unusual months", "Not computed on this page. The Seasons page compares each month with its historical range."],
  ])}
<h2>Fit quality</h2>${quality}
<h2>Coefficient interval (95%)</h2>${unc}
<h2>Spatial coverage</h2>${coverage}
<h2>Limitations</h2><ul>
<li>Counts are satellite active-fire detections, not burned area or fire numbers. No data is not the same as no fire.</li>
<li>The raw record changes sensor in 2012 (MODIS to VIIRS); only the harmonized series corrects for that, and only where a fit exists.</li>
<li>The fit was trained on ${b.params.train_years[0]}–${b.params.train_years[1]} and tested on ${b.params.test_years[0]}–${b.params.test_years[1]} (frozen-orbit era). Terra and Aqua drifted from 2022, so 2022–2025 harmonized values extend the fit outside that era.</li>
<li>Regional use only: the sensor break may be undetectable above natural variation at global scale.</li>
</ul>
<h2>Sources and version</h2>${kv([
    ["Data", "NASA FIRMS archive: MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi-NPP); daytime vegetation-fire detections, nominal and high confidence. We acknowledge the use of data and imagery from LANCE FIRMS operated by NASA's Earth Science Data and Information System (ESDIS)."],
    ["Fit version", `${esc(b.params.fit_version)} · trained ${b.params.train_years[0]}–${b.params.train_years[1]}, tested ${b.params.test_years[0]}–${b.params.test_years[1]}`],
    ["Dataset", esc(b.dataset)],
    ["Generated", esc(b.generated)],
    ["Reproduce", `<a href="${esc(b.url)}">${esc(b.url)}</a>`],
  ])}
</body></html>
`;
}

/* ------------------------------------------------------------ fire intelligence report */
export interface BarPoint { label: string; raw: number | null; harm: number | null; boundaryBefore?: boolean; selected?: boolean }
export interface BarColors { raw: string; harm: string; text: string; grid: string; mark: string; bg: string }
export const REPORT_HEX: BarColors = { raw: "#3b6ea5", harm: "#d9431a", text: "#555555", grid: "#e2e2de", mark: "#1d1a16", bg: "#ffffff" };

/**
 * Raw and harmonized bars side by side on ONE y scale, with the 2012 sensor
 * boundary drawn before the first VIIRS-era point. Used by the report page
 * (with CSS-variable colours) and its HTML export (with REPORT_HEX).
 */
export function pairBarsSvg(points: BarPoint[], title: string, c: BarColors): string {
  const L = 52, R = 8, T = 14, B = 34, W = 640, H = 230;
  const max = Math.max(1, ...points.flatMap((p) => [p.raw ?? 0, p.harm ?? 0]));
  const bw = (W - L - R) / Math.max(1, points.length);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="${esc(title)}">`];
  out.push(`<rect width="${W}" height="${H}" fill="${c.bg}"/>`);
  [0, 0.5, 1].forEach((f) => {
    const v = max * f;
    out.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${c.grid}"/><text x="${L - 6}" y="${y(v) + 3.5}" font-size="10" text-anchor="end" fill="${c.text}">${fmt(v)}</text>`);
  });
  points.forEach((p, i) => {
    const x = L + i * bw;
    if (p.boundaryBefore) out.push(`<line x1="${x}" x2="${x}" y1="${T - 6}" y2="${H - B}" stroke="${c.mark}" stroke-dasharray="3 3"/><text x="${x + 4}" y="${T + 2}" font-size="9.5" fill="${c.text}">2012 · VIIRS begins</text>`);
    if (p.selected) out.push(`<rect x="${x + 0.5}" y="${T - 2}" width="${bw - 1}" height="${H - B - T + 2}" fill="none" stroke="${c.mark}" stroke-width="1.2"/>`);
    const w = Math.max(1, bw * 0.38);
    if (p.raw != null) out.push(`<rect x="${x + bw * 0.1}" y="${y(p.raw)}" width="${w}" height="${H - B - y(p.raw)}" fill="${c.raw}"><title>${esc(p.label)} raw: ${fmt(p.raw)}</title></rect>`);
    if (p.harm != null) out.push(`<rect x="${x + bw * 0.52}" y="${y(p.harm)}" width="${w}" height="${H - B - y(p.harm)}" fill="${c.harm}"><title>${esc(p.label)} harmonized: ${fmt(p.harm)}</title></rect>`);
    if (points.length <= 12 || i % 2 === 0 || p.selected) out.push(`<text x="${x + bw / 2}" y="${H - B + 13}" font-size="9.5" text-anchor="middle" fill="${p.selected ? c.mark : c.text}">${esc(p.label)}</text>`);
  });
  out.push(`<rect x="${L}" y="${H - 12}" width="10" height="8" fill="${c.raw}"/><text x="${L + 14}" y="${H - 5}" font-size="10" fill="${c.text}">raw (MODIS to 2011, VIIRS from 2012)</text>`);
  out.push(`<rect x="${L + 230}" y="${H - 12}" width="10" height="8" fill="${c.harm}"/><text x="${L + 244}" y="${H - 5}" font-size="10" fill="${c.text}">harmonized (Aqua-MODIS-equivalent) · one shared scale</text>`);
  out.push("</svg>");
  return out.join("");
}

export interface ReportInput {
  place: string;
  geometry: string; // exact area: country name, bounds or polygon vertices
  year: number; month: number;
  sentence: string;
  facts: Array<[string, string]>;
  trust: Array<[string, string]>;
  caveats: string[];
  monthChart: BarPoint[]; // the same calendar month across years
  yearChart: BarPoint[]; // the 12 months of the selected year
  params: Params;
  url: string;
  generated: string;
}

export function buildReport(r: ReportInput): string {
  const mo = MONTHS[r.month - 1];
  const kv = (rows: Array<[string, string]>) => `<table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Emberline fire report · ${esc(r.place)} · ${mo} ${r.year}</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d1a16;background:#fbf8f1;max-width:760px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
table{border-collapse:collapse;width:100%}th{text-align:left;font-weight:500;color:#555;padding:2px 10px 2px 0;vertical-align:top;width:38%}td{padding:2px 0;word-break:break-word}
.lead{font-size:16px}.note{color:#555;font-size:12px}svg{max-width:100%;height:auto}
</style></head><body>
<h1>Fire report: ${esc(r.place)}, ${mo} ${r.year}</h1>
<p class="note">Emberline · fit ${esc(r.params.fit_version)} · generated ${esc(r.generated)}</p>
<h2>Finding</h2><p class="lead">${esc(r.sentence)}</p>
<p class="note">Observed historical anomaly, not a forecast or burned-area estimate.</p>
${kv(r.facts)}
<h2>${mo} in every year, raw and harmonized</h2>${pairBarsSvg(r.monthChart, `${mo} detections per year, raw and harmonized`, REPORT_HEX)}
<h2>${r.year}, month by month</h2>${pairBarsSvg(r.yearChart, `${r.year} detections per month, raw and harmonized`, REPORT_HEX)}
<h2>How far to trust it</h2>${kv(r.trust)}
<h2>Caveats for this selection</h2><ul>${r.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
<h2>Method in brief</h2><p>Each Suomi-NPP VIIRS detection is weighted by the fitted chance that Aqua MODIS would also have detected it, given its fire radiative power, and scaled per country by κ, so the record from 2012 is in Aqua-MODIS-equivalent detections. Before 2012 the harmonized series is observed Aqua MODIS. Fitted on ${r.params.train_years[0]}–${r.params.train_years[1]}, tested on held-out ${r.params.test_years[0]}–${r.params.test_years[1]}.</p>
<h2>Limitations</h2><ul>
<li>Counts are satellite active-fire detections, not burned area or numbers of fires. No data is not the same as no fire.</li>
<li>From 2012 a harmonized count is an estimate of what Aqua MODIS would have recorded, not an actual MODIS observation.</li>
<li>Daytime vegetation fires only. Regional use only; no global correction is claimed.</li>
<li>Terra and Aqua drifted from 2022; 2022–2025 harmonized values extend the frozen-orbit fit outside its era.</li>
</ul>
<h2>Area, dates and sources</h2>${kv([
    ["Area", r.geometry],
    ["Month", `${mo} ${r.year}; reference: the same calendar month in the other years of the harmonized record`],
    ["Model version", `${r.params.fit_version} · trained ${r.params.train_years[0]}–${r.params.train_years[1]}, tested ${r.params.test_years[0]}–${r.params.test_years[1]}`],
    ["Data", "NASA FIRMS archive: MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi-NPP). We acknowledge the use of data and imagery from LANCE FIRMS operated by NASA's Earth Science Data and Information System (ESDIS)."],
    ["Citations", "Giglio, L., Schroeder, W., Justice, C. O. (2016). The Collection 6 MODIS Active Fire Detection Algorithm and Fire Products. Remote Sensing of Environment, 178, 31–41. Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment. Remote Sensing of Environment, 143, 85–96."],
  ])}
<p>Reproduce: <a href="${esc(r.url)}">${esc(r.url)}</a></p>
</body></html>
`;
}
