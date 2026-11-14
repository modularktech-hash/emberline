"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCountryTable, type CountriesFile } from "@/lib/data";
import { getParams } from "@/lib/queries";
import type { Params } from "@/lib/types";
import { fmtCompact } from "@/lib/ember";
import { fmtInt, span } from "@/lib/format";

/**
 * Footer provenance: the harmonized yearly record as a small static bar chart
 * (sum of the processed regions, same unit every year) and the fit it comes
 * from. Loads two small JSON files only once the footer is near the viewport.
 */
export function FooterRecord() {
  const box = useRef<HTMLDivElement>(null);
  const [d, setD] = useState<{ table: CountriesFile; params: Params } | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let live = true;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      Promise.all([getCountryTable(), getParams()])
        .then(([table, params]) => { if (live) setD({ table, params }); })
        .catch(() => { if (live) setFailed(true); });
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, []);

  const series = useMemo(() => {
    if (!d) return [];
    const by = new Map<number, number>();
    for (const c of d.table.countries) for (const a of c.annual) by.set(a.year, (by.get(a.year) ?? 0) + a.harm);
    // From 2003, Aqua's first full year (the harmonized unit is Aqua-equivalent), to the last year the record has.
    return [...by.entries()].filter(([y]) => y >= 2003 && y <= d.params.drift_years[1])
      .sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, v }));
  }, [d]);
  const max = Math.max(1, ...series.map((s) => s.v));
  const shown = series.find((s) => s.year === hover) ?? series[series.length - 1];
  const names = d?.table.countries.map((c) => c.country) ?? [];
  const years = d ? d.table.countries.flatMap((c) => c.annual.map((a) => a.year)) : [];

  return (
    <div ref={box} className="min-w-0">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#b5ab9c]">The record<span aria-hidden className="mx-[0.55em] opacity-55">·</span>harmonized, per year</p>
      {failed && <p className="mt-4 text-sm text-[#b8b2a2]">The data files could not be loaded.</p>}
      {!failed && (
        <>
          <div className="mt-4 flex items-baseline justify-between gap-3">
            <p className="tabular display text-3xl text-[#f7f3e8]">{shown ? fmtInt(shown.v) : "…"}</p>
            <p className="tabular text-sm text-[#b8b2a2]">{shown ? shown.year : ""}</p>
          </div>
          <p className="text-xs text-[#b8b2a2]">Aqua-MODIS-equivalent detections{names.length ? `, summed over ${names.length} countries, each corrected with its own fit` : ""}</p>
          <div className="mt-3 flex h-16 items-end gap-[3px]" onMouseLeave={() => setHover(null)} role="img"
            aria-label={series.length ? `Harmonized yearly detections ${series[0].year} to ${series[series.length - 1].year}, peak ${fmtCompact(max)}` : "Loading the harmonized record"}>
            {(series.length ? series : Array.from({ length: 23 }, (_, i) => ({ year: i, v: 0 }))).map((s) => (
              <span key={s.year} onMouseEnter={() => setHover(s.year)}
                className={`foot-bar flex-1 rounded-t-[3px] ${s.year === shown?.year ? "bg-[var(--ember)]" : "bg-white/25"}`}
                style={{ height: series.length ? `${Math.max(4, (s.v / max) * 100)}%` : "8%" }} title={series.length ? `${s.year}: ${fmtInt(s.v)}` : undefined} />
            ))}
          </div>
          {series.length > 0 && <div className="tabular mt-1 flex justify-between text-[10px] text-[#8f887a]"><span>{series[0].year}</span><span>{series[series.length - 1].year}</span></div>}
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            <dt className="text-[#8f887a]">Countries</dt><dd className="text-[#e6dfcd]">{names.length ? <>{names.length} fitted, {d?.table.not_fitted?.length ?? 0} too sparse to fit (raw only) · <Link href="/data" className="foot-link rounded-md underline-offset-2 hover:underline">list</Link></> : "…"}</dd>
            <dt className="text-[#8f887a]">Years</dt><dd className="tabular text-[#e6dfcd]">{years.length ? span(Math.min(...years), Math.max(...years)) : "…"}</dd>
            <dt className="text-[#8f887a]">Fit</dt><dd className="tabular text-[#e6dfcd]">{d ? <>{d.params.fit_version} · trained {span(d.params.train_years[0], d.params.train_years[1])}, tested {span(d.params.test_years[0], d.params.test_years[1])}</> : "…"}</dd>
          </dl>
          <Link href="/method" className="foot-link mt-4 inline-flex items-center gap-1.5 rounded-md text-sm text-[#e6dfcd]">How it is corrected <span aria-hidden>→</span></Link>
        </>
      )}
    </div>
  );
}
