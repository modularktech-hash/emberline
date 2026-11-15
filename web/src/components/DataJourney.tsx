"use client";

/**
 * G7: the data journey, from the NASA FIRMS archive to the page. Every number is read from
 * /data/pipeline.json (scripts/build_pipeline_stats.py); "not recorded" where nothing on
 * disk gives the value. The dot flow between stages is CSS only and off in low-power and
 * reduced-motion mode (globals.css .flow-dots).
 */
import { useState } from "react";
import { DotDigits, DotSkeleton, InfoDot, Sheet, SourceChip } from "@/components/ui";
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

/** The parts of bridge.json (scripts/build_bridge.py) this page reads. */
interface Bridge { n_countries: number; n_pass: number; test_years: [number, number]; summary: { bridged: { median_of_country_median_ape_pct: number | null } } }

interface Stage { key: string; short?: string; title: string; what: string; num: string; numLabel: string; sources: string[]; detail: string; inputs: string[]; outputs: string[]; scripts: string[]; sample?: { columns: string[]; rows: unknown[][] } | null; link?: [string, string] }

function bridgeStage(b: Bridge): Stage {
  const e = b.summary.bridged.median_of_country_median_ape_pct;
  return { key: "bridge", title: "Bridge", what: "NOAA-20 → Suomi-NPP, so the current month can be harmonized", sources: ["NOAA-20 VIIRS archive"],
    num: `${fmtInt(b.n_pass)} / ${fmtInt(b.n_countries)}`, numLabel: `countries pass the ${b.test_years[0]}–${b.test_years[1]} held-out test`,
    detail: `Per country, the published correction applied to NOAA-20 detections and scaled by one ratio fitted on 2018–2021, when both satellites flew. Held-out ${b.test_years[0]}–${b.test_years[1]}: median of the country median monthly misses ${e == null ? "not recorded" : `${fmtNum(e, 1)}%`}. Passing countries get a harmonized month to date; the rest stay raw.`,
    inputs: ["viirs-jpss1 archive 2018-2023", "calendar_harmonized_countries.csv", "params_global.json"], outputs: ["bridge.json", "month_to_date.json"], scripts: ["scripts/fetch_noaa20_archive.sh", "scripts/build_bridge.py"], link: ["/method#bridge", "See the bridge test"] };
}

function stages(p: Pipeline, b?: Bridge | null): Stage[] {
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
    ...(b ? [bridgeStage(b)] : []),
    { key: "use", title: "Use", what: "Calendar, seasons, this month, downloads, code", sources: ["FIRMS NRT / API", "NASA GIBS", "NASA EONET", "TLEs", "Natural Earth"],
      num: "Explore", numLabel: "calendar, seasons, trends, compare, globe, data",
      detail: "The Explorer calendar, Seasons, Trends and Compare read the calendars; the live globe adds FIRMS near-real-time data, satellite orbits (TLEs) and NASA EONET events; the current-month card uses the FIRMS area API; Natural Earth outlines assign recent hotspots to countries; NASA GIBS imagery is an optional map layer.",
      inputs: ["calendar_*_global.parquet", "live.json", "month_to_date.json", "eonet.json", "tle.json"], outputs: ["the pages, CSV and HTML downloads"], scripts: ["web/src/lib/queries.ts"], link: ["/explorer", "Open the calendar"] },
  ];
}

const fileHref = (f: string) => (/^[\w.-]+\.(json|parquet|csv)$/.test(f) ? `/data/${f}` : null);
/** One short label per stage (six words at most); the full wording is in the stage's sheet. */
const SHORT: Record<string, string> = {
  archive: "NASA country-year files", filters: "detections kept after filters", match: "VIIRS detections matched to Aqua", learn: "own + borrowed fits",
  test: "median held-out R²", rebuild: "in two calendar files", serve: "to open a country", bridge: "pass the NOAA-20 bridge test", use: "calendar, seasons, globe, downloads",
};
const SOURCE_HREF: Record<string, string> = {
  "FIRMS archive": "https://firms.modaps.eosdis.nasa.gov/country/", "FIRMS NRT / API": "https://firms.modaps.eosdis.nasa.gov/api/", "NASA GIBS": "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api",
  "NASA EONET": "https://eonet.gsfc.nasa.gov/", "NOAA-20 VIIRS archive": "https://firms.modaps.eosdis.nasa.gov/country/", TLEs: "https://celestrak.org/", "Natural Earth": "https://www.naturalearthdata.com/",
};

/**
 * The pipeline: eight tiles joined by a dotted conduit whose dots travel in the direction of flow.
 * Horizontal (scroll-snapped) on wide screens, vertical on phones. Sources drop into the stage where
 * they join. Tapping a stage opens a sheet with its sentence, files, script, sample rows and numbers.
 */
