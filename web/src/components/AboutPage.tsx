import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fitCountsPhrase } from "@/lib/fitCounts";
import { PageHead, Reveal } from "@/components/ui";
import { median } from "@/lib/ember";
import { fmtRatio } from "@/lib/format";
import type { CountriesFile } from "@/lib/data";

/** Read at build time from the published summary, so the sentence below is computed, not typed. */
function stepSummary(): { median: number | null; n: number } {
  try {
    const t = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "countries.json"), "utf8")) as CountriesFile;
    const own = t.countries.filter((c) => c.fit_source !== "pooled" && Number.isFinite(c.step_raw));
    return { median: median(own.map((c) => c.step_raw)), n: own.length };
  } catch {
    return { median: null, n: 0 };
  }
}

const SOURCES: Array<[string, string, Array<[string, string]>]> = [
  ["MODIS Collection 6.1 active fires (Terra, Aqua)", "NASA FIRMS country archive, 2001–2025, and near-real-time feed", [["FIRMS download", "https://firms.modaps.eosdis.nasa.gov/download/"], ["country archive", "https://firms.modaps.eosdis.nasa.gov/country/"]]],
  ["VIIRS 375 m active fires (Suomi-NPP)", "NASA FIRMS country archive, 2012–2025", [["FIRMS download", "https://firms.modaps.eosdis.nasa.gov/download/"]]],
  ["VIIRS 375 m active fires (NOAA-20)", "NASA FIRMS country archive (viirs-jpss1), 2018–2023: fits and tests the NOAA-20 to Suomi-NPP bridge", [["country archive", "https://firms.modaps.eosdis.nasa.gov/country/"]]],
  ["VIIRS 375 m (NOAA-20, NOAA-21)", "NASA FIRMS near-real-time feeds: live layer, and the current month", [["FIRMS active-fire data", "https://firms.modaps.eosdis.nasa.gov/active_fire/"]]],
  ["MODIS-to-VIIRS transition", "NASA LAADS overview of the sensor change", [["LAADS PDF", "https://ladsweb.modaps.eosdis.nasa.gov/learn/modis-to-viirs-transition/MODIS-VIIRS_Transition.pdf"]]],
  ["Orbital elements (TLEs)", "Public CelesTrak elements via tle.ivanstanojevic.me", [["CelesTrak", "https://celestrak.org/"], ["TLE API", "https://tle.ivanstanojevic.me/"]]],
  ["Fire diurnal cycle parameters", "Andela et al. (2015), Atmos. Chem. Phys. 15, 8831–8846, Table 1 — illustration only", [["doi:10.5194/acp-15-8831-2015", "https://doi.org/10.5194/acp-15-8831-2015"]]],
  ["MODIS FRP detection thresholds (9–11 MW)", "Laurent et al. (2019), Biogeosciences 16, 275–288, citing Roberts & Wooster (2008) and Schroeder et al. (2010) — \u201cthresholds of FRP detection\u201d, a sanity check only", [["Laurent et al. 2019", "https://bg.copernicus.org/articles/16/275/2019/"]]],
  ["Current month to date", "NASA FIRMS area API (MODIS_NRT, VIIRS_NOAA20_NRT), provisional; raw, or harmonized through the NOAA-20 bridge where it passed", [["FIRMS API", "https://firms.modaps.eosdis.nasa.gov/api/"]]],
  ["Satellite imagery (optional map layer)", "NASA GIBS / EOSDIS, NOAA-20 VIIRS corrected reflectance true colour", [["NASA GIBS", "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api"]]],
  ["Wildfire events (optional globe layer)", "NASA EONET API v3, open events in the Wildfires category — curated, a different source from FIRMS", [["NASA EONET", "https://eonet.gsfc.nasa.gov/"]]],
  ["Country outlines and areas", "Natural Earth 1:110m (public domain): hotspot and month-to-date membership, approximate land areas", [["naturalearthdata.com", "https://www.naturalearthdata.com/"]]],
  ["Basemap", "OpenFreeMap / OpenMapTiles, © OpenStreetMap contributors", [["OpenFreeMap", "https://openfreemap.org/"], ["OpenStreetMap", "https://www.openstreetmap.org/copyright"]]],
];

/** Same wording as README.md. */
const AI_DISCLOSURE =
  "Shishir Bhat and Ridhan Teli have worked on this problem for about a year. Every scientific choice — the method, what to fit, the validation design and how to interpret the results — was made by the team. We used Claude, by Anthropic, through Claude Code to build it under our direction: during the event it wrote the code, ran the data pipeline and the fit we specified, tested the results and drafted documentation; before the event it also assisted with literature research and planning. Before the event we prepared planning and research documents, verified data schemas, the FIRMS ingest package and download scripts, and an empty app scaffold; these were imported into this repository in its first commit at the start of the event. The harmonization, the fit, the validation and the web app were built during the event, 14–15 Nov, as the git history shows. No AI-generated images, video or audio are used.";

