"use client";

import { fmtNum, fmtPct, fmtR2, fmtRatio, fmtSigned } from "@/lib/format";
import { useState } from "react";
import { Failed, Loading, PageHead, Reveal, Segmented } from "@/components/ui";
import { downloadCsv, fmt } from "@/lib/ember";
import { getCountryTable, type CountryRow } from "@/lib/data";
import { useParquet } from "@/lib/useParquet";
import { prettyName } from "@/lib/names";
import { CountryPicker } from "@/components/CountryPicker";
import { CoverageSummaryText, useCoverage } from "@/components/CoverageNote";
import { STATUS_LABEL, coverageReason } from "@/lib/coverage";
import { ScrollBox, SortTh, TableSearch, useTable } from "@/components/TableTools";

type Key = keyof Pick<CountryRow, "country" | "harm_mean_2003_2025" | "harm_2025" | "raw_2025" | "step_raw" | "step_harm" | "r2_model" | "bias_pct" | "frp_p50" | "onset_trend_harm">;
const COLS: Array<{ key: Key; label: string; f: (r: CountryRow) => string; hint: string }> = [
  { key: "country", label: "Country", f: (r) => prettyName(r.country), hint: "FIRMS country name" },
  { key: "harm_mean_2003_2025", label: "Mean / yr (harm.)", f: (r) => fmt(r.harm_mean_2003_2025), hint: "Aqua-equivalent detections, 2003–2025 mean" },
  { key: "harm_2025", label: "2025 (harm.)", f: (r) => fmt(r.harm_2025), hint: "Aqua-equivalent detections in 2025" },
  { key: "raw_2025", label: "2025 (raw)", f: (r) => fmt(r.raw_2025), hint: "Raw VIIRS detections in 2025" },
  { key: "step_raw", label: "2012 step raw", f: (r) => fmtRatio(r.step_raw), hint: "Mean 2012–14 / 2009–11, raw splice" },
  { key: "step_harm", label: "2012 step harm.", f: (r) => fmtRatio(r.step_harm), hint: "Same ratio, harmonized" },
  { key: "r2_model", label: "Held-out R²", f: (r) => fmtR2(r.r2_model), hint: "vs observed Aqua, 2019–2021, cell × month" },
  { key: "bias_pct", label: "Bias", f: (r) => fmtPct(r.bias_pct), hint: "Held-out total bias" },
  { key: "frp_p50", label: "FRP @ 50%", f: (r) => `${fmtNum(r.frp_p50, 1)} MW`, hint: "FRP at which Aqua detects half the fires VIIRS sees" },
  { key: "onset_trend_harm", label: "Onset trend", f: (r) => (r.onset_trend_harm == null ? "—" : `${fmtSigned(r.onset_trend_harm)} d/dec`), hint: "Harmonized season onset, days per decade" },
];

const FILES = [
  ["calendar_harmonized_global.parquet", "Monthly Aqua-equivalent counts, per fitted country and per H3 res-2 cell (every FIRMS country)"],
  ["calendar_raw_global.parquet", "Monthly raw counts by sensor (MODIS, VIIRS), same keys, including countries without a fit (uncorrected)"],
  ["params_global.json", "Every fitted coefficient and validation metric, per country; pooled fits and unfitted countries listed"],
  ["coverage_status.json", "Every FIRMS country's coverage status: own fit, borrowed (pooled) fit, or the data-sufficiency reason it has no fit, with the counts behind it"],
  ["validation_points.json", "Up to 300 sampled held-out 2019–2021 cell-month points (observed Aqua vs model) per fitted country, with metrics for a one-ratio baseline scored on the same held-out table"],
  ["countries.json", "This summary table, with yearly raw and harmonized totals"],
  ["season.json", "Season onset (10%), midpoint (50%) and end (90%) per country and year, raw and harmonized; daily or monthly resolution per country"],
  ["drift.json", "Mean local solar overpass time per satellite per year (countries with point detections)"],
  ["calendar_harmonized.parquet", "The first four countries (Australia, Canada, Chile, Portugal): fallback copy"],
  ["calendar_raw.parquet", "The first four countries: raw fallback copy"],
  ["params.json", "The first four countries' fit (same numbers as in params_global.json)"],
  ["cell_day.parquet", "Per H3 res-5 cell × UTC day × satellite: counts, FRP, pixel area, local solar time (the first four countries only)"],
  ["live.json", "Last 24 h and 7 days of fires worldwide, 0.5° cells"],
  ["tle.json", "Orbital elements of the five fire satellites"],
];

