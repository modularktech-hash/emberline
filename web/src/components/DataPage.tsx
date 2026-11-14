"use client";

import { useMemo, useState } from "react";
import { Chip, Failed, Loading, PageHead, Reveal, Segmented } from "@/components/ui";
import { downloadCsv, fmt } from "@/lib/ember";
import { getCountryTable, type CountryRow } from "@/lib/data";
import { useParquet } from "@/lib/useParquet";

type Key = keyof Pick<CountryRow, "country" | "harm_mean_2003_2025" | "harm_2025" | "raw_2025" | "step_raw" | "step_harm" | "r2_model" | "bias_pct" | "frp_p50" | "onset_trend_harm">;
const COLS: Array<{ key: Key; label: string; f: (r: CountryRow) => string; hint: string }> = [
  { key: "country", label: "Region", f: (r) => r.country, hint: "" },
  { key: "harm_mean_2003_2025", label: "Mean / yr (harm.)", f: (r) => fmt(r.harm_mean_2003_2025), hint: "Aqua-equivalent detections, 2003–2025 mean" },
  { key: "harm_2025", label: "2025 (harm.)", f: (r) => fmt(r.harm_2025), hint: "Aqua-equivalent detections in 2025" },
  { key: "raw_2025", label: "2025 (raw)", f: (r) => fmt(r.raw_2025), hint: "Raw VIIRS detections in 2025" },
  { key: "step_raw", label: "2012 step raw", f: (r) => `×${r.step_raw.toFixed(2)}`, hint: "Mean 2012–14 / 2009–11, raw splice" },
  { key: "step_harm", label: "2012 step harm.", f: (r) => `×${r.step_harm.toFixed(2)}`, hint: "Same ratio, harmonized" },
  { key: "r2_model", label: "Held-out R²", f: (r) => r.r2_model.toFixed(2), hint: "vs observed Aqua, 2019–2021, cell × month" },
  { key: "bias_pct", label: "Bias", f: (r) => `${r.bias_pct > 0 ? "+" : ""}${r.bias_pct.toFixed(1)}%`, hint: "Held-out total bias" },
  { key: "frp_p50", label: "FRP @ 50%", f: (r) => `${r.frp_p50.toFixed(1)} MW`, hint: "FRP at which Aqua detects half the fires VIIRS sees" },
  { key: "onset_trend_harm", label: "Onset trend", f: (r) => (r.onset_trend_harm == null ? "—" : `${r.onset_trend_harm > 0 ? "+" : ""}${r.onset_trend_harm.toFixed(1)} d/dec`), hint: "Harmonized season onset, days per decade" },
];

const FILES = [
  ["calendar_harmonized.parquet", "Monthly Aqua-equivalent counts, per region and per H3 res-2 cell"],
  ["calendar_raw.parquet", "Monthly raw counts by sensor (MODIS, VIIRS), same keys"],
  ["cell_day.parquet", "Per H3 res-5 cell × UTC day × satellite: counts, FRP, pixel area, local solar time (demo regions)"],
  ["params.json", "Every fitted coefficient and validation metric"],
  ["countries.json", "This summary table, with yearly raw and harmonized totals"],
  ["season.json", "Season onset, peak, end per region and year, raw and harmonized"],
  ["drift.json", "Mean local solar overpass time per satellite per year"],
  ["live.json", "Last 24 h and 7 days of fires worldwide, 0.5° cells"],
  ["tle.json", "Orbital elements of the five fire satellites"],
];

