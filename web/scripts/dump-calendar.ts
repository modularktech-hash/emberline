/**
 * Prints, as JSON, what the app's own data layer (src/lib/queries.ts) returns
 * for some countries: yearly raw and harmonized totals from getCalendar, plus
 * which file set loaded. Used by scripts/check_app_numbers.py.
 *
 * Usage: node --experimental-strip-types web/scripts/dump-calendar.ts <dataBaseUrl> <Country> [<Country> ...]
 */
import { calendarDataset, getCalendar, getParams, setDataBaseUrl } from "../src/lib/queries.ts";

const [base, ...countries] = process.argv.slice(2);
setDataBaseUrl(base);
const out: Record<string, unknown> = { dataset: await calendarDataset(), fit_version: (await getParams()).fit_version, countries: {} };
for (const c of countries) {
  const entry: Record<string, unknown> = {};
  for (const mode of ["raw", "harmonized"] as const) {
    const cal = await getCalendar({ scope: "country", keys: [c], mode });
    const years: Record<number, number | null> = {};
    for (const r of cal.rows) {
      if (r.value === null) { if (!(r.year in years)) years[r.year] = null; continue; }
      years[r.year] = (years[r.year] ?? 0) + r.value;
    }
    entry[mode] = { keys: cal.keys, uncorrected: cal.uncorrectedKeys, years };
  }
  (out.countries as Record<string, unknown>)[c] = entry;
}
console.log(JSON.stringify(out));