/** G5: each requirement of the official brief (docs/challenge-statement.md R1–R12) and where it is answered. */
const BRIEF: Array<[string, string, string, string, "done" | "partial", string?]> = [
  ["R1", "Harmonize MODIS and VIIRS into one comparable series", "/method", "Method: per-country detection model, tested on held-out years", "done", "regional fits; smaller countries borrow a pooled curve and the sparsest have no fit (counts on Method)"],
  ["R2", "A burning activity calendar from active-fire hotspots", "/explorer", "Explorer: month × year calendar", "done"],
  ["R3", "Number of hotspots from the early 2000s to the present", "/explorer", "Explorer: raw 2001–2025, harmonized 2003–2025", "partial", "2026 only as provisional raw counts in “This month so far”, for the countries loaded"],
  ["R4", "Which months and years had the highest activity", "/explorer", "Explorer: calendar and busiest-year readout", "done"],
  ["R5", "Current month against the historical median", "/explorer#this-month", "Explorer and Seasons: “This month so far” for 166 of 171 fitted countries and any drawn area, against the median of the chosen years", "done", "provisional, raw, near-real-time, no vegetation-type filter, platform by platform (NOAA-20 vs Suomi-NPP; drifting MODIS); never a harmonized anomaly"],
  ["R6", "Historical patterns, unusual conditions, critical periods", "/seasons", "Seasons (each month against its history), Trends (season timing)", "done"],
  ["R7", "Select an area of interest", "/explorer", "Explorer: any country, a drawn box or polygon, or typed bounds", "done", "an area resolves to the ~45 km grid cells whose centre lies inside it (shown, with the country files they come from)"],
  ["R8", "Select a specific date range", "/explorer", "Explorer: start and end month; points download by day", "done", "calendar, totals, this-month median and every download follow the range"],
  ["R9", "Downloadable CSV of hotspots from a search", "/explorer", "Explorer: individual detections for the area and any dates (up to 31 days per file, archive or near-real-time), cell-level CSV for any month range, 7-day cells", "done", "points come from NASA FIRMS through this site's server; each file says points or cells, raw or harmonized"],
  ["R10", "Accessible colour ramps", "/explorer", "Every ramp and palette checked for colour-vision deficiency, lightness order and text contrast (scripts/check_color_access.py, docs/color-accessibility.md)", "done"],
  ["R11", "Draw the area on a map or enter latitude and longitude", "/explorer", "Explorer: draw a box or polygon on the map, or type the four bounds", "done"],
  ["R12", "Download analytics and visualizations", "/data", "Explorer: calendar and chart as SVG or PNG, analytics JSON, calendar and cell CSV, HTML brief; open Parquet and JSON files on Data", "done"],
];

