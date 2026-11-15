// Builds the small per-page data slices under public/data/slices/ from the
// published files in public/data/. Slices hold the SAME values as their
// sources (subsets and re-keyings only, nothing recomputed), so a page's first
// paint needs kilobytes instead of megabytes:
//
//   calendar_index.json       country lists and year coverage of the world calendars
//   calendar/<Country>.json   one country's raw + harmonized monthly rows
//   params_core.json          params_global.json without the per-country fields only
//                             the Method page reads (validation_train, drift_era,
//                             frozen_era_obs_over_pred)
//   live_summary.json         live.json without the per-cell lists (totals, dates, time)
//   season_home.json          season.json, Chile only (the one country the home page quotes)
//   season_trends.json        season.json without the per-year rows (the all-country table)
//   season/<Country>.json     one country's entry of season.json
//   manifest.json             sha256 of every source file the slices were built from
//
// Read through src/lib/queries.ts and src/lib/data.ts only; both fall back to
// the source files if a slice cannot be loaded. Runs before `next build` and
// `next dev` (package.json), skips the work when the manifest still matches,
// and the output is committed so a bare `npx next build` works.
// scripts/check_app_numbers.py verifies slices against their sources.
//
// Usage: node scripts/build-slices.mjs [--force] [--check]
//   --check  exit 1 if the slices are missing or out of date (writes nothing)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(web, "public", "data");
const OUT = join(DATA, "slices");
const SOURCES = ["calendar_raw_global.parquet", "calendar_harmonized_global.parquet", "params_global.json", "live.json", "season.json"];
/** Bump when the slice format changes, so old output is rebuilt. */
const FORMAT = 3;

const sha = (name) => createHash("sha256").update(readFileSync(join(DATA, name))).digest("hex");
const manifest = { format: FORMAT, sources: Object.fromEntries(SOURCES.filter((n) => existsSync(join(DATA, n))).map((n) => [n, sha(n)])) };
const manifestPath = join(OUT, "manifest.json");
const current = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
const upToDate = current === JSON.stringify(manifest);

if (process.argv.includes("--check")) {
  if (!upToDate) { console.error("data slices are out of date: run `node web/scripts/build-slices.mjs`"); process.exit(1); }
  console.log("data slices: up to date");
  process.exit(0);
}
if (upToDate && !process.argv.includes("--force")) {
  console.log("data slices: up to date");
  process.exit(0);
}

const num = (v) => (typeof v === "bigint" ? Number(v) : v);
const ym = (year, month) => year * 12 + (month - 1);
const readJson = (name) => JSON.parse(readFileSync(join(DATA, name), "utf8"));
const write = (rel, obj) => {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj));
};
async function countryRows(name, columns) {
  const buf = readFileSync(join(DATA, name));
  const file = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  // The files are sorted by scope then key, so the country rows are a prefix; the filter is on the decoded rows.
  const rows = await parquetReadObjects({ file, compressors, columns });
  return rows.filter((r) => r.scope === "country");
}

rmSync(OUT, { recursive: true, force: true });
let files = 0;

/* --- calendars: one file per country, plus the index ------------------- */
if (manifest.sources["calendar_raw_global.parquet"] && manifest.sources["calendar_harmonized_global.parquet"] && manifest.sources["params_global.json"]) {
  const raw = await countryRows("calendar_raw_global.parquet", ["scope", "key", "year", "month", "sensor", "n_detections"]);
  const harm = await countryRows("calendar_harmonized_global.parquet", ["scope", "key", "year", "month", "n_harmonized"]);
  /** key -> { r: { sensor: [ym, n, ym, n, ...] }, h: [ym, v, ...] | null } */
  const by = new Map();
  const entry = (key) => { let e = by.get(key); if (!e) by.set(key, (e = { r: {}, h: null })); return e; };
  let firstYear = Infinity, lastYear = -Infinity, viirsFirstYear = Infinity, firstYm = Infinity, lastYm = -Infinity;
  const seen = new Set();
  for (const r of raw) {
    const year = num(r.year), t = ym(year, num(r.month));
    const id = `${r.key}|${r.sensor}|${t}`;
    if (seen.has(id)) throw new Error(`duplicate raw calendar row ${id}`);
    seen.add(id);
    (entry(r.key).r[r.sensor] ??= []).push(t, num(r.n_detections));
    if (year < firstYear) firstYear = year;
    if (year > lastYear) lastYear = year;
    if (r.sensor === "VIIRS" && year < viirsFirstYear) viirsFirstYear = year;
  }
  const rawKeys = [...by.keys()].sort();
  const harmKeys = new Set();
  for (const r of harm) {
    const t = ym(num(r.year), num(r.month));
    const id = `${r.key}|h|${t}`;
    if (seen.has(id)) throw new Error(`duplicate harmonized calendar row ${id}`);
    seen.add(id);
    const e = entry(r.key);
    (e.h ??= []).push(t, num(r.n_harmonized));
    harmKeys.add(r.key);
    if (t < firstYm) firstYm = t;
    if (t > lastYm) lastYm = t;
  }
  if (!rawKeys.length || !harmKeys.size) throw new Error("the world calendars have no country rows");
  for (const [key, e] of by) { write(join("calendar", `${key}.json`), e); files += 1; }
  write("calendar_index.json", {
    fit_version: readJson("params_global.json").fit_version,
    countries: rawKeys, harmonized: [...harmKeys].sort(),
    first_year: firstYear, last_year: lastYear, viirs_first_year: viirsFirstYear, first_ym: firstYm, last_ym: lastYm,
  });
  files += 1;
}

/* --- params without the Method-only fields ----------------------------- */
if (manifest.sources["params_global.json"]) {
  const p = readJson("params_global.json");
  for (const c of Object.values(p.countries)) {
    delete c.validation_train;
    delete c.drift_era;
    delete c.frozen_era_obs_over_pred;
  }
  write("params_core.json", p);
  files += 1;
}

/* --- live feed without the cell lists ---------------------------------- */
if (manifest.sources["live.json"]) {
  const live = readJson("live.json");
  for (const w of Object.values(live.windows)) delete w.cells;
  write("live_summary.json", live);
  files += 1;
}

/* --- season timing: Chile for the home page, trends for the table, one file per country */
if (manifest.sources["season.json"]) {
  const s = readJson("season.json");
  const { countries, ...head } = s;
  write("season_home.json", { ...head, countries: countries.Chile ? { Chile: countries.Chile } : {} });
  write("season_trends.json", { ...head, countries: Object.fromEntries(Object.entries(countries).map(([k, c]) => { const { years, ...rest } = c; void years; return [k, rest]; })) });
  for (const [k, c] of Object.entries(countries)) { write(join("season", `${k}.json`), c); files += 1; }
  files += 2;
}

writeFileSync(manifestPath, JSON.stringify(manifest));
const bytes = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((n, d) => n + (d.isDirectory() ? bytes(join(dir, d.name)) : readFileSync(join(dir, d.name)).length), 0);
console.log(`data slices: ${files} files, ${(bytes(OUT) / 1024).toFixed(0)} KB -> ${OUT}`);
