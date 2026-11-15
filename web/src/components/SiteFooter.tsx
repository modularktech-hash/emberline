"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DotWordmark } from "@/components/DotWordmark";
import { FooterRecord } from "@/components/FooterRecord";
import { getLiveSummary } from "@/lib/data";
import { fmtUtc, parseUtc } from "@/lib/format";
import { NAV } from "@/lib/nav";
import { getParams } from "@/lib/queries";
import { getMonthToDate } from "@/components/MonthToDate";

type Item = { href: string; label: string; ext?: boolean };
const GH = "https://github.com/modularktech-hash/emberline";
const page = (label: string) => NAV.find((g) => g.label === label)!.items.map((i) => ({ href: i.href, label: i.label }));
const COLUMNS: Array<{ label: string; items: Item[] }> = [
  { label: "Story", items: [{ href: "/#problem", label: "01 Problem" }, { href: "/#repair", label: "02 Repair" }, { href: "/#proof", label: "03 Proof" }, { href: "/#area", label: "04 Your area" }, { href: "/#now", label: "05 Now" }] },
  { label: "Explore", items: [...page("Explore"), ...page("Live")] },
  { label: "Data and downloads", items: [{ href: "/data", label: "Every table and download" }, { href: "/data#journey", label: "The data journey" }, { href: "/lab", label: "Lab calculators" }, { href: "/data/manifest.json", label: "manifest.json", ext: true }] },
  { label: "Method and proof", items: [{ href: "/method", label: "How the repair works" }, { href: "/method#proof", label: "Proof: benchmarks and blind tests" }, { href: "/about", label: "Limits and credits" }] },
  { label: "Sources", items: [
    { href: "https://www.earthdata.nasa.gov/data/tools/firms", label: "NASA FIRMS (MODIS C6.1, VIIRS 375 m)", ext: true },
    { href: "https://firms.modaps.eosdis.nasa.gov/api/", label: "FIRMS NRT and area API", ext: true },
    { href: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api", label: "NASA GIBS imagery", ext: true },
    { href: "https://eonet.gsfc.nasa.gov/", label: "NASA EONET events", ext: true },
    { href: "https://celestrak.org/", label: "CelesTrak TLEs", ext: true },
    { href: "https://www.naturalearthdata.com/", label: "Natural Earth outlines", ext: true },
  ] },
  { label: "Project", items: [{ href: `${GH}/blob/main/CITATION.cff`, label: "Cite (CITATION.cff)", ext: true }, { href: GH, label: "GitHub repository", ext: true }, { href: "/about#team", label: "The team" }] },
];

function Links({ items }: { items: Item[] }) {
  return (
    <ul className="space-y-2 text-[14px]">
      {items.map((i) => (
        <li key={i.href + i.label}>
          {i.ext
            ? <a href={i.href} target="_blank" rel="noopener noreferrer" className="foot-link inline-flex items-center gap-1.5 py-0.5">{i.label}<span aria-hidden className="foot-arrow">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
            : <Link href={i.href} className="foot-link inline-flex items-center gap-1.5 py-0.5">{i.label}<span aria-hidden className="foot-arrow">→</span></Link>}
        </li>
      ))}
    </ul>
  );
}

/** Fit version, last data update and live-feed time, each read from its data file once the footer is near. */
function StatusLine() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [s, setS] = useState<{ fit?: string; data?: string; live?: string }>({});
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      getParams().then((p) => setS((v) => ({ ...v, fit: p.fit_version }))).catch(() => {});
      getLiveSummary().then((l) => setS((v) => ({ ...v, live: fmtUtc(parseUtc(l.fetched_utc)) }))).catch(() => {});
      getMonthToDate().then((m) => { if (m) setS((v) => ({ ...v, data: fmtUtc(parseUtc(m.generated_utc)) })); });
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const cell = (k: string, v?: string) => <span className="inline-flex items-center gap-2"><span>{k}</span><span className="tabular text-[var(--text-primary)]">{v ?? "not recorded"}</span></span>;
  return (
    <p ref={ref} className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--text-muted)]" data-testid="status-line">
      <span className="live-dot" aria-hidden />{cell("Fit", s.fit)}{cell("Month-to-date data", s.data)}{cell("Live feed", s.live)}
    </p>
  );
}

/**
 * Footer: the interactive wordmark, the harmonized record chart, the site in six columns
 * (collapsible on phones), a status line read from the data, and the credits.
 */
export function SiteFooter({ counts = null }: { counts?: { own: number; borrowed: number } | null }) {
  return (
    <footer className="relative mt-[var(--sec-lg)] border-t-[length:var(--stroke)] border-[var(--hairline)] bg-[var(--surface)]">
      <div className="mx-auto max-w-6xl px-5 pb-8 pt-10 sm:px-8 sm:pt-14">
        <DotWordmark />
        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-xl text-[15px] leading-relaxed text-[var(--text-secondary)]">
            Switching satellites in 2012 broke the fire record. Emberline repairs it{counts ? `: ${counts.own} countries with their own fitted curve, ${counts.borrowed} on a borrowed curve` : ""}. Archive 2001–2025; harmonized record 2003–2025; the live layer is a different platform and is never corrected.
          </p>
          <a href="#top" className="foot-top glass-thin group inline-flex items-center gap-3 px-5 py-2.5 font-mono text-[11.5px] uppercase tracking-[0.14em]">
            Back to top <span aria-hidden className="foot-top-arrow inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--on-ink)]">↑</span>
          </a>
        </div>

        <div className="mt-10 grid gap-10 border-t-[length:var(--stroke)] border-[var(--hairline)] pt-10 lg:grid-cols-[1fr_2.2fr]">
          <FooterRecord />
          <nav aria-label="Site map">
            <div className="md:hidden">
              {COLUMNS.map((g) => (
                <details key={g.label} className="foot-group group border-b-[length:var(--stroke)] border-[var(--hairline)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-3.5"><span className="eyebrow">{g.label}</span><span aria-hidden className="foot-plus font-mono text-lg leading-none text-[var(--text-muted)]">+</span></summary>
                  <div className="pb-4"><Links items={g.items} /></div>
                </details>
              ))}
            </div>
            <div className="hidden gap-x-8 gap-y-10 md:grid md:grid-cols-3">
              {COLUMNS.map((g) => (<div key={g.label}><p className="eyebrow">{g.label}</p><div className="mt-4"><Links items={g.items} /></div></div>))}
            </div>
          </nav>
        </div>

        <div className="mt-10 border-t-[length:var(--stroke)] border-[var(--hairline)] pt-6"><StatusLine /></div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          <p className="max-w-3xl">
            NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots · Team Modulark, Tumkur, India. Active-fire data: NASA FIRMS. Not affiliated with or endorsed by NASA. Open source, MIT.
          </p>
          <a href="https://modularktech.com" target="_blank" rel="noopener noreferrer" className="foot-maker glass-thin group inline-flex items-center gap-2 px-4 py-2 text-[13px] text-[var(--text-primary)]">
            <span className="opacity-60">Made by</span> <span className="font-semibold">Modulark</span><span aria-hidden className="foot-arrow">↗</span><span className="sr-only"> (modularktech.com, opens in a new tab)</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