export function DataJourney({ compact = false }: { compact?: boolean }) {
  const { data, error } = useParquet(() => loadJson<Pipeline>("pipeline.json"), "pipeline");
  const { data: bridge } = useParquet(() => loadJson<Bridge>("bridge.json").catch(() => null), "bridge");
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <p className="mt-6 text-sm text-[var(--text-secondary)]">Could not load pipeline.json: {error.message}</p>;
  if (!data) return <DotSkeleton h={compact ? 220 : 320} className="mt-6" label="Loading the data journey" />;
  const st = stages(data, bridge);
  const sel = st.find((s) => s.key === open);
  return (
    <section id={compact ? undefined : "journey"} className={compact ? "min-w-0" : "mt-8 min-w-0 scroll-mt-24"} data-testid={compact ? "journey-teaser" : "data-journey"}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><Eyebrow info={false}>{compact ? "The data journey" : `Data journey · fit ${data.fit_version}`}</Eyebrow><InfoDot k="pipeline" align="start" /></div>
          <h2 className={`display mt-2 ${compact ? "t-d3" : "t-d2"}`}>From {data.archive.files ? `${fmtInt(data.archive.files.total)} NASA files` : "the NASA FIRMS archive"} to <span className="italic">one calendar.</span></h2>
        </div>
        {compact
          ? <Link href="/data#journey" className="glass-thin px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em]">Every step, with files and code →</Link>
          : <p className="max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">{st.length === 8 ? "Eight" : "Nine"} stages, each with its real number. Tap a stage for its files, its script and sample rows.</p>}
      </div>
      <ol className="mt-6 flex snap-x snap-mandatory flex-col gap-0 pb-3 lg:flex-row lg:items-stretch lg:overflow-x-auto lg:pt-10" aria-label="Pipeline stages">
        {st.map((s, i) => (
          <li key={s.key} className="flex shrink-0 snap-start flex-col lg:flex-row lg:items-stretch">
            <div className="relative lg:w-[13.5rem]">
              {s.sources.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5 lg:absolute lg:bottom-full lg:left-0 lg:mb-2 lg:w-[19rem]">
                  {s.sources.map((x) => <SourceChip key={x} name={x} href={SOURCE_HREF[x]} />)}
                </div>
              )}
              <div className="tile flex h-full min-h-[11.5rem] flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <Eyebrow info={false}>{`${String(i + 1).padStart(2, "0")} · ${s.title.replace("NASA FIRMS archive", "Archive")}`}</Eyebrow>
                  <InfoDot title={s.title}>{s.what}.</InfoDot>
                </div>
                <button type="button" onClick={() => setOpen(s.key)} aria-haspopup="dialog" className="mt-3 flex flex-1 flex-col text-left">
                  <DotDigits text={s.num} className="text-[2.3rem] leading-none" />
                  <span className="mt-2 text-[13px] leading-snug text-[var(--text-secondary)]">{SHORT[s.key]}</span>
                  <span className="mt-auto pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Open stage →</span>
                </button>
              </div>
            </div>
            {i < st.length - 1 && <span aria-hidden className="conduit-auto" />}
          </li>
        ))}
      </ol>
      <Sheet open={!!sel} onClose={() => setOpen(null)} title={sel ? sel.title : ""}>
        {sel && (
          <div>
            <p className="flex flex-wrap items-baseline gap-x-3"><DotDigits text={sel.num} className="text-5xl" /><span className="text-sm text-[var(--text-secondary)]">{sel.numLabel}</span></p>
            <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-primary)]">{sel.what}.</p>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">{sel.detail}</p>
            {sel.sources.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{sel.sources.map((x) => <SourceChip key={x} name={x} href={SOURCE_HREF[x]} />)}</div>}
            <dl className="mt-5 grid gap-4 text-xs">
              {([["In", sel.inputs], ["Out", sel.outputs], ["Code", sel.scripts]] as const).map(([k, v]) => (
                <div key={k} className="min-w-0 border-t-[length:var(--stroke)] border-[var(--hairline)] pt-3"><dt className="eyebrow">{k}</dt>
                  <dd className="mt-1.5 space-y-0.5 font-mono">{v.map((x) => {
                    const href = k === "Code" ? GH + x : fileHref(x);
                    return <span key={x} className="block break-all">{href ? <a className="link-ul" href={href} target={k === "Code" ? "_blank" : undefined} rel="noreferrer">{x}</a> : x}</span>;
                  })}</dd></div>
              ))}
            </dl>
            {sel.sample && (
              <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={`Sample of ${sel.outputs[0]}`}>
                <p className="eyebrow">First rows of {sel.outputs[0]} (Canada, 2023)</p>
                <table className="tabular mt-2 min-w-[360px] text-xs"><thead><tr className="text-left text-[var(--text-muted)]">{sel.sample.columns.map((c) => <th key={c} className="py-1 pr-4 font-normal">{c}</th>)}</tr></thead>
                  <tbody>{sel.sample.rows.map((r, j) => <tr key={j} className="border-t border-[var(--hairline)]">{r.map((v, k) => <td key={k} className="py-1 pr-4">{String(v)}</td>)}</tr>)}</tbody></table>
              </div>
            )}
            {sel.link && <p className="mt-5"><Link className="pill-dark inline-block px-5 py-2.5 text-sm font-medium" href={sel.link[0]}>{sel.link[1]} →</Link></p>}
          </div>
        )}
      </Sheet>
    </section>
  );
}
