"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DriftFile, DriftRow } from "@/lib/data";
import { fmtClock, fmtMinutes, span } from "@/lib/format";
import { isPerfLow } from "@/lib/perf";
import { SAT_COLORS } from "@/lib/sats";

const PLATS = [
  { name: "Terra", sensor: "MODIS", nominal: "10:30" },
  { name: "Aqua", sensor: "MODIS", nominal: "13:30" },
  { name: "Suomi-NPP", sensor: "VIIRS", nominal: "13:30" },
];
const FROZEN: [number, number] = [2012, 2021]; // the frozen-orbit era the harmonization is fitted on (CLAUDE.md)
const FIRST = 2012;

/** Angle of a 24-hour dial with noon at the top. */
const deg = (h: number) => (h / 24) * 360 - 180;
const polar = (h: number, r: number) => {
  const a = ((deg(h) - 90) * Math.PI) / 180;
  return [60 + Math.cos(a) * r, 60 + Math.sin(a) * r];
};
/** SVG arc between two clock times on the dial. */
function arc(h0: number, h1: number, r: number) {
  const [x0, y0] = polar(h0, r), [x1, y1] = polar(h1, r);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

function Dial({ name, sensor, color, lst }: { name: string; sensor: string; color: string; lst: number | undefined }) {
  return (
    <svg viewBox="0 0 120 120" className="mx-auto w-full max-w-[150px]" role="img"
      aria-label={`${name} ${sensor}: mean overpass ${lst == null ? "not available" : fmtClock(lst)} local solar time`}>
      <circle cx="60" cy="60" r="54" fill="var(--surface-1)" stroke="var(--hairline)" />
      {/* Typical daily fire peak, ~12:00–14:00 local solar time. */}
      <path d={arc(12, 14, 47)} fill="none" stroke="var(--seq-2)" strokeWidth="9" strokeOpacity="0.75" />
      {Array.from({ length: 24 }, (_, i) => (
        <line key={i} x1="60" y1="7" x2="60" y2={i % 6 ? 10.5 : 14} stroke="var(--ink)" strokeOpacity={i % 6 ? 0.3 : 0.6} strokeWidth={i % 6 ? 0.8 : 1.2} transform={`rotate(${i * 15} 60 60)`} />
      ))}
      {[[12, "12"], [18, "18"], [0, "0"], [6, "6"]].map(([h, t]) => {
        const [x, y] = polar(h as number, 30);
        return <text key={t} x={x} y={y + 3} textAnchor="middle" fontSize="8.5" fill="var(--text-muted)" className="tabular">{t}</text>;
      })}
      {lst != null && (
        <line x1="60" y1="60" x2="60" y2="15" stroke={color} strokeWidth="3.5" strokeLinecap="round" className="drift-hand"
          style={{ transform: `rotate(${deg(lst).toFixed(2)}deg)` }} />
      )}
      <circle cx="60" cy="60" r="4" fill="var(--ink)" />
    </svg>
  );
}

/**
 * Overpass clocks: each satellite's mean local solar overpass time over a
 * region, per year, measured from the detections (drift.json). The hands move
 * with one CSS transform transition per year step, never per frame.
 */
export function DriftClocks({ drift, country, onCountry, picker = true }: {
  drift: DriftFile | undefined; country: string; onCountry?: (c: string) => void; picker?: boolean;
}) {
  const rows = useMemo<DriftRow[]>(() => drift?.countries?.[country] ?? [], [drift, country]);
  const last = rows.length ? Math.max(...rows.map((r) => r.year)) : 2025;
  const [year, setYear] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const shown = year ?? FIRST;
  const box = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  const at = (p: string, y: number) => rows.find((r) => r.platform === p && r.year === y)?.lst;
  const frozenMean = (p: string) => {
    const v = rows.filter((r) => r.platform === p && r.year >= FROZEN[0] && r.year <= FROZEN[1]).map((r) => r.lst);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };

  // Play once, the first time the clocks scroll into view (skipped for reduced motion / low power: jump to the latest year).
  useEffect(() => {
    const el = box.current;
    if (!el || !rows.length || played.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      played.current = true;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches || isPerfLow();
      if (still) setYear(last); else setPlaying(true);
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, last]);

  // One state change per year, every ~0.55 s.
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      if (year == null) { setYear(FIRST); return; }
      if (year >= last) { setPlaying(false); return; }
      setYear(year + 1);
    }, year == null ? 200 : 550);
    return () => clearTimeout(t);
  }, [playing, year, last]);

  const play = () => { setYear(FIRST); setPlaying(true); };
  const countries = drift ? Object.keys(drift.countries).sort() : [];

  return (
    <div ref={box}>
      <div className="grid gap-4 text-sm leading-relaxed text-[var(--text-secondary)] md:grid-cols-3">
        <p><span className="font-medium text-[var(--text-primary)]">What the hand shows.</span> When each satellite passes over {country}: the average local solar time of its daytime fire detections that year (UTC + longitude ÷ 15, per detection). Noon is at the top.</p>
        <p><span className="font-medium text-[var(--text-primary)]">Why it matters.</span> Fires burn hardest in the early afternoon (shaded). Since 2022 Terra and Aqua have left their fixed orbits: Terra now passes earlier, Aqua later. Each sees a different slice of the day&apos;s fire — an orbital artifact, not a change in fire.</p>
        <p><span className="font-medium text-[var(--text-primary)]">Why Emberline is not exposed.</span> From 2012 the harmonized record is built from Suomi-NPP, which has held its overpass, and the model is fitted on {span(FROZEN[0], FROZEN[1])} only, before the drift began.</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {picker && countries.length > 1 && onCountry && (
          <div className="glass-thin flex flex-wrap p-1" role="group" aria-label="Region">
            {countries.map((c) => (
              <button key={c} type="button" aria-pressed={c === country} onClick={() => onCountry(c)}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${c === country ? "bg-[var(--ink)] text-[#f7f3e8]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{c}</button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={play} disabled={playing || !rows.length} className="glass-thin px-3.5 py-1.5 text-sm font-medium disabled:opacity-50">
            {playing ? "Playing…" : `▶ Play ${FIRST}–${last}`}
          </button>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span className="sr-only">Year</span>
            <input type="range" min={FIRST} max={last} value={shown} disabled={!rows.length}
              onChange={(e) => { setPlaying(false); setYear(Number(e.target.value)); }} className="w-28 accent-[var(--ember)] sm:w-40" />
          </label>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 items-center gap-2 sm:grid-cols-[auto_1fr_1fr_1fr] sm:gap-4">
        <div className="col-span-3 flex items-baseline gap-3 sm:col-span-1 sm:block">
          <p className="display tabular text-6xl text-[var(--ember)] sm:text-7xl" aria-live="polite">{rows.length ? shown : "—"}</p>
          <p className={`text-xs font-medium ${shown > FROZEN[1] ? "text-[var(--ember)]" : "text-[var(--text-muted)]"}`}>{shown > FROZEN[1] ? "drift era (2022 on)" : `frozen orbits (${span(FROZEN[0], FROZEN[1])})`}</p>
        </div>
        {PLATS.map((p) => {
          const color = SAT_COLORS[p.name];
          const now = at(p.name, shown), base = frozenMean(p.name), end = at(p.name, last);
          const moved = base != null && end != null && Math.abs(end - base) > 0.25;
          return (
            <div key={p.name} className="card h-full p-2.5 text-center sm:p-4">
              <Dial name={p.name} sensor={p.sensor} color={color} lst={now} />
              <p className="mt-2 text-[13px] font-medium leading-tight sm:text-sm" style={{ color }}>{p.name} <span className="block text-[var(--text-muted)] sm:inline"><span className="hidden sm:inline">· </span>{p.sensor}</span></p>
              <p className="tabular display text-xl sm:text-2xl">{fmtClock(now)}</p>
              <dl className="tabular mx-auto mt-2 grid max-w-[13rem] grid-cols-[auto_auto] justify-between gap-x-1.5 text-left [&>*]:whitespace-nowrap text-[11px] leading-relaxed text-[var(--text-secondary)] sm:text-xs">
                <dt>{span(FROZEN[0], FROZEN[1] % 100)}</dt><dd className="text-right text-[var(--text-primary)]">{fmtClock(base)}</dd>
                <dt>{last}</dt><dd className="text-right text-[var(--text-primary)]">{fmtClock(end)}</dd>
                <dt>Shift</dt><dd className={`text-right ${moved ? "font-medium text-[var(--ember)]" : ""}`}>{base != null && end != null ? fmtMinutes(end - base) : "—"}</dd>
                <dt className="text-[var(--text-muted)]">Nominal</dt><dd className="text-right text-[var(--text-muted)]">{p.nominal}</dd>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[var(--text-muted)]">
        <span><span className="mr-1.5 inline-block h-2.5 w-5 rounded-sm bg-[var(--seq-2)] align-middle opacity-80" />Shaded: typical daily fire peak, around 13:00 local solar time (published diurnal cycles, Andela et al. 2015)</span>
        <span>Times: measured over {country} from the detections · 2012–21 = mean of the frozen-orbit years · nominal = design overpass, not measured</span>
      </div>
    </div>
  );
}
