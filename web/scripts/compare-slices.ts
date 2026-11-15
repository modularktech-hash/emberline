/**
 * Proves the country slices equal the Parquet calendars: for every country and
 * both series, getCalendar read through the slices (first base URL) must
 * return exactly what it returns when read from the Parquet files (second base
 * URL: the same data directory served without slices/).
 *
 * Usage: node --experimental-strip-types web/scripts/compare-slices.ts <baseWithSlices> <baseWithoutSlices>
 */
import { calendarDataset, getCalendar, getParams, listCountries, listHarmonizedCountries, setDataBaseUrl } from "../src/lib/queries.ts";

const [withSlices, without] = process.argv.slice(2);
async function dump(base: string) {
  setDataBaseUrl(base);
  const countries = await listCountries();
  const out: Record<string, unknown> = { dataset: await calendarDataset(), countries, harmonized: await listHarmonizedCountries(), fit: (await getParams()).fit_version };
  for (const c of [...countries, "Atlantis"]) for (const mode of ["raw", "harmonized"] as const) out[`${c}|${mode}`] = await getCalendar({ scope: "country", keys: [c], mode });
  out["multi|harmonized"] = await getCalendar({ scope: "country", keys: ["Portugal", "Spain", "Iceland", "Atlantis"], mode: "harmonized" });
  return out;
}
const a = await dump(withSlices), b = await dump(without);
let bad = 0;
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
  if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { bad += 1; if (bad <= 10) console.log("DIFF", k); }
}
console.log(`${Object.keys(a).length} results compared (${(a.countries as string[]).length} countries x 2 series), ${bad} differ`);
process.exit(bad ? 1 : 0);
