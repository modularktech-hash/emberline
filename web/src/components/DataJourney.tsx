"use client";

/**
 * G7: the data journey, from the NASA FIRMS archive to the page. Every number is read from
 * /data/pipeline.json (scripts/build_pipeline_stats.py); "not recorded" where nothing on
 * disk gives the value. The dot flow between stages is CSS only and off in low-power and
 * reduced-motion mode (globals.css .flow-dots).
 */
import { useState } from "react";
import Link from "next/link";
import { loadJson } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import { fmtInt, fmtNum } from "@/lib/format";
import { Eyebrow } from "@/components/Figure";

interface Pipeline {
  fit_version: string;
  archive: { files: { total: number; modis: number; viirs_snpp: number } | null; files_note: string; raw_rows: number | null; raw_rows_note: string };
  filters: { output_detections: number; by_sensor: Record<string, { detections: number; years: [number, number] }>; funnel: null; funnel_note: string };
  match: { rule: string; train_viirs_detections: number; matched_viirs_detections: number; match_rate: number; definition: string };
  learn: { fitted: number; own: number; pooled: number; train_years: [number, number] };
  test: { test_years: [number, number]; median_r2_own: number; heldout_cell_months: number; beats_ratio_r2: number; n: number; within_1_25_harm: number };
  rebuild: { calendars: Record<string, { rows: number; bytes: number }>; csv_rows: number };
  serve: { canada_bytes: number; canada_gzip_bytes: number; median_country_bytes: number; note: string; country_view_first_files: string[] };
  samples: { harmonized: { columns: string[]; rows: unknown[][] }; raw: { columns: string[]; rows: unknown[][] }; fit_canada: Record<string, number> };
}

const GH = "https://github.com/modularktech-hash/emberline/blob/main/";
const KB = (b: number) => `${fmtNum(b / 1024, 0)} KB`;
const MB = (b: number) => `${fmtNum(b / 1e6, 1)} MB`;
const M = (n: number) => `${fmtNum(n / 1e6, 1)} M`;

interface Stage { key: string; title: string; what: string; num: string; numLabel: string; sources: string[]; detail: string; inputs: string[]; outputs: string[]; scripts: string[]; sample?: { columns: string[]; rows: unknown[][] } | null; link?: [string, string] }