export function DataPage() {
  const { data, error, loading } = useParquet(() => getCountryTable(), "table");
  const [focus, setFocus] = useState<string | null>(null);
  const [q2, setQ2] = useState("");
  const coverage = useCoverage();
  const [lang, setLang] = useState<"py" | "js" | "sql">("py");
  const origin = typeof window === "undefined" ? "https://emberline-tan.vercel.app" : window.location.origin;

  const tbl = useTable<CountryRow, Key>(data?.countries ?? [], (r) => r.country, (r, k) => (k === "country" ? prettyName(r.country) : r[k]), { k: "harm_mean_2003_2025", dir: -1 });
  const rows = tbl.shown;
  const sel = data?.countries.find((c) => c.country === (focus ?? rows[0]?.country));
  const notFitted = (data?.not_fitted ?? []).filter((n) => prettyName(n.country).toLowerCase().includes(q2.toLowerCase()));

  const snippet = {
    py: `import polars as pl\nurl = "${origin}/data/calendar_harmonized_global.parquet"\ncal = pl.read_parquet(url)\nprint(cal.filter((pl.col("scope") == "country") & (pl.col("key") == "Canada")))`,
    js: `import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";\nconst file = await asyncBufferFromUrl({ url: "${origin}/data/calendar_harmonized_global.parquet" });\nconst rows = await parquetReadObjects({ file });\nconsole.log(rows.filter(r => r.key === "Canada"));`,
    sql: `-- DuckDB\nSELECT year, SUM(n_harmonized) AS detections\nFROM '${origin}/data/calendar_harmonized_global.parquet'\nWHERE scope = 'country' AND key = 'Canada'\nGROUP BY year ORDER BY year;`,
  }[lang];

  return (
    <div>
      <PageHead compact eyebrow="Science · data" title="Every table." italic="Every download."
        lede="All of Emberline's data is plain files on this site — no account, no API key, no server. Browse it here, download it, or query it straight from your own code." />
      {error && <Failed error={error} />}
      {loading && <Loading h={360} />}
      {data && (
        <>
          <Reveal>
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] p-4">
                <div><h2 className="display text-3xl">Fitted countries</h2><p className="text-xs text-[var(--text-muted)]">{data.countries.length} fitted ({data.countries.filter((c) => c.fit_source === "pooled").length} on the pooled curve, marked) · fit {data.fit_version} · each country fitted separately, no global correction · click a row for its yearly table</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <TableSearch q={tbl.q} setQ={tbl.setQ} shown={rows.length} total={data.countries.length} />
                  <button type="button" onClick={() => downloadCsv("emberline_regions.csv", { source: "Emberline countries.json", fit_version: data.fit_version, unit: data.unit }, COLS.map((c) => c.key), rows.map((r) => COLS.map((c) => String(r[c.key] ?? ""))))}
                    className="pill-dark px-4 py-2 text-sm font-medium">CSV</button>
                </div>
              </div>
              <div className="px-4 pb-4">
              <ScrollBox h="32rem">
                <table className="tabular w-full min-w-[1040px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-secondary)]">
                      {COLS.map((c) => <SortTh key={c.key} k={c.key} sort={tbl.sort} toggle={tbl.toggle} title={c.hint} className="font-medium">{c.label}</SortTh>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.country} onClick={() => setFocus(r.country)} className={`cursor-pointer border-t border-[var(--hairline)] transition-colors hover:bg-[var(--ember-soft)] ${sel?.country === r.country ? "bg-[var(--ember-soft)]" : ""}`}>
                        {COLS.map((c) => (
                          <td key={c.key} className={`px-3 py-2.5 first:pl-0 ${c.key === "country" ? "font-medium" : ""} ${c.key === "step_raw" ? "text-[var(--seq-5)]" : ""}`}>
                            {c.f(r)}
                            {c.key === "country" && r.fit_source === "pooled" && <span title="Too few training matches for its own curve: uses the pooled curve" className="ml-1.5 font-mono text-[10px] font-normal uppercase text-[var(--ember)]">pooled</span>}
                            {c.key === "onset_trend_harm" && r.season_resolution === "monthly" && r.onset_trend_harm != null && <span title="Estimated from monthly calendars" className="ml-1 text-[10px] text-[var(--text-muted)]">(monthly)</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollBox>
              </div>
            </section>
          </Reveal>

          {sel && (
            <Reveal>
              <section className="card mt-6 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] p-4">
                  <h2 className="display text-3xl">{prettyName(sel.country)}, year by year</h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CountryPicker value={sel.country} options={data.countries.map((c) => c.country)} onChange={setFocus} label="Country"
                      tags={Object.fromEntries(data.countries.map((c) => [c.country, c.fit_source === "pooled" ? ("pooled" as const) : null]))} />
                    <button type="button" onClick={() => downloadCsv(`emberline_${sel.country}_annual.csv`, { region: sel.country, unit: data.unit, fit_version: data.fit_version }, ["year", "raw", "harmonized"], sel.annual.map((a) => [a.year, a.raw, a.harm]))} className="pill-dark px-4 py-1.5 text-sm">CSV</button>
                  </div>
                </div>
                <div className="max-w-full overflow-x-auto">
                  <table className="tabular w-full min-w-[640px] text-sm">
                    <thead><tr className="bg-[var(--surface-2)] text-left text-xs text-[var(--text-secondary)]"><th className="px-4 py-2.5 font-medium">Year</th><th className="font-medium">Raw detections</th><th className="font-medium">Sensor (raw)</th><th className="font-medium">Harmonized</th><th className="font-medium">Raw ÷ harmonized</th><th className="w-1/3 font-medium">Harmonized, relative</th></tr></thead>
                    <tbody>
                      {sel.annual.map((a) => {
                        const max = Math.max(...sel.annual.map((x) => x.harm));
                        return (
                          <tr key={a.year} className="border-t border-[var(--hairline)]">
                            <td className={`px-4 py-2 ${a.year === 2012 ? "text-[var(--ember)]" : ""}`}>{a.year}</td>
                            <td>{fmt(a.raw)}</td><td className="text-xs text-[var(--text-muted)]">{a.year < 2012 ? "MODIS" : "VIIRS"}</td>
                            <td>{a.harm ? fmt(a.harm) : <span className="text-xs text-[var(--text-muted)]">no Aqua data yet</span>}</td><td className="text-[var(--text-secondary)]">{a.harm ? fmtRatio(a.raw / a.harm) : "—"}</td>
                            <td className="pr-4"><div className="h-2 rounded-full bg-[var(--surface-2)]"><div className="h-2 rounded-full bg-[var(--ember)]" style={{ width: `${(a.harm / max) * 100}%` }} /></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </Reveal>
          )}

          {data.not_fitted && data.not_fitted.length > 0 && (
            <Reveal>
              <section className="card mt-6 p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="display text-3xl">Not enough data to fit</h2>
                    <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
                      {data.not_fitted.length} FIRMS countries and territories lack the data the fit needs, so they have no harmonized record and no score.
                      Where a raw record exists, the Explorer shows it, marked uncorrected.
                      {coverage && <> <span data-testid="coverage-summary"><CoverageSummaryText coverage={coverage} />.</span></>}
                    </p>
                  </div>
                  <input value={q2} onChange={(e) => setQ2(e.target.value)} placeholder="Search…" aria-label="Search countries not fitted" className="field w-full rounded-full px-4 py-2 text-sm sm:w-56" />
                </div>
                <ScrollBox h="16rem">
                  <table className="tabular w-full min-w-[640px] text-sm">
                    <thead><tr className="text-left text-xs text-[var(--text-muted)]">
                      <th className="sticky top-0 bg-[var(--surface-page)] py-2.5 font-normal">Country</th>
                      <th className="sticky top-0 bg-[var(--surface-page)] px-3 font-normal">Raw detections, all years (uncorrected)</th>
                      <th className="sticky top-0 bg-[var(--surface-page)] px-3 font-normal">Status</th>
                    </tr></thead>
                    <tbody>
                      {notFitted.map((n) => (
                        <tr key={n.country} className="border-t border-[var(--hairline)]">
                          <td className="py-2">{prettyName(n.country)}</td>
                          <td className="px-3 text-[var(--text-secondary)]">{n.has_raw_calendar ? fmt(n.detections_filtered) : "no raw record"}</td>
                          <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{coverage?.countries[n.country]
                            ? <><span className="text-[var(--text-primary)]">{STATUS_LABEL[coverage.countries[n.country].status]}</span>{n.has_raw_calendar ? "" : " · no calendar"} — {coverageReason(coverage.countries[n.country])}</>
                            : "not enough data to fit"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollBox>
              </section>
            </Reveal>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Reveal className="min-w-0">
              <section className="card h-full p-5 sm:p-6">
                <h2 className="display text-3xl">Files</h2>
                <ul className="mt-4 divide-y divide-[var(--hairline)]">
                  {FILES.map(([f, d]) => (
                    <li key={f} className="flex items-start justify-between gap-4 py-3">
                      <div><p className="font-mono text-sm">{f}</p><p className="text-xs text-[var(--text-secondary)]">{d}</p></div>
                      <a href={`/data/${f}`} download className="shrink-0 glass rounded-full px-3 py-1 text-xs">Download</a>
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
            <Reveal delay={0.06} className="min-w-0">
              <section className="card h-full min-w-0 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="display text-3xl">Query it yourself</h2>
                  <Segmented label="lang" value={lang} onChange={setLang} options={[{ value: "py", label: "Python" }, { value: "js", label: "JavaScript" }, { value: "sql", label: "DuckDB" }]} />
                </div>
                <pre tabIndex={0} role="region" aria-label="Code example" className="mt-4 max-w-full overflow-x-auto rounded-xl bg-[var(--ink)] p-4 font-mono text-xs leading-relaxed text-[#efe9d9]"><code>{snippet}</code></pre>
                <button type="button" onClick={() => navigator.clipboard?.writeText(snippet)} className="mt-3 glass rounded-full px-3 py-1 text-xs">Copy</button>
                <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">The Parquet files support HTTP range requests, so readers fetch only the row groups they need. `cell_day.parquet` is sorted by H3 res-2 parent then date: filter on `h3_parent` for fast area queries.</p>
              </section>
            </Reveal>
          </div>
        </>
      )}
    </div>
  );
}
