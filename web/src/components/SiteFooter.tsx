import Link from "next/link";
import { NAV } from "@/lib/nav";

export function SiteFooter() {
  return (
    <footer className="relative mt-32 px-3 pb-3 text-[#efe9d9] sm:px-6 sm:pb-6">
      <div className="glass-dark mx-auto max-w-6xl !rounded-[32px]">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(217,67,26,0.35),transparent)]" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-10 pt-16 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <p className="display text-4xl text-[#f7f3e8]">Emberline</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#b8b2a2]">
            25 years of satellite fire detections, harmonized across the MODIS–VIIRS sensor break so the sensor no longer matters.
          </p>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-[#b5ab9c]">NASA Space Apps Challenge 2026</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[#b5ab9c]">Team Modulark · Tumkur, India</p>
        </div>
        {NAV.map((g) => (
          <div key={g.label}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#b5ab9c]">{g.label}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {g.items.map((i) => <li key={i.href}><Link href={i.href} className="text-[#e6dfcd] transition-colors hover:text-[#ff9a6b]">{i.label}</Link></li>)}
            </ul>
          </div>
        ))}
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#b5ab9c]">Project</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/about" className="text-[#e6dfcd] hover:text-[#ff9a6b]">About & credits</Link></li>
            <li><a href="https://github.com/shishirbhat/emberline" className="text-[#e6dfcd] hover:text-[#ff9a6b]">Source code</a></li>
            <li><a href="https://www.earthdata.nasa.gov/data/tools/firms" className="text-[#e6dfcd] hover:text-[#ff9a6b]">NASA FIRMS</a></li>
            <li><Link href="/data" className="text-[#e6dfcd] hover:text-[#ff9a6b]">Download the data</Link></li>
          </ul>
        </div>
      </div>
      <div className="relative mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-6 py-6 text-xs text-[#b5ab9c]">
        <p>Active-fire data: NASA FIRMS — MODIS Collection 6.1 (Terra, Aqua), VIIRS 375 m (Suomi-NPP, NOAA-20, NOAA-21). Orbits: public TLEs.</p>
        <p>Not affiliated with or endorsed by NASA. Open source, MIT.</p>
      </div>
      </div>
    </footer>
  );
}
