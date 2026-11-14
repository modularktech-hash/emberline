import Link from "next/link";
import { NAV } from "@/lib/nav";
import { FooterRecord } from "@/components/FooterRecord";

const PROJECT = [
  { href: "/about", label: "About & credits", ext: false },
  { href: "/data", label: "Download the data", ext: false },
  { href: "https://github.com/shishirbhat/emberline", label: "Source code", ext: true },
  { href: "https://www.earthdata.nasa.gov/data/tools/firms", label: "NASA FIRMS", ext: true },
];
const GROUPS = [...NAV.map((g) => ({ label: g.label, items: g.items.map((i) => ({ href: i.href, label: i.label, ext: false })) })), { label: "Project", items: PROJECT }];

const label = "font-mono text-[11px] uppercase tracking-[0.2em] text-[#b5ab9c]";
const link = "foot-link inline-flex items-center gap-1.5 rounded-md py-0.5 text-[#e6dfcd]";

function Links({ items }: { items: (typeof GROUPS)[number]["items"] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((i) => (
        <li key={i.href}>
          {i.ext
            ? <a href={i.href} target="_blank" rel="noopener noreferrer" className={link}>{i.label}<span aria-hidden className="foot-arrow">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
            : <Link href={i.href} className={link}>{i.label}<span aria-hidden className="foot-arrow">→</span></Link>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Site footer: site map (grouped like the nav, collapsible on phones), data
 * provenance with a small static chart of the harmonized record, back to top
 * (a plain #top anchor: native scrolling, no script) and the maker's credit.
 */
export function SiteFooter() {
  return (
    <footer className="relative mt-32 px-3 pb-3 text-[#efe9d9] sm:px-6 sm:pb-6">
      <div className="glass-dark mx-auto max-w-6xl !rounded-[32px]">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(217,67,26,0.35),transparent)]" />

        <div className="relative flex flex-wrap items-end justify-between gap-6 border-b border-white/10 px-6 pb-8 pt-12 sm:px-10">
          <div>
            <p className="display text-4xl text-[#f7f3e8] sm:text-5xl">Emberline</p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[#b8b2a2]">
              25 years of satellite fire detections, harmonized across the MODIS–VIIRS sensor break so the sensor no longer matters.
            </p>
          </div>
          <a href="#top" className="foot-top group inline-flex items-center gap-3 rounded-full border border-white/15 px-5 py-2.5 text-sm text-[#f7f3e8]">
            Back to top
            <span aria-hidden className="foot-top-arrow inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ember)] text-white">↑</span>
          </a>
        </div>

        <div className="relative grid gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[1.25fr_2fr]">
          <FooterRecord />

          <nav aria-label="Site map">
            {/* Phones: each group collapses. */}
            <div className="divide-y divide-white/10 border-y border-white/10 md:hidden">
              {GROUPS.map((g) => (
                <details key={g.label} className="foot-group group">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-3.5">
                    <span className={label}>{g.label}</span>
                    <span aria-hidden className="foot-plus text-lg leading-none text-[#b5ab9c]">+</span>
                  </summary>
                  <div className="pb-4"><Links items={g.items} /></div>
                </details>
              ))}
            </div>
            {/* Wider screens: all groups open. */}
            <div className="hidden gap-8 md:grid md:grid-cols-4">
              {GROUPS.map((g) => (
                <div key={g.label}>
                  <p className={label}>{g.label}</p>
                  <div className="mt-4"><Links items={g.items} /></div>
                </div>
              ))}
            </div>
          </nav>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/10 px-6 py-6 text-xs text-[#b5ab9c] sm:px-10">
          <p className="max-w-2xl leading-relaxed">
            Active-fire data: NASA FIRMS — MODIS Collection 6.1 (Terra, Aqua), VIIRS 375 m (Suomi-NPP; NOAA-20 and NOAA-21 for the live layer only). Orbits: public TLEs. Not affiliated with or endorsed by NASA. Open source, MIT. NASA Space Apps Challenge 2026 · Team Modulark, Tumkur, India.
          </p>
          <a href="https://modularktech.com" target="_blank" rel="noopener noreferrer" className="foot-maker group inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-[#efe9d9]">
            <span className="text-[#b5ab9c]">Made by</span> <span className="font-semibold text-[#f7f3e8]">Modulark</span>
            <span aria-hidden className="foot-arrow">↗</span><span className="sr-only"> (modularktech.com, opens in a new tab)</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