function stages(p: Pipeline): Stage[] {
  const cal = p.rebuild.calendars;
  const calRows = Object.values(cal).reduce((s, c) => s + (c.rows ?? 0), 0), calBytes = Object.values(cal).reduce((s, c) => s + c.bytes, 0);
  const f = p.samples.fit_canada;
  return [
    { key: "archive", title: "NASA FIRMS archive", what: "Country files of every MODIS and Suomi-NPP VIIRS fire detection", sources: ["FIRMS archive"],
      num: p.archive.files ? fmtInt(p.archive.files.total) : "not recorded", numLabel: p.archive.files ? `country-source-year files (${fmtInt(p.archive.files.modis)} MODIS, ${fmtInt(p.archive.files.viirs_snpp)} VIIRS)` : "files",
      detail: `Downloaded without a key, one CSV per country, source and year. Raw rows before filtering: ${p.archive.raw_rows_note}.`,
      inputs: ["firms.modaps.eosdis.nasa.gov/data/country/"], outputs: ["data/global/*.csv.gz (not published)"], scripts: ["scripts/stage_global.sh"] },
    { key: "filters", title: "Filters", what: "Vegetation fires, nominal+ confidence, daytime, FRP > 0", sources: [],
      num: M(p.filters.output_detections), numLabel: "filtered detections",
      detail: `${fmtInt(p.filters.output_detections)} detections kept: ${Object.entries(p.filters.by_sensor).map(([k, v]) => `${k} ${fmtInt(v.detections)} (${v.years[0]}–${v.years[1]})`).join(", ")}. Per-filter funnel: ${p.filters.funnel_note}.`,
      inputs: ["data/global/*.csv.gz"], outputs: ["calendar_raw_global.parquet"], scripts: ["scripts/build_tables.py", "scripts/run_global.py"], sample: p.samples.raw },
    { key: "match", title: "Match", what: "Suomi-NPP VIIRS ↔ Aqua MODIS: same day, within ~3.5 km", sources: [],
      num: M(p.match.matched_viirs_detections), numLabel: `of ${M(p.match.train_viirs_detections)} training VIIRS detections matched (${fmtNum(p.match.match_rate * 100, 1)}%)`,
      detail: `For each VIIRS detection in ${p.learn.train_years[0]}–${p.learn.train_years[1]}: did Aqua, passing at the same early-afternoon time, also detect it? Match rule: ${p.match.rule} (about 3.5 km). ${p.match.definition}.`,
      inputs: ["per-country detection tables (not published)"], outputs: ["training labels (in memory)"], scripts: ["scripts/fit_harmonization.py"] },
    { key: "learn", title: "Learn", what: "Logistic P(Aqua detects | FRP) and κ, per country", sources: [],
      num: `${p.learn.own} + ${p.learn.pooled}`, numLabel: `own + pooled fits, trained ${p.learn.train_years[0]}–${p.learn.train_years[1]}`,
      detail: `Countries with enough training matches get their own curve; smaller ones borrow the pooled curve. Canada: b0 ${f.b0}, b1 ${f.b1}, κ ${f.kappa}, 50% detection at ${f.frp_at_p50_mw} MW.`,
      inputs: ["training labels"], outputs: ["params_global.json"], scripts: ["scripts/fit_harmonization.py"] },
    { key: "test", title: "Test", what: `Held-out ${p.test.test_years[0]}–${p.test.test_years[1]}, never used for fitting`, sources: [],
      num: fmtNum(p.test.median_r2_own, 2), numLabel: "median held-out R², own-fit countries",
      detail: `${fmtInt(p.test.heldout_cell_months)} held-out cell-months scored. The model beats a single ratio on R² in ${p.test.beats_ratio_r2} of ${p.test.n}; the 2012 step lands within ×1.25 of the unchanged sensor in ${p.test.within_1_25_harm} of ${p.test.n}.`,
      inputs: ["params_global.json"], outputs: ["validation_points.json", "proof.json"], scripts: ["scripts/fit_harmonization.py", "scripts/build_proof.py"], link: ["/method#proof", "See the proof"] },
    { key: "rebuild", title: "Rebuild", what: "Monthly harmonized calendars, per country and grid cell", sources: [],
      num: MB(calBytes), numLabel: `${fmtInt(calRows)} rows in the two calendar files`,
      detail: `Aqua counts to 2011, κ × Σ P(FRP) over Suomi-NPP detections from 2012. Also as a CSV of ${fmtInt(p.rebuild.csv_rows)} country-month rows.`,
      inputs: ["calendar_raw_global.parquet", "params_global.json"], outputs: ["calendar_harmonized_global.parquet", "calendar_harmonized_countries.csv"], scripts: ["scripts/fit_harmonization.py", "scripts/build_dataset_card.py"], sample: p.samples.harmonized },
    { key: "serve", title: "Serve", what: "Static files and HTTP range reads; no server, no database", sources: [],
      num: KB(p.serve.canada_gzip_bytes), numLabel: `≈ compressed, first data for a country view (${KB(p.serve.canada_bytes)} uncompressed)`,
      detail: `${p.serve.note}. Files: ${p.serve.country_view_first_files.join(", ")}.`,
      inputs: ["web/public/data/"], outputs: ["manifest.json", "slices/"], scripts: ["scripts/build_manifest.py", "web/scripts/build-slices.mjs"] },
    { key: "use", title: "Use", what: "Calendar, seasons, this month, downloads, code", sources: ["FIRMS NRT / API", "NASA GIBS", "NASA EONET", "TLEs", "Natural Earth"],
      num: "Explore", numLabel: "calendar, seasons, trends, compare, globe, data",
      detail: "The Explorer calendar, Seasons, Trends and Compare read the calendars; the live globe adds FIRMS near-real-time data, satellite orbits (TLEs) and NASA EONET events; the current-month card uses the FIRMS area API; Natural Earth outlines assign recent hotspots to countries; NASA GIBS imagery is an optional map layer.",
      inputs: ["calendar_*_global.parquet", "live.json", "month_to_date.json", "eonet.json", "tle.json"], outputs: ["the pages, CSV and HTML downloads"], scripts: ["web/src/lib/queries.ts"], link: ["/explorer", "Open the calendar"] },
  ];
}

const fileHref = (f: string) => (/^[\w.-]+\.(json|parquet|csv)$/.test(f) ? `/data/${f}` : null);

