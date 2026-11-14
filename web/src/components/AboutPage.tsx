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
  ["VIIRS 375 m (NOAA-20, NOAA-21)", "NASA FIRMS near-real-time feeds, live layer only", [["FIRMS active-fire data", "https://firms.modaps.eosdis.nasa.gov/active_fire/"]]],
  ["MODIS-to-VIIRS transition", "NASA LAADS overview of the sensor change", [["LAADS PDF", "https://ladsweb.modaps.eosdis.nasa.gov/learn/modis-to-viirs-transition/MODIS-VIIRS_Transition.pdf"]]],
  ["Orbital elements (TLEs)", "Public CelesTrak elements via tle.ivanstanojevic.me", [["CelesTrak", "https://celestrak.org/"], ["TLE API", "https://tle.ivanstanojevic.me/"]]],
  ["Fire diurnal cycle parameters", "Andela et al. (2015), Atmos. Chem. Phys. 15, 8831–8846, Table 1 — illustration only", [["doi:10.5194/acp-15-8831-2015", "https://doi.org/10.5194/acp-15-8831-2015"]]],
  ["MODIS FRP detection thresholds (9–11 MW)", "Laurent et al. (2019), Biogeosciences 16, 275–288, citing Roberts & Wooster (2008) and Schroeder et al. (2010) — \u201cthresholds of FRP detection\u201d, a sanity check only", [["Laurent et al. 2019", "https://bg.copernicus.org/articles/16/275/2019/"]]],
  ["Country outlines", "Natural Earth 1:110m (public domain)", [["naturalearthdata.com", "https://www.naturalearthdata.com/"]]],
  ["Basemap", "OpenFreeMap / OpenMapTiles, © OpenStreetMap contributors", [["OpenFreeMap", "https://openfreemap.org/"], ["OpenStreetMap", "https://www.openstreetmap.org/copyright"]]],
];

export function AboutPage() {
  const step = stepSummary();
  return (
    <div>
      <PageHead eyebrow="About · NASA Space Apps Challenge 2026" title="Built in 48 hours," italic="for people who study fire."
        lede="Emberline answers the challenge “MODIS and VIIRS hot spots”: harmonize the satellite fire record to reduce the discontinuity between the MODIS and VIIRS records, and turn it into a burning activity calendar for any fitted country or drawn area." />
      <div className="grid gap-6 lg:grid-cols-3">
        {[
          ["The problem", `From 2012 a sharper satellite sensor began detecting small fires the old one could not. Raw fire records jumped${step.median != null ? ` — by a median ${fmtRatio(step.median)} (2012–14 over 2009–11) across the ${step.n} countries with their own fit —` : ""} much of the apparent increase reflects improved detection sensitivity rather than an equivalent increase in fire activity.`],
          ["What we built", `A detection-probability model, fitted per country on 2012–2018 and tested on 2019–2021, that converts every VIIRS detection into what MODIS would have seen. Regional fits, no global step correction: ${fitCountsPhrase()}. Then a calendar, insights, a live globe and open data on top.`],
          ["Who it is for", "A regional analyst checks whether a past season was unusually active, compares its timing with earlier years, and exports comparable evidence as CSV. Historical analysis, not an operational fire alert."],
        ].map(([t, d], i) => (
          <Reveal key={t} delay={i * 0.06}><div className="card h-full p-6"><p className="display text-3xl">{t}</p><p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{d}</p></div></Reveal>
        ))}
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
            <h2 className="display text-4xl">Use of AI</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              We used Anthropic&apos;s Claude (via Claude Code) as a coding and research assistant: for literature research and planning, for writing and debugging the data pipeline and this web application, and for drafting documentation. The scientific choices — the harmonization approach, the 2012–2021 frozen-orbit window (trained 2012–2018, tested 2019–2021), the validation design — and every reported number come from our own analysis of NASA FIRMS data, run and checked by the team. No AI-generated images, video or audio are used.
            </p>
          </section>
        </Reveal>
        <Reveal delay={0.06}>
          <section className="card h-full p-6 sm:p-8">
            <h2 className="display text-4xl">Team Modulark</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">A small lab in Tumkur, Karnataka. Emberline is open source under the MIT license.</p>
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
