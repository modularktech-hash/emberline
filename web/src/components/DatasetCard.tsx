"use client";

/**
 * G4: the /data "Dataset card". Coverage and scale come from dataset.json
 * (scripts/build_dataset_card.py); file sizes come from manifest.json
 * (scripts/build_manifest.py). Nothing here is typed in by hand.
 */
import { useState } from "react";
import { loadJson } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import { fmtInt, fmtNum } from "@/lib/format";
import { Eyebrow } from "@/components/Figure";

interface Card {
  name: string; fit_version: string; unit: string; countries_with_raw_record: number; countries_fitted: number; countries_own_fit: number; countries_pooled_fit: number;
  raw_years: [number, number]; harmonized_years: [number, number]; train_years: [number, number]; test_years: [number, number];
  filtered_detections: number; filtered_detections_definition: string; filtered_detections_by_sensor: Record<string, { detections: number; years: [number, number] }>;
  country_sensor_years_with_detections: number; harmonized_country_month_rows: number; csv_export: string;
  licence: { code: string; data: string }; cite: string;
}
interface Manifest { files: Array<{ name: string; bytes: number; dataset: string; purpose: string }> }

const MB = (b: number) => `${fmtNum(b / 1e6, b < 1e6 ? 2 : 1)} MB`;

export function DatasetCard() {
  const { data, error } = useParquet(() => Promise.all([loadJson<Card>("dataset.json"), loadJson<Manifest>("manifest.json")]), "dataset-card");
  const [copied, setCopied] = useState(false);
  if (error) return <p className="mt-6 text-sm text-[var(--text-secondary)]">Could not load the dataset card: {error.message}</p>;
  if (!data) return <div className="card mt-6 h-64 animate-pulse" />;
  const [c, m] = data;
  const files = [...m.files].sort((a, b) => b.bytes - a.bytes);
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const core = ["calendar_harmonized_global.parquet", "calendar_raw_global.parquet", "params_global.json", "countries.json", "season.json", c.csv_export];
  const copy = () => { navigator.clipboard?.writeText(c.cite).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {}); };
  return (
    <section className="window mt-8 min-w-0 p-5 sm:p-7" data-testid="dataset-card">
      <Eyebrow>Dataset card</Eyebrow>
      <h2 className="display mt-2 text-2xl sm:text-3xl">{c.name}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        Unit: {c.unit}. Harmonized {c.harmonized_years[0]}–{c.harmonized_years[1]} (fit on {c.train_years[0]}–{c.train_years[1]}, tested on {c.test_years[0]}–{c.test_years[1]}); raw archive {c.raw_years[0]}–{c.raw_years[1]}.
      </p>
      <dl className="tabular mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Countries", `${c.countries_fitted} fitted (${c.countries_own_fit} own, ${c.countries_pooled_fit} pooled) · ${c.countries_with_raw_record} with a raw record`],
          ["Detections processed", `${fmtInt(c.filtered_detections)} filtered detections`],
          ["Country × sensor × year", `${fmtInt(c.country_sensor_years_with_detections)} with detections`],
          ["Published", `${files.length} files · ${MB(total)}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-[var(--hairline)] p-3">
            <dt className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{k}</dt>
            <dd className="mt-1 text-sm text-[var(--text-primary)]">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
        Detections: {c.filtered_detections_definition}. By sensor: {Object.entries(c.filtered_detections_by_sensor).map(([k, v]) => `${k} ${fmtInt(v.detections)} (${v.years[0]}–${v.years[1]})`).join(" · ")}.
        The published numbers can be recomputed from these {MB(total)} of files.
      </p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Download everything</h3>
          <ul className="mt-2 divide-y divide-[var(--hairline)] text-sm">
            {core.map((n) => { const f = m.files.find((x) => x.name === n); return f ? (
              <li key={n} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate font-mono text-xs">{n}</span>
                <span className="flex shrink-0 items-center gap-2"><span className="tabular text-xs text-[var(--text-muted)]">{MB(f.bytes)}</span><a href={`/data/${n}`} download className="glass rounded-full px-3 py-1 text-xs">Download</a></span>
              </li>) : null; })}
          </ul>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Every other file, with SHA-256 hashes, rows and columns: <a className="link-ul" href="/data/manifest.json">manifest.json</a>. Schemas and provenance: docs/DATASET.md in the repository.</p>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Licence and citation</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">Code: {c.licence.code}. Data: {c.licence.data}. Versioned by fit: this is {c.fit_version}; files of different fits are never mixed.</p>
          <pre tabIndex={0} role="region" aria-label="How to cite" className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-2)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]"><code>{c.cite}</code></pre>
          <button type="button" onClick={copy} className="mt-2 glass rounded-full px-3 py-1 text-xs">{copied ? "Copied" : "Copy citation"}</button>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Also as CITATION.cff in the repository.</p>
        </div>
      </div>
    </section>
  );
}