export function AboutPage() {
  const step = stepSummary();
  return (
    <div>
      <PageHead eyebrow="About · NASA Space Apps Challenge 2026" title="Built in 48 hours," italic="for people who study fire."
        lede="Emberline answers the challenge “MODIS and VIIRS hot spots”: harmonize the satellite fire record to reduce the discontinuity between the MODIS and VIIRS records, and turn it into a burning activity calendar for any fitted country or drawn area." />
      <Reveal><section className="card mb-8 min-w-0 p-5 sm:p-6" data-testid="brief-checklist">
        <h2 className="display text-2xl">Challenge brief → Emberline</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Each ask in the official brief, where it is answered, and how completely.</p>
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Challenge brief checklist">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 pr-3 font-normal">#</th><th className="px-3 font-normal">The brief asks for</th><th className="px-3 font-normal">Where</th><th className="px-3 font-normal">Status</th></tr></thead>
            <tbody>
              {BRIEF.map(([id, ask, href, where, status, why]) => (
                <tr key={id} className="border-t border-[var(--hairline)] align-top">
                  <td className="py-2.5 pr-3 font-mono text-xs text-[var(--text-muted)]">{id}</td>
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">{ask}</td>
                  <td className="px-3 py-2.5"><Link href={href} className="link-ul">{where}</Link></td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)]"><span className={status === "done" ? "text-[var(--ember)]" : "text-[var(--text-primary)]"}>{status}</span>{why ? <span className="block text-xs text-[var(--text-muted)]">{why}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section></Reveal>
      <div className="grid gap-6 lg:grid-cols-3">
        {[
          ["The problem", `From 2012 a sharper satellite sensor began detecting small fires the old one could not. Raw fire records jumped${step.median != null ? ` — by a median ${fmtRatio(step.median)} (2012–14 over 2009–11) across the ${step.n} countries with their own fit —` : ""} much of the apparent increase reflects improved detection sensitivity rather than an equivalent increase in fire activity.`],
          ["What we built", `A detection-probability model, fitted per country on 2012–2018 and tested on 2019–2021, that converts every VIIRS detection into what MODIS would have seen. Regional fits, no global step correction: ${fitCountsPhrase()}. Then a calendar, insights, a live globe and open data on top.`],
          ["Who it is for", "A regional analyst checks whether a past season was unusually active, compares its timing with earlier years, and exports comparable evidence as CSV. Historical analysis, not an operational fire alert."],
        ].map(([t, d], i) => (
          <Reveal key={t} delay={i * 0.06}><div className="card h-full p-6"><p className="display text-3xl">{t}</p><p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{d}</p></div></Reveal>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <section className="card h-full p-6 sm:p-8">
            <h2 className="display text-4xl">Evidence</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">Every number on this site comes from our own fit of NASA FIRMS data, computed during the event: trained on 2012–2018 and tested on the held-out 2019–2021 years. The per-country accuracy, the step before and after correction and the validation design are on the Method page; the per-country tables and downloads are on the Data page.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/method" className="glass-thin px-5 py-2.5 text-sm font-medium">Validation and method</Link>
              <Link href="/data" className="glass-thin px-5 py-2.5 text-sm font-medium">Data and downloads</Link>
            </div>
          </section>
        </Reveal>
        <Reveal delay={0.06}>
          <section className="card h-full p-6 sm:p-8">
            <h2 className="display text-4xl">Limitations</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
              <li>The fit uses 2012–2021 only. Terra and Aqua left their frozen orbits in 2022, so later years are a holdout and carry an orbital-drift caveat.</li>
              <li>The value is regional, not global: the sensor break may be undetectable above natural variation at global scale.</li>
              <li>Countries without enough data use a borrowed (pooled) curve, and cells without a published fit show raw sums flagged as uncorrected.</li>
              <li>The live layer is NOAA-20/21 VIIRS, a different platform from the historical Suomi-NPP record. Historical analysis, not an operational fire alert.</li>
            </ul>
          </section>
        </Reveal>
      </div>
      <Reveal>
        <section className="card mt-8 p-6 sm:p-8">
          <h2 className="display text-4xl">Data & credits</h2>
          <table className="mt-5 w-full text-sm">
            <tbody>{SOURCES.map(([a, b, links]) => <tr key={a} className="border-t border-[var(--hairline)] align-top"><td className="py-3 pr-6 font-medium">{a}</td><td className="py-3 text-[var(--text-secondary)]">{b}{links.map(([l, u]) => <span key={u}> · <a href={u} target="_blank" rel="noopener noreferrer" className="link-ul text-[var(--text-primary)]">{l}</a></span>)}</td></tr>)}</tbody>
          </table>
        </section>
      </Reveal>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <section className="card h-full p-6 sm:p-8">
            <h2 className="display text-4xl">Use of AI and work history</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              {AI_DISCLOSURE}
            </p>
          </section>
        </Reveal>
        <Reveal delay={0.06}>
          <section className="card h-full p-6 sm:p-8">
            <h2 className="display text-4xl">Team Modulark</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">Shishir Bhat</span> and <span className="font-medium text-[var(--text-primary)]">Ridhan Teli</span>.</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">A small lab in Tumkur, Karnataka. Emberline is open source under the MIT license.</p>
            <ul className="mt-4 space-y-1 text-sm">
              <li>Project: <a href="https://github.com/modularktech-hash/emberline" target="_blank" rel="noopener noreferrer" className="link-ul break-all">github.com/modularktech-hash/emberline</a></li>
              <li>Colour accessibility evidence: <a href="https://github.com/modularktech-hash/emberline/blob/main/docs/color-accessibility.md" target="_blank" rel="noopener noreferrer" className="link-ul">docs/color-accessibility.md</a></li>
              <li>Challenge: <a href="https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/" target="_blank" rel="noopener noreferrer" className="link-ul">Harmonization of MODIS and VIIRS hot spots</a> (NASA Space Apps 2026)</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="https://github.com/modularktech-hash/emberline" className="pill-dark px-5 py-2.5 text-sm font-medium">Source on GitHub</a>
              <Link href="/method" className="glass-thin px-5 py-2.5 text-sm font-medium">Read the method</Link>
            </div>
            <p className="mt-6 text-xs text-[var(--text-muted)]">Not affiliated with or endorsed by NASA. No NASA logos or insignia are used.</p>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