export function DataPage() {
  const { data, error, loading } = useParquet(() => getCountryTable(), "table");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: "harm_mean_2003_2025", dir: -1 });
  const [focus, setFocus] = useState<string | null>(null);
  const [lang, setLang] = useState<"py" | "js" | "sql">("py");
  const origin = typeof window === "undefined" ? "https://emberline-tan.vercel.app" : window.location.origin;

  const rows = useMemo(() => {
    const r = (data?.countries ?? []).filter((c) => c.country.toLowerCase().includes(q.toLowerCase()));
    return [...r].sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y) * sort.dir;
      return (((x as number) ?? -Infinity) - ((y as number) ?? -Infinity)) * sort.dir;
    });
  }, [data, q, sort]);
  const sel = data?.countries.find((c) => c.country === (focus ?? rows[0]?.country));

  const snippet = {
    py: `import polars as pl\nurl = "${origin}/data/calendar_harmonized.parquet"\ncal = pl.read_parquet(url)\nprint(cal.filter((pl.col("scope") == "country") & (pl.col("key") == "Canada")))`,
    js: `import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";\nconst file = await asyncBufferFromUrl({ url: "${origin}/data/calendar_harmonized.parquet" });\nconst rows = await parquetReadObjects({ file });\nconsole.log(rows.filter(r => r.key === "Canada"));`,
    sql: `-- DuckDB\nSELECT year, SUM(n_harmonized) AS detections\nFROM '${origin}/data/calendar_harmonized.parquet'\nWHERE scope = 'country' AND key = 'Canada'\nGROUP BY year ORDER BY year;`,
  }[lang];

  return (
    <div>
      <PageHead eyebrow="Science · data" title="Every table." italic="Every download."
        lede="All of Emberline's data is plain files on this site — no account, no API key, no server. Browse it here, download it, or query it straight from your own code." />
      {error && <Failed error={error} />}
      {loading && <Loading h={360} />}
      {data && (
        <>
          <Reveal>
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] p-4">
                <div><h2 className="display text-3xl">Regions</h2><p className="text-xs text-[var(--text-muted)]">{rows.length} of {data.countries.length} · fit {data.fit_version} · click a row for its yearly table</p></div>
                <div className="flex gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search regions…" className="w-48 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-2 text-sm" />
                  <button type="button" onClick={() => downloadCsv("emberline_regions.csv", { source: "Emberline countries.json", fit_version: data.fit_version, unit: data.unit }, COLS.map((c) => c.key), rows.map((r) => COLS.map((c) => String(r[c.key] ?? ""))))}
                    className="pill-dark px-4 py-2 text-sm font-medium">CSV</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="tabular w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="bg-[var(--surface-2)] text-left text-xs text-[var(--text-secondary)]">
                      {COLS.map((c) => (
                        <th key={c.key} title={c.hint} className="px-4 py-3 font-medium">
                          <button type="button" onClick={() => setSort({ k: c.key, dir: sort.k === c.key ? (sort.dir === 1 ? -1 : 1) : -1 })} className="flex items-center gap-1 hover:text-[var(--text-primary)]">
                            {c.label}{sort.k === c.key && <span>{sort.dir === 1 ? "↑" : "↓"}</span>}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.country} onClick={() => setFocus(r.country)} className={`cursor-pointer border-t border-[var(--hairline)] transition-colors hover:bg-[var(--ember-soft)] ${sel?.country === r.country ? "bg-[var(--ember-soft)]" : ""}`}>
                        {COLS.map((c) => <td key={c.key} className={`px-4 py-3 ${c.key === "country" ? "font-medium" : ""} ${c.key === "step_raw" ? "text-[var(--seq-5)]" : ""}`}>{c.f(r)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </Reveal>

          {sel && (
            <Reveal>
              <section className="card mt-6 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] p-4">
                  <h2 className="display text-3xl">{sel.country}, year by year</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {data.countries.map((c) => <Chip key={c.country} on={c.country === sel.country} onClick={() => setFocus(c.country)}>{c.country}</Chip>)}
                    <button type="button" onClick={() => downloadCsv(`emberline_${sel.country}_annual.csv`, { region: sel.country, unit: data.unit, fit_version: data.fit_version }, ["year", "raw", "harmonized"], sel.annual.map((a) => [a.year, a.raw, a.harm]))} className="pill-dark px-4 py-1.5 text-sm">CSV</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="tabular w-full min-w-[640px] text-sm">
                    <thead><tr className="bg-[var(--surface-2)] text-left text-xs text-[var(--text-secondary)]"><th className="px-4 py-2.5 font-medium">Year</th><th className="font-medium">Raw detections</th><th className="font-medium">Sensor (raw)</th><th className="font-medium">Harmonized</th><th className="font-medium">Raw ÷ harmonized</th><th className="w-1/3 font-medium">Harmonized, relative</th></tr></thead>
                    <tbody>
                      {sel.annual.map((a) => {
                        const max = Math.max(...sel.annual.map((x) => x.harm));
                        return (
                          <tr key={a.year} className="border-t border-[var(--hairline)]">
                            <td className={`px-4 py-2 ${a.year === 2012 ? "text-[var(--ember)]" : ""}`}>{a.year}</td>
                            <td>{fmt(a.raw)}</td><td className="text-xs text-[var(--text-muted)]">{a.year < 2012 ? "MODIS" : "VIIRS"}</td>
                            <td>{a.harm ? fmt(a.harm) : <span className="text-xs text-[var(--text-muted)]">no Aqua data yet</span>}</td><td className="text-[var(--text-secondary)]">{a.harm ? `×${(a.raw / a.harm).toFixed(2)}` : "—"}</td>
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

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Reveal className="min-w-0">
              <section className="card h-full p-5 sm:p-6">
                <h2 className="display text-3xl">Files</h2>
                <ul className="mt-4 divide-y divide-[var(--hairline)]">
                  {FILES.map(([f, d]) => (
                    <li key={f} className="flex items-start justify-between gap-4 py-3">
                      <div><p className="font-mono text-sm">{f}</p><p className="text-xs text-[var(--text-secondary)]">{d}</p></div>
                      <a href={`/data/${f}`} download className="shrink-0 rounded-full border border-[var(--hairline)] px-3 py-1 text-xs hover:border-[var(--ember)]">Download</a>
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
                <pre className="mt-4 overflow-x-auto rounded-xl bg-[var(--ink)] p-4 font-mono text-xs leading-relaxed text-[#efe9d9]"><code>{snippet}</code></pre>
                <button type="button" onClick={() => navigator.clipboard?.writeText(snippet)} className="mt-3 rounded-full border border-[var(--hairline)] px-3 py-1 text-xs hover:border-[var(--ember)]">Copy</button>
                <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">The Parquet files support HTTP range requests, so readers fetch only the row groups they need. `cell_day.parquet` is sorted by H3 res-2 parent then date: filter on `h3_parent` for fast area queries.</p>
              </section>
            </Reveal>
          </div>
        </>
      )}
    </div>
  );
}