export function DataJourney({ compact = false }: { compact?: boolean }) {
  const { data, error } = useParquet(() => loadJson<Pipeline>("pipeline.json"), "pipeline");
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <p className="mt-6 text-sm text-[var(--text-secondary)]">Could not load pipeline.json: {error.message}</p>;
  if (!data) return <div className="card mt-6 h-48 animate-pulse" />;
  const st = stages(data);
  const sel = st.find((s) => s.key === open);

  if (compact) return (
    <section className="window mx-auto max-w-5xl p-6 sm:p-8" data-testid="journey-teaser">
      <Eyebrow>The data journey</Eyebrow>
      <h2 className="display mt-2 t-d3">From {data.archive.files ? `${fmtInt(data.archive.files.total)} NASA files` : "the NASA FIRMS archive"} to one calendar</h2>
      <ol className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {st.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1">
            <span className="rounded-full border border-[var(--hairline)] px-3 py-1"><span className="text-[var(--text-primary)]">{s.title}</span> <span className="tabular text-[var(--ember)]">{s.num}</span></span>
            {i < st.length - 1 && <span aria-hidden className="text-[var(--text-muted)]">→</span>}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm"><Link href="/data#journey" className="link-ul">Follow every step, with its files and code →</Link></p>
    </section>
  );

  return (
    <section id="journey" className="window mt-8 min-w-0 scroll-mt-24 p-5 sm:p-7" data-testid="data-journey">
      <Eyebrow>Data journey · fit {data.fit_version}</Eyebrow>
      <h2 className="display mt-2 text-2xl sm:text-3xl">How NASA fire detections become this record</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">Eight steps, each with its number, its files and the script that runs it. Tap a step to open it.</p>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-8 lg:gap-0">
        {st.map((s, i) => (
          <li key={s.key} className="relative min-w-0 lg:px-1">
            <button type="button" onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key} aria-controls="journey-detail"
              className={`card flex h-full w-full flex-col p-3 text-left transition-colors ${open === s.key ? "ring-1 ring-[var(--ember)]" : ""}`}>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{String(i + 1).padStart(2, "0")} · {s.title}</span>
              <span className="tabular mt-1.5 text-xl text-[var(--ember)]">{s.num}</span>
              <span className="mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)]">{s.numLabel}</span>
              <span className="mt-2 text-xs leading-snug text-[var(--text-primary)]">{s.what}</span>
              {s.sources.length > 0 && <span className="mt-2 flex flex-wrap gap-1">{s.sources.map((x) => <span key={x} className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">{x}</span>)}</span>}
            </button>
            {i < st.length - 1 && <span aria-hidden className="flow-dots hidden lg:block" />}
          </li>
        ))}
      </ol>
      <div id="journey-detail" aria-live="polite">
        {sel && (
          <div className="mt-4 rounded-2xl border border-[var(--hairline)] p-4 sm:p-5">
            <p className="text-sm font-medium text-[var(--text-primary)]">{sel.title}</p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">{sel.detail}</p>
            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
              {([["In", sel.inputs], ["Out", sel.outputs], ["Code", sel.scripts]] as const).map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-[var(--text-muted)]">{k}</dt>
                  <dd className="mt-1 space-y-0.5 font-mono">{v.map((x) => {
                    const href = k === "Code" ? GH + x : fileHref(x);
                    return <span key={x} className="block break-all">{href ? <a className="link-ul" href={href} target={k === "Code" ? "_blank" : undefined} rel="noreferrer">{x}</a> : x}</span>;
                  })}</dd></div>
              ))}
            </dl>
            {sel.sample && (
              <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={`Sample of ${sel.outputs[0]}`}>
                <p className="text-[11px] text-[var(--text-muted)]">First rows of {sel.outputs[0]} (Canada, 2023, country scope):</p>
                <table className="tabular mt-1 min-w-[360px] text-xs"><thead><tr className="text-left text-[var(--text-muted)]">{sel.sample.columns.map((c) => <th key={c} className="py-1 pr-4 font-normal">{c}</th>)}</tr></thead>
                  <tbody>{sel.sample.rows.map((r, j) => <tr key={j} className="border-t border-[var(--hairline)]">{r.map((v, k) => <td key={k} className="py-1 pr-4">{String(v)}</td>)}</tr>)}</tbody></table>
              </div>
            )}
            {sel.link && <p className="mt-3 text-sm"><Link className="link-ul" href={sel.link[0]}>{sel.link[1]} →</Link></p>}
          </div>
        )}
      </div>
    </section>
  );
}
