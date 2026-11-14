import Link from "next/link";
import { PageHead, Reveal } from "@/components/ui";

const SOURCES = [
  ["MODIS Collection 6.1 active fires (Terra, Aqua)", "NASA FIRMS country archive, 2001–2025, and near-real-time feed"],
  ["VIIRS 375 m active fires (Suomi-NPP)", "NASA FIRMS country archive, 2012–2025"],
  ["VIIRS 375 m (NOAA-20, NOAA-21)", "NASA FIRMS near-real-time feeds, live layer only"],
  ["Orbital elements (TLEs)", "Public CelesTrak elements via tle.ivanstanojevic.me"],
  ["Fire diurnal cycle parameters", "Andela et al. (2015), Atmos. Chem. Phys. 15, 8831–8846, Table 1 — illustration only"],
  ["MODIS FRP detection thresholds (9–11 MW)", "Laurent et al. (2019), Biogeosciences 16, 275–288, citing Roberts & Wooster (2008) and Schroeder et al. (2010) — sanity check only"],
  ["Country outlines", "Natural Earth 1:110m (public domain)"],
  ["Basemap", "OpenFreeMap / OpenMapTiles, © OpenStreetMap contributors"],
];

export function AboutPage() {
  return (
    <div>
      <PageHead eyebrow="About · NASA Space Apps Challenge 2026" title="Built in 48 hours," italic="for the people who fight fires."
        lede="Emberline answers the challenge “MODIS and VIIRS hot spots”: harmonize the satellite fire record so the sensor no longer matters, and turn it into a burning activity calendar for any area." />
      <div className="grid gap-6 lg:grid-cols-3">
        {[
          ["The problem", "From 2012 a sharper satellite sensor began detecting small fires the old one could not. Raw fire records jumped — by 1.5× to 6.6× in our regions — though the fires did not."],
          ["What we built", "A detection-probability model, fitted on 2012–2018 and tested on 2019–2021, that converts every VIIRS detection into what MODIS would have seen. Then a calendar, insights, a live globe and open data on top."],
          ["Who it is for", "Early-warning and emergency responders, land managers, firefighters and scientists who need to know whether this season is unusual — in a record that holds still."],
        ].map(([t, d], i) => (
          <Reveal key={t} delay={i * 0.06}><div className="card h-full p-6"><p className="display text-3xl">{t}</p><p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{d}</p></div></Reveal>
        ))}
      </div>
      <Reveal>
        <section className="card mt-8 p-6 sm:p-8">
          <h2 className="display text-4xl">Data & credits</h2>
          <table className="mt-5 w-full text-sm">
            <tbody>{SOURCES.map(([a, b]) => <tr key={a} className="border-t border-[var(--hairline)] align-top"><td className="py-3 pr-6 font-medium">{a}</td><td className="py-3 text-[var(--text-secondary)]">{b}</td></tr>)}</tbody>
          </table>
        </section>
      </Reveal>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <section className="card h-full p-6 sm:p-8">
            <h2 className="display text-4xl">Use of AI</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              We used Anthropic&apos;s Claude (via Claude Code) as a coding and research assistant: for literature research and planning, for writing and debugging the data pipeline and this web application, and for drafting documentation. The scientific choices — the harmonization approach, the 2012–2021 fitting window, the validation design — and every reported number come from our own analysis of NASA FIRMS data, run and checked by the team. No AI-generated images, video or audio are used.
            </p>
          </section>
        </Reveal>
        <Reveal delay={0.06}>
          <section className="card h-full p-6 sm:p-8">
            <h2 className="display text-4xl">Team Modulark</h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">A small lab in Tumkur, Karnataka. Emberline is open source under the MIT license.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="https://github.com/shishirbhat/emberline" className="pill-dark px-5 py-2.5 text-sm font-medium">Source on GitHub</a>
              <Link href="/method" className="glass-thin px-5 py-2.5 text-sm font-medium">Read the method</Link>
            </div>
            <p className="mt-6 text-xs text-[var(--text-muted)]">Not affiliated with or endorsed by NASA. No NASA logos or insignia are used.</p>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
