import Link from "next/link";
import { NSW_REPORT } from "@/lib/reportLink";

/**
 * What the web app is for: the people the challenge names, the question each one brings, and the
 * tool on this site that answers it. Every link opens a working view, not a description.
 */
const CASES: Array<{ who: string; q: string; does: string; href: string; cta: string }> = [
  { who: "Early warning and emergency responders", q: "Is this month unusual for my area?", does: "This month so far against the historical median for the same month, with a verdict and its typical error.", href: "/explorer#this-month", cta: "Check this month" },
  { who: "Land managers and firefighters", q: "When is our critical period?", does: "The fire season, peak month and quietest window for any country or an area you draw on the map.", href: "/explorer#critical", cta: "Find the fire season" },
  { who: "Planners and analysts", q: "How bad was that season, really?", does: "A fire report for any month: its rank among 23 years, times a usual month, and the years most like it.", href: NSW_REPORT, cta: "Open a report" },
  { who: "Scientists", q: "Can I trust a trend across 2012?", does: "One record in one unit from 2003, with raw beside it, held-out tests, and CSV of the calendar and the hotspots.", href: "/method", cta: "See the evidence" },
];

export function UseCases() {
  return (
    <section aria-labelledby="use-title" className="mx-auto max-w-6xl pt-[var(--sec-lg)]" data-testid="use-cases">
      <p className="eyebrow-n font-mono text-[12px] uppercase tracking-[0.18em]">The web app · who it is for</p>
      <h2 id="use-title" className="display mt-3 max-w-3xl text-[clamp(1.8rem,1.2rem+2vw,3rem)] leading-[1.05]">Pick an area. Ask a question. <span className="italic">Get an answer you can take away.</span></h2>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-[var(--text-secondary)]">
        Choose a country, draw your area of interest on the map, or type latitude and longitude, then a date range. Every view downloads: the calendar and the hotspots as CSV, charts, and a brief that opens with the findings.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CASES.map((c, i) => (
          <Link key={c.who} href={c.href} className={`tile group flex flex-col p-5 ${i === 0 ? "tile-ink" : ""}`}>
            <span className={`dot-num text-3xl leading-none ${i === 0 ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`}>0{i + 1}</span>
            <span className={`mt-4 font-mono text-[11px] uppercase tracking-[0.14em] ${i === 0 ? "opacity-70" : "text-[var(--text-muted)]"}`}>{c.who}</span>
            <span className="mt-2 text-[19px] font-medium leading-snug">{c.q}</span>
            <span className={`mt-2 flex-1 text-[13.5px] leading-relaxed ${i === 0 ? "opacity-80" : "text-[var(--text-secondary)]"}`}>{c.does}</span>
            <span className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium">{c.cta} <span aria-hidden className="text-[var(--red)] transition-transform group-hover:translate-x-1">→</span></span>
          </Link>
        ))}
      </div>
    </section>
  );
}
