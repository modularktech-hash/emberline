"use client";

/**
 * Home: one story in five chapters. Problem (the 2012 jump), Repair (raw becomes harmonized),
 * Proof (three blind checks), Your area (the calendar and a plain verdict) and Now (this month
 * and the live layer). Each chapter is one headline, one sentence, one visual and at most three
 * figures; everything else sits behind an expander or an "i". Every number is read from the
 * published data files.
 */
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CountryPicker } from "@/components/CountryPicker";
import { DataJourney } from "@/components/DataJourney";
import { DotClock, useToday } from "@/components/DotMatrix";
import { DriftClocks } from "@/components/DriftClocks";
import { Eyebrow } from "@/components/Figure";
import { MonthUnusualPanel } from "@/components/MonthToDate";
import { MonthYearCalendar } from "@/components/MonthYearCalendar";
import { PaperCutout } from "@/components/PaperCutout";
import { StepCollapse } from "@/components/Proof";
import { DotDigits, DotSkeleton, Expand, Failed, InfoDot, Pill, Reveal, SectionHead, SourceChip, StatTile, Tile } from "@/components/ui";
import { getCountryTable, getDrift, getLive, getLiveSummary, getProof, getSeasonHome, getTle, type CountryRow, type DriftFile } from "@/lib/data";
import { annualTotals, median } from "@/lib/ember";
import { fmtAge, fmtClock, fmtInt, fmtNum, fmtR2, fmtRatio, fmtSigned, fmtUtc, parseUtc, span } from "@/lib/format";
import { ALL } from "@/lib/nav";
import { ORIGINAL_FOUR, prettyName } from "@/lib/names";
import { getParams } from "@/lib/queries";
import type { Params } from "@/lib/types";
import { useAreaData } from "@/lib/useArea";
import { useParquet } from "@/lib/useParquet";

const FireGlobe = dynamic(() => import("@/components/FireGlobe"), { ssr: false });

/** Headline accuracy, computed from the fit: median over own-fit countries, and the single best country. */
export function accuracySummary(p: Params | undefined) {
  if (!p) return null;
  const names = Object.keys(p.countries);
  const own = names.filter((n) => p.countries[n].fit_source !== "pooled");
  if (!own.length) return null;
  const r2 = (n: string) => p.countries[n].validation_test.model.r2;
  const best = own.reduce((a, n) => (r2(n) > r2(a) ? n : a), own[0]);
  return {
    fitted: names.length, own: own.length,
    medianR2: median(own.map(r2)),
    best, bestR2: r2(best), bestRaw: p.countries[best].validation_test.raw_viirs.r2,
    beats: names.filter((n) => r2(n) > p.countries[n].validation_test.raw_viirs.r2).length,
  };
}

/** With prefers-reduced-motion, scroll-linked effects read a fixed progress (their final state) instead of scroll. */
function useScrollOrFinal(p: MotionValue<number>, final: number): MotionValue<number> {
  const fixed = useMotionValue(final);
  return useReducedMotion() ? fixed : p;
}
/** True once the element is near the viewport; used to defer a chapter's data and heavy visuals. */
function useNear<T extends HTMLElement>(margin = "500px") {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !ref.current) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near, margin]);
  return { ref, near };
}

/** The home page's data, each file on its own: undefined while loading, null if it could not be loaded. */
function useHomeData() {
  const q = {
    sum: useParquet(getLiveSummary, "home-live-summary"),
    tle: useParquet(getTle, "home-tle"),
    table: useParquet(getCountryTable, "home-table"),
    drift: useParquet(getDrift, "home-drift"),
    season: useParquet(getSeasonHome, "home-season"),
    params: useParquet(getParams, "home-params"),
  };
  const v = <T,>(s: { data: T | null; loading: boolean }) => (s.loading ? undefined : s.data);
  const all = Object.values(q);
  return {
    sum: v(q.sum), tle: v(q.tle), table: v(q.table), drift: v(q.drift), season: v(q.season), params: v(q.params),
    error: all.find((s) => s.error)?.error ?? null,
    retry: () => all.forEach((s) => { if (s.error) s.retry(); }),
  };
}
type HomeData = ReturnType<typeof useHomeData>;

const W = 640, H = 300, L = 20, R = 20, T = 22, B = 26;
const FIRST = 2003, LAST = 2025;
const xOf = (year: number) => L + ((year - FIRST) / (LAST - FIRST)) * (W - L - R);
const pathOf = (vals: number[], max: number) => vals.map((v, i) => `${i ? "L" : "M"}${(L + (i / (vals.length - 1)) * (W - L - R)).toFixed(1)},${(H - B - (v / max) * (H - T - B)).toFixed(1)}`).join(" ");
function Axes({ years }: { years: number[] }) {
  const x12 = xOf(2011.5);
  return (
    <>
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={L} x2={W - R} y1={H - B - f * (H - T - B)} y2={H - B - f * (H - T - B)} stroke="var(--gridline)" />)}
      <line x1={x12} x2={x12} y1={T - 8} y2={H - B} stroke="var(--red)" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
      <text x={x12 + 8} y={T + 2} fontSize="10.5" fontFamily="var(--font-code)" letterSpacing="0.08em" fill="var(--text-secondary)">2012 · SENSOR CHANGE</text>
      {years.filter((y) => y % 4 === 3).map((y) => <text key={y} x={xOf(y)} y={H - 6} fontSize="10.5" fontFamily="var(--font-code)" textAnchor="middle" fill="var(--text-muted)">{y}</text>)}
    </>
  );
}

/* ------------------------------------------------------------------ hero */
function Hero() {
  return (
    <section className="relative grid items-center gap-8 pb-[var(--sec-md)] pt-12 sm:pt-20 lg:grid-cols-[1.35fr_1fr]">
      <div>
        <Reveal><Eyebrow info={false}>NASA FIRMS · MODIS + VIIRS · 2003–2025</Eyebrow></Reveal>
        <Reveal delay={0.05}>
          <h1 className="display t-d1 mt-5 max-w-[17ch]">
            Switching satellites in 2012 broke the fire record. We repaired it, so you can see whether your fire season is <span className="italic">really unusual.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Pill href="#area" tone="red">Check your area</Pill>
            <Pill href="#proof" tone="line">See the proof</Pill>
            <a href="#tools" className="link-ul ml-1 text-sm text-[var(--text-secondary)]">Skip to the tools ↓</a>
          </div>
        </Reveal>
        <Reveal delay={0.18}>
          <ol className="mt-10 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]" aria-label="The story in five chapters">
            {[["01", "Problem", "#problem"], ["02", "Repair", "#repair"], ["03", "Proof", "#proof"], ["04", "Your area", "#area"], ["05", "Now", "#now"]].map(([n, t, h]) => (
              <li key={n}><a href={h} className="no-ul inline-flex items-center gap-2 hover:text-[var(--text-primary)]"><span className="text-[var(--text-primary)]">{n}</span>{t}</a></li>
            ))}
          </ol>
        </Reveal>
      </div>
      <PaperCutout className="mx-auto w-[min(26rem,78vw)] lg:w-full" />
    </section>
  );
}

/* --------------------------------------------------------- 01 · problem */
function Problem({ row, names, onCountry }: { row: CountryRow | undefined; names: string[]; onCountry: (c: string) => void }) {
  const years = useMemo(() => row?.annual.filter((a) => a.year >= FIRST && a.year <= LAST) ?? [], [row]);
  const raw = years.map((a) => a.raw);
  const max = Math.max(1, ...raw) * 1.05;
  const d = years.length ? pathOf(raw, max) : "";
  return (
    <section id="problem" className="scroll-mt-24 py-[var(--sec-md)]">
      <Reveal><SectionHead eyebrow="01 · Problem" info="step" title={<>In 2012 the satellites changed, and the fire record <span className="italic">jumped.</span></>}
        lede="The newer sensor sees smaller fires. Spliced onto the old one, the record leaps the year it arrives: more seeing, not more fire." /></Reveal>
      <div className="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Reveal>
          <Tile className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Eyebrow info={false}>Raw record · detections per year</Eyebrow>
              {names.length > 0 && row && <CountryPicker value={row.country} options={names} onChange={onCountry} label="Country" />}
            </div>
            {!row ? <DotSkeleton h={260} className="mt-4" label="Loading the raw record" /> : (
              <svg key={row.country} viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Raw yearly fire detections in ${prettyName(row.country)}, ${FIRST} to ${LAST}: the count jumps in 2012, by ${fmtRatio(row.step_raw)}.`}>
                <Axes years={years.map((a) => a.year)} />
                <path d={`${d} L${W - R},${H - B} L${L},${H - B} Z`} fill="var(--c-raw)" opacity="0.08" />
                <path d={d} fill="none" stroke="var(--c-raw)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" className="stroke-on" style={{ "--len": 2400 } as React.CSSProperties} />
              </svg>
            )}
            <p className="stat-source mt-2 text-[var(--text-muted)]">Source: NASA FIRMS archive, MODIS C6.1 to 2011 then Suomi-NPP VIIRS 375 m · countries.json</p>
          </Tile>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Reveal delay={0.05}><StatTile tone="ink" label="Raw step at 2012" info="step" value={row ? fmtRatio(row.step_raw) : undefined} note={<>Yearly detections in 2012–14 against 2009–11{row ? `, ${prettyName(row.country)}` : ""}, as the spliced record tells it.</>} className="h-full" /></Reveal>
          <Reveal delay={0.1}><StatTile label="Same years, unchanged sensor" info="modis" value={row ? fmtRatio(row.step_aqua) : undefined} note="Aqua MODIS alone, a sensor that did not change. That is how much fire really moved." className="h-full" /></Reveal>
        </div>
      </div>
      <Reveal>
        <Expand className="mt-8" label="Why a sharper sensor counts more fires">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["From orbit", "Five satellites circle Earth fourteen times a day.", "Terra and Aqua carry MODIS; Suomi-NPP, NOAA-20 and NOAA-21 carry VIIRS. Each crosses a given place at about the same local time every day.", "orbit"],
              ["Heat", "They don't see flames. They see heat.", "A fire's radiated power, in megawatts, shows up in the infrared. Big fires shine; small ones barely register.", "heat"],
              ["2000", "MODIS sees the world in 1 km squares.", "A small crop burn inside a square is too faint to cross the threshold. For twelve years, it simply isn't in the record.", "modis"],
              ["2012", "VIIRS sees in 375 m squares. Seven times sharper.", "Suddenly the small fires appear. The record jumps: not because there is more fire, but because there is more seeing.", "viirs"],
            ].map(([e, t, b, v], i) => (
              <Tile key={e} tone="alt" className="flex flex-col p-5">
                <Eyebrow info={false}>{`0${i + 1} · ${e}`}</Eyebrow>
                <SensorVisual kind={v} />
                <h3 className="display mt-4 text-lg leading-snug">{t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">{b}</p>
              </Tile>
            ))}
          </div>
          <p className="mt-4 text-sm text-[var(--text-secondary)]"><Link className="link-ul" href="/satellites">Every satellite and its orbit →</Link></p>
        </Expand>
      </Reveal>
    </section>
  );
}

/** Small illustrations for the four sensor steps (illustrative, no data). */
function SensorVisual({ kind }: { kind: string }) {
  const fires = [5, 10, 17, 30, 44, 51, 63, 77, 92, 101, 118, 130];
  return (
    <div aria-hidden className="relative mt-4 aspect-[4/3] overflow-hidden rounded-[18px] bg-[var(--surface)]">
      {kind === "orbit" && (
        <svg viewBox="0 0 120 90" className="h-full w-full">
          <circle cx="60" cy="45" r="20" fill="var(--surface-alt)" stroke="var(--text-primary)" strokeWidth="1.5" />
          {[0, 1, 2].map((i) => <ellipse key={i} cx="60" cy="45" rx={30 + i * 8} ry={(30 + i * 8) * 0.36} fill="none" stroke="var(--grey-2)" strokeDasharray="1.5 3.5" strokeLinecap="round" transform={`rotate(${-30 + i * 28} 60 45)`} />)}
          {[[32, 31], [91, 38], [70, 78]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill={i === 2 ? "var(--red)" : "var(--text-primary)"} />)}
        </svg>
      )}
      {kind === "heat" && <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_48%,var(--seq-1)_0%,var(--seq-3)_22%,var(--seq-5)_40%,transparent_70%)]" />}
      {kind === "modis" && <div className="absolute inset-3 grid grid-cols-4 gap-1">{Array.from({ length: 12 }, (_, i) => <span key={i} className="rounded-[5px]" style={{ background: i === 5 ? "var(--seq-5)" : "var(--surface-alt)" }} />)}</div>}
      {kind === "viirs" && <div className="absolute inset-3 grid grid-cols-12 gap-[2px]">{Array.from({ length: 108 }, (_, i) => <span key={i} className="rounded-[2px]" style={{ background: fires.includes(i) ? (i % 3 === 0 ? "var(--seq-6)" : "var(--seq-3)") : "var(--surface-alt)" }} />)}</div>}
    </div>
  );
}

/* ---------------------------------------------------------- 02 · repair */
function Repair({ row, d }: { row: CountryRow | undefined; d: HomeData }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useScrollOrFinal(scrollYProgress, 1);
  const years = useMemo(() => row?.annual.filter((a) => a.year >= FIRST && a.year <= LAST) ?? [], [row]);
  const raw = years.map((a) => a.raw), harm = years.map((a) => a.harm);
  const max = Math.max(1, ...raw) * 1.05;
  // The signature transition: the line leaves the raw record and settles on the harmonized one.
  const morph = useTransform(p, [0.12, 0.62], [0, 1]);
  const line = useTransform(morph, (m) => (years.length ? pathOf(raw.map((r, i) => r + (harm[i] - r) * m), max) : ""));
  const area = useTransform(line, (s) => (s ? `${s} L${W - R},${H - B} L${L},${H - B} Z` : ""));
  const rawFade = useTransform(morph, [0, 1], [1, 0.32]);
  const label = useTransform(morph, (m): string => (m < 0.5 ? "RAW" : "HARMONIZED"));
  const stats = useTransform(p, [0.5, 0.7], [0, 1]);
  const [country, setCountry] = useState("Australia");
  const countries = d.table?.countries ?? [];
  const notFitted = d.table?.not_fitted ?? [];
  const detections = countries.length ? countries.reduce((a, c) => a + c.detections_filtered, 0) + notFitted.reduce((a, c) => a + c.detections_filtered, 0) : null;
  const withRecord = countries.length + notFitted.filter((c) => c.has_raw_calendar && c.detections_filtered > 0).length;
  return (
    <section id="repair" ref={ref} className="relative scroll-mt-24" style={{ height: "230vh" }}>
      <div className="sticky top-16 flex min-h-[calc(100vh-4rem)] flex-col justify-center py-8">
        <SectionHead eyebrow="02 · Repair" info="harmonized" title={<>We learned how MODIS saw fires, country by country, and <span className="italic">rebuilt the record.</span></>}
          lede="Each newer detection is weighted by the chance the older sensor would have seen a fire that strong. Scroll: the same line, on one sensor's footing." />
        <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Tile className="relative p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow info={false}>{row ? `${prettyName(row.country)} · detections per year` : "Detections per year"}</Eyebrow>
              <motion.span className="rounded-full bg-[var(--ink)] px-3 py-1 font-mono text-[10.5px] tracking-[0.16em] text-[var(--on-ink)]">{label}</motion.span>
            </div>
            {!row ? <DotSkeleton h={260} className="mt-4" label="Loading the record" /> : (
              <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Yearly fire detections in ${prettyName(row.country)}: raw (blue) and harmonized (ember). The 2012 step is ${fmtRatio(row.step_raw)} raw and ${fmtRatio(row.step_harm)} harmonized.`}>
                <Axes years={years.map((a) => a.year)} />
                <motion.path d={pathOf(raw, max)} fill="none" stroke="var(--c-raw)" strokeWidth="2" strokeDasharray="1 6" strokeLinecap="round" style={{ opacity: rawFade }} />
                <motion.path d={area} fill="var(--c-harm)" opacity="0.1" />
                <motion.path d={line} fill="none" stroke="var(--c-harm)" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            )}
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--text-secondary)]">
              <li className="inline-flex items-center gap-2"><span className="h-[3px] w-5 rounded-full bg-[var(--c-raw)]" />raw splice</li>
              <li className="inline-flex items-center gap-2"><span className="h-[3px] w-5 rounded-full bg-[var(--c-harm)]" />harmonized (Aqua-MODIS-equivalent)</li>
            </ul>
          </Tile>
          <motion.div style={{ opacity: stats }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <StatTile tone="ink" label="Harmonized step at 2012" info="aquaEquivalent" value={row ? fmtRatio(row.step_harm) : undefined} note={<>Raw said {fmtRatio(row?.step_raw)}. The unchanged sensor says {fmtRatio(row?.step_aqua)}. Much of the jump was detection, not fire.</>} className="h-full" />
            <StatTile label="The record" info="firmsArchive" value={detections != null ? `${fmtNum(detections / 1e6, 1)}M` : undefined} unit="detections"
              note={<>Daytime vegetation-fire detections in {withRecord || "…"} FIRMS countries and territories; {countries.length || "…"} have enough data to fit. Exact total {fmtInt(detections)}.</>} className="h-full" />
          </motion.div>
        </div>
        <Expand className="mt-6" label="And the old satellites are drifting: why the fit stops at 2021">
          <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--text-secondary)]">
            A satellite in a sun-synchronous orbit passes over a place at the same local time every day. Terra and Aqua no longer do. Each clock below is measured from the fire detections themselves, year by year. The fit uses 2012–2021 only; 2022–2025 is held apart.
          </p>
          <div className="mt-6"><DriftClocks drift={(d.drift ?? undefined) as DriftFile | undefined} country={country} onCountry={setCountry} /></div>
          <p className="mt-5 text-sm text-[var(--text-secondary)]"><Link className="link-ul" href="/satellites">Every satellite, and the drift year by year →</Link></p>
        </Expand>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- 03 · proof */
function Proof({ d }: { d: HomeData }) {
  const { ref, near } = useNear<HTMLElement>();
  const { data: pf } = useParquet(() => (near ? getProof() : new Promise<Awaited<ReturnType<typeof getProof>>>(() => {})), near ? "home-proof" : "home-proof-wait");
  const pct = (v: number) => `${fmtNum(v * 100, 1)}%`;
  const s = pf?.step_collapse.all, r = pf?.records, seam = pf?.seam, b = pf?.benchmark.all;
  const acc = accuracySummary(d.params ?? undefined);
  return (
    <section id="proof" ref={ref} className="scroll-mt-24 py-[var(--sec-lg)]">
      <Reveal><SectionHead eyebrow="03 · Proof" size="d1" title={<>Three checks the repair <span className="italic">could have failed.</span></>}
        lede="None of them uses the fitting target. Each asks one thing: after the repair, does 2012 still look special?" /></Reveal>
      <div className="mt-10 grid gap-4 lg:grid-cols-3" data-testid="home-proof">
        <Reveal><StatTile tone="ink" size="lg" label="Step collapse" info="stepCollapse" value={s ? `${s.within_1_25_harm}/${s.n}` : pf === undefined ? undefined : undefined}
          note={s && pf ? <>countries whose 2012 step now lands within ×{pf.step_collapse.within_factor} of an unchanged sensor. In the raw splice: <span className="dot-num">{s.within_1_25_raw}/{s.n}</span>.</> : "Loading proof.json"} className="h-full" /></Reveal>
        <Reveal delay={0.06}><StatTile size="lg" label="False-Record Counter" info="falseRecord" value={r ? pct(r.series.harmonized.share) : undefined}
          note={r ? <>of months after 2012 look like an all-time record, down from <span className="dot-num">{pct(r.series.raw_splice.share)}</span> in the raw splice. Chance level: {fmtNum(r.chance_reference.share * 100, 0)}%.</> : "Loading proof.json"} className="h-full" /></Reveal>
        <Reveal delay={0.12}><StatTile size="lg" label="Find the Seam" info="seam" value={seam ? `${seam.harm_2012}/${seam.n_countries}` : undefined}
          note={seam ? <>countries where 2012 is still the biggest jump, down from <span className="dot-num">{seam.raw_2012}/{seam.n_countries}</span>. By chance alone: {fmtNum(seam.chance_2012, 1)}.</> : "Loading proof.json"} className="h-full" /></Reveal>
      </div>
      {b && (
        <Reveal>
          <p className="mt-6 max-w-[70ch] border-l-[length:var(--stroke)] border-[var(--text-primary)] pl-4 text-[15px] leading-relaxed text-[var(--text-secondary)]" data-testid="honest-benchmark">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-primary)]">The honest benchmark · </span>
            On held-out years the model is far better than raw VIIRS and roughly level with one country-wide ratio: median R² {fmtR2(b.median_r2.model)} against {fmtR2(b.median_r2.ratio)}. It beats that ratio in {b.beats_ratio_r2} of {b.n} countries on R² and in {b.beats_ratio_mae} of {b.n} on mean absolute error. Regional results, not a global claim.
          </p>
        </Reveal>
      )}
      <Reveal><Tile className="mt-8 min-w-0 p-5 sm:p-7"><StepCollapse lazy compact /></Tile></Reveal>
      <Reveal>
        <Expand className="mt-8" label="Held-out scores: tested on years the model never saw">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(d.table?.countries ?? []).filter((c) => ORIGINAL_FOUR.includes(c.country)).map((c) => (
              <Tile key={c.country} tone="alt" className="p-5">
                <Eyebrow info={false}>{prettyName(c.country)}</Eyebrow>
                <p className="mt-3"><DotDigits text={fmtR2(c.r2_model)} className="text-5xl" /></p>
                <p className="mt-2 text-[13px] text-[var(--text-secondary)]">held-out R² against observed Aqua · raw VIIRS {fmtR2(c.r2_raw)}</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]"><div className="h-full rounded-full bg-[var(--c-harm)]" style={{ width: `${Math.max(0, c.r2_model) * 100}%` }} /></div>
              </Tile>
            ))}
          </div>
          <p className="mt-5 max-w-[75ch] text-[14px] leading-relaxed text-[var(--text-secondary)]">
            The four countries the method was built on. {acc ? <>Across all {acc.fitted} fitted countries, {acc.own} with their own curve and {acc.fitted - acc.own} on a borrowed (pooled) curve, the median held-out R² of the {acc.own} own-fit countries is {fmtR2(acc.medianR2)}; the model beats raw VIIRS in {acc.beats} of {acc.fitted}. Best single country: {prettyName(acc.best)}, {fmtR2(acc.bestR2)} (raw VIIRS there: {fmtR2(acc.bestRaw)}). </> : null}
            {d.params ? <>Fitted {span(d.params.train_years[0], d.params.train_years[1])}, scored {span(d.params.test_years[0], d.params.test_years[1])} per ~250 km² cell and month. Fit {d.params.fit_version}.</> : null}
          </p>
        </Expand>
      </Reveal>
      <Reveal><div className="mt-6"><Pill href="/method#proof" tone="ink">All the proof, country by country →</Pill></div></Reveal>
    </section>
  );
}

/* ------------------------------------------------------- 04 · your area */
function YourArea({ d }: { d: HomeData }) {
  const [country, setCountry] = useState("Canada");
  const { ref, near } = useNear<HTMLElement>();
  const { data, error, retry } = useAreaData({ kind: "country", name: country });
  const hasHarm = !!data && data.harmonized.rows.some((r) => r.value !== null);
  const cal = data ? (hasHarm ? data.harmonized : data.raw) : null;
  // The verdict: the latest complete year against every earlier year of the same harmonized record.
  const verdict = useMemo(() => {
    if (!data || !hasHarm) return null;
    const totals = annualTotals(data.harmonized, FIRST, LAST).filter((t) => t.value !== null) as Array<{ year: number; value: number }>;
    if (totals.length < 6) return null;
    const last = totals[totals.length - 1], rest = totals.slice(0, -1);
    const below = rest.filter((t) => t.value < last.value).length, ties = rest.filter((t) => t.value === last.value).length;
    const pctl = (100 * (below + 0.5 * ties)) / rest.length;
    const med = median(rest.map((t) => t.value)) as number;
    return { year: last.year, value: last.value, below, n: rest.length, pctl, med, from: rest[0].year, to: rest[rest.length - 1].year, word: pctl >= 67 ? "above normal" : pctl <= 33 ? "below normal" : "near normal" };
  }, [data, hasHarm]);
  const lo = LAST - 11;
  const max = cal ? Math.max(1, ...cal.rows.filter((r) => r.year >= lo).map((r) => r.value ?? 0)) : 1;
  const chile = d.season?.countries.Chile?.trend_days_per_decade;
  return (
    <section id="area" ref={ref} className="scroll-mt-24 py-[var(--sec-lg)]">
      <Reveal><SectionHead eyebrow="04 · Your area" info="calendar" title={<>Is this fire season <span className="italic">really unusual</span> where you are?</>}
        lede="Pick a country. The calendar is in one unit for every year, so the latest season can be set fairly against the ones before it." /></Reveal>
      <Reveal>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {data ? <CountryPicker value={country} options={data.countries} onChange={setCountry} label="Country" tags={data.tags} /> : <span className="dot-skel inline-block h-11 w-56 !rounded-full" />}
          {data && !hasHarm && <span className="rounded-full border-[length:var(--stroke)] border-[var(--red)] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--red)]">uncorrected · raw only</span>}
          <InfoDot k={hasHarm || !data ? "harmonized" : "uncorrected"} align="start" />
        </div>
      </Reveal>
      {error && <div className="mt-6"><Failed error={error} retry={retry} what="the calendar" /></div>}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Reveal>
          <Tile className="min-w-0 p-5 sm:p-6">
            <Eyebrow info={false}>{`${prettyName(country)} · ${hasHarm || !data ? "harmonized" : "raw, uncorrected"} detections per month · ${lo}–${LAST}`}</Eyebrow>
            <div className="mt-4 min-w-0">
              {cal && near ? <div className="cal-wipe"><MonthYearCalendar cal={cal} from={lo} to={LAST} max={max} areaName={prettyName(country)} /></div> : <DotSkeleton h={380} label="Loading the calendar" />}
            </div>
          </Tile>
        </Reveal>
        <div className="grid content-start gap-4">
          <Reveal delay={0.05}>
            <Tile tone="ink" tilt className="p-6" data-testid="verdict">
              <div className="flex items-start justify-between gap-3"><Eyebrow info={false} className="!text-inherit opacity-70">{verdict ? `Verdict · ${verdict.year}` : "Verdict"}</Eyebrow><InfoDot k="percentile" /></div>
              {verdict ? (
                <>
                  <p className="display mt-4 text-[clamp(1.9rem,1.4rem+1.6vw,2.6rem)] leading-[1.05]">This season is <span className="italic">{verdict.word}.</span></p>
                  <p className="mt-4 flex items-baseline gap-2"><DotDigits text={fmtNum(verdict.pctl, 0)} className="text-6xl" /><span className="stat-unit opacity-70">percentile</span></p>
                  <p className="mt-3 text-[14px] leading-snug opacity-80">
                    {verdict.year} had {fmtInt(verdict.value)} harmonized detections: more than {verdict.below} of the {verdict.n} years {verdict.from}–{verdict.to} (median {fmtInt(verdict.med)}). Above normal means the top third, below normal the bottom third.
                  </p>
                </>
              ) : data && !hasHarm ? (
                <p className="mt-4 text-[15px] leading-relaxed opacity-85">No harmonized record exists for {prettyName(country)}, so no verdict is given. The calendar shows raw counts, flagged uncorrected: across 2012 they mix two sensors.</p>
              ) : <p className="mt-4 font-mono text-sm uppercase tracking-[0.14em] opacity-60">{data ? "not recorded" : "loading"}</p>}
            </Tile>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="flex flex-wrap gap-3">
              <Pill href={`/explorer?country=${encodeURIComponent(country)}`} tone="red">Open the full calendar</Pill>
              <Pill href={`/seasons?country=${encodeURIComponent(country)}`} tone="line">Month by month</Pill>
            </div>
          </Reveal>
        </div>
      </div>
      <Reveal>
        <Expand className="mt-8" label="Is the fire season starting earlier? Less than the raw data says">
          <Tile tone="alt" className="max-w-2xl p-6">
            <Eyebrow info={false}>Chile · season onset trend, 2003–2025</Eyebrow>
            <div className="mt-5 space-y-5">
              {([["Raw record", chile?.raw_onset, "var(--c-raw)"], ["Harmonized", chile?.harm_onset, "var(--c-harm)"]] as const).map(([l, v, c]) => (
                <div key={l}>
                  <div className="flex items-baseline justify-between text-sm"><span>{l}</span><span>{v == null ? <span className="font-mono text-xs uppercase tracking-[0.14em] opacity-60">not recorded</span> : <><span className="dot-num text-3xl">{fmtSigned(v)}</span> <span className="stat-unit text-[var(--text-secondary)]">days / decade</span></>}</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface)]"><div className="h-full rounded-full" style={{ background: c, width: `${Math.min(100, Math.abs(v ?? 0) * 10)}%` }} /></div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[14px] leading-relaxed text-[var(--text-secondary)]">Negative = earlier. Descriptive least-squares trends.{chile?.raw_onset != null && chile?.harm_onset != null ? ` Change in estimated trend after harmonization: ${fmtSigned(chile.harm_onset - chile.raw_onset)} days/decade (raw ${fmtSigned(chile.raw_onset)}, harmonized ${fmtSigned(chile.harm_onset)} days/decade). This is a difference between two estimates, not a measured sensor effect.` : ""} <Link href="/trends" className="link-ul">Every country →</Link></p>
          </Tile>
        </Expand>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------- 05 · now */
const FEED: Record<string, { name: string; sensor: string; color: string }> = {
  "NOAA-20": { name: "NOAA-20", sensor: "VIIRS 375 m", color: "var(--on-ink)" },
  "NOAA-21": { name: "NOAA-21", sensor: "VIIRS 375 m", color: "var(--grey-2)" },
  MODIS: { name: "Terra + Aqua", sensor: "MODIS 1 km", color: "var(--red)" },
};
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Now({ d }: { d: HomeData }) {
  const now = useToday();
  const { ref, near } = useNear<HTMLElement>("300px");
  const { data: live } = useParquet(() => (near ? getLive() : new Promise<Awaited<ReturnType<typeof getLive>>>(() => {})), near ? "home-live" : "home-live-wait");
  const w = d.sum?.windows["24h"];
  const feeds = w ? Object.entries(w.totals) : [];
  const live24 = feeds.length ? feeds.reduce((a, [, v]) => a + v, 0) : null;
  const fetched = parseUtc(d.sum?.fetched_utc);
  const age = fmtAge(fetched, now);
  const dates = w?.dates ?? [];
  const sats = d.tle?.satellites ?? [];
  return (
    <section id="now" ref={ref} className="scroll-mt-24 py-[var(--sec-lg)]">
      <Reveal><SectionHead eyebrow="05 · Now" info="live" title={<>And this month, <span className="italic">so far.</span></>}
        lede="The live feeds are raw and come from different satellites than the long record. They are shown beside it, labelled, never mixed into it." /></Reveal>
      <Reveal><div className="mt-6 flex flex-wrap gap-2"><SourceChip name="FIRMS NRT" detail="NOAA-20 · NOAA-21 · MODIS" /><SourceChip name="FIRMS area API" detail="this month" /><SourceChip name="NASA EONET" detail="wildfire events" /><SourceChip name="CelesTrak" detail="TLEs" /></div></Reveal>
      <div className="mt-6"><MonthUnusualPanel /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <Tile tone="ink" className="h-full p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4"><Eyebrow info={false} className="!text-inherit opacity-70">Near-real-time · raw detections · last 24 hours</Eyebrow><span className="live-dot mt-1 shrink-0" aria-hidden /></div>
            <p className="mt-5 leading-none">{live24 != null ? <DotDigits text={fmtInt(live24)} className="text-[clamp(3rem,2rem+6vw,6.5rem)]" /> : <span className="font-mono text-sm uppercase tracking-[0.14em] opacity-60">{d.sum === undefined ? "loading" : "not recorded"}</span>}</p>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-snug"><span className="font-medium">active-fire detections</span> <span className="opacity-70">Each is a satellite pixel flagged as burning, seen from orbit in the 24 hours before the snapshot.</span></p>
            {live24 != null && (
              <div className="mt-5">
                <div className="flex h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--on-ink)_14%,transparent)]" aria-hidden>{feeds.map(([k, v]) => <span key={k} style={{ width: `${(v / live24) * 100}%`, background: FEED[k]?.color ?? "var(--grey-2)" }} />)}</div>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-3">
                  {feeds.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 sm:block">
                      <dt className="opacity-75"><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: FEED[k]?.color ?? "var(--grey-2)" }} />{FEED[k]?.name ?? k} <span className="opacity-60">· {FEED[k]?.sensor ?? ""}</span></dt>
                      <dd className="tabular font-medium sm:mt-0.5">{fmtInt(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <div className="mt-5 border-t border-[color-mix(in_srgb,var(--on-ink)_16%,transparent)] pt-4 text-[12px] leading-relaxed opacity-75">
              <p>As of {fmtUtc(fetched)}{age && <> · updated {age}</>}{dates.length > 0 && <> · acquisitions dated {dates.length > 1 ? `${dayLabel(dates[0])} – ${dayLabel(dates[dates.length - 1])}` : dayLabel(dates[0])} (UTC)</>}</p>
              <p className="stat-source mt-1.5 opacity-80">Source: NASA FIRMS near-real-time global 24 h feeds: VIIRS on NOAA-20 and NOAA-21, MODIS C6.1 on Terra and Aqua. Raw and uncorrected; not the Suomi-NPP record Emberline harmonizes, whose live feed is empty. Includes volcanoes and gas flares.</p>
            </div>
          </Tile>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Reveal delay={0.05}>
            <Tile shape="circle" tilt className="mx-auto flex w-full max-w-[18rem] flex-col items-center justify-center p-6 text-center">
              <Eyebrow info={false}>Time now · UTC</Eyebrow>
              <DotClock size={112} />
              <p className="dot-num text-3xl leading-none">{now ? fmtClock(now.getUTCHours() + now.getUTCMinutes() / 60) : "--:--"}</p>
              <p className="mt-1 max-w-[14rem] text-[11.5px] leading-snug text-[var(--text-muted)]">Fire records are stamped in UTC, then converted to local solar time.</p>
            </Tile>
          </Reveal>
          <Reveal delay={0.1}>
            <Link href="/satellites" className="tile block h-full p-6">
              <div className="flex items-start justify-between gap-3"><Eyebrow info={false}>The fleet</Eyebrow><InfoDot k="tle" /></div>
              <p className="mt-4 flex items-baseline gap-2 leading-none">{sats.length ? <DotDigits text={String(sats.length)} className="text-6xl" /> : <span className="font-mono text-sm uppercase tracking-[0.14em] opacity-60">{d.tle === undefined ? "loading" : "not recorded"}</span>}<span className="stat-unit opacity-70">satellites</span></p>
              <p className="mt-3 text-[13.5px] leading-snug text-[var(--text-secondary)]">
                In the harmonized record: {sats.filter((s) => s.name !== "NOAA-20" && s.name !== "NOAA-21").map((s) => `${s.name} (${s.instrument})`).join(", ") || "…"}. Live layer only: {sats.filter((s) => s.name === "NOAA-20" || s.name === "NOAA-21").map((s) => s.name).join(", ") || "…"} (VIIRS).
              </p>
              <p className="stat-source mt-3 text-[var(--text-muted)]">{d.tle ? <>Orbits: public TLEs, {fmtUtc(parseUtc(d.tle.fetched))}</> : null}</p>
            </Link>
          </Reveal>
        </div>
      </div>
      <Reveal>
        <Tile className="relative mt-4 overflow-hidden p-5 sm:p-7">
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <Eyebrow info={false}>Live globe · NOAA-20 / NOAA-21 / MODIS · raw</Eyebrow>
              <h3 className="display mt-3 t-d3">Every detection of the last day, where it burned.</h3>
              <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-[var(--text-secondary)]">Drag to spin. The globe also carries the satellites’ orbits and NASA EONET wildfire events, a separate, curated source.</p>
              <div className="mt-6"><Pill href="/globe" tone="ink">Open the live globe →</Pill></div>
            </div>
            <div className="relative mx-auto w-full max-w-[520px] cursor-grab active:cursor-grabbing">
              {near ? <FireGlobe live={live ?? null} tle={d.tle?.satellites ?? null} interactive allowZoom={false} showOrbits height={440} speed={60} maxPoints={5000} /> : <DotSkeleton h={440} className="!rounded-full" label="Loading the globe" />}
            </div>
          </div>
        </Tile>
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------------- page */
export function Home() {
  const d = useHomeData();
  const [country, setCountry] = useState("Canada");
  const fitted = d.table?.countries ?? [];
  const row = fitted.find((c) => c.country === country) ?? fitted.find((c) => c.country === "Canada");
  const names = useMemo(() => fitted.map((c) => c.country), [fitted]);
  const { ref: journeyRef, near: journeyNear } = useNear<HTMLDivElement>("600px");
  const top = useMemo(() => [...fitted].sort((a, b) => b.harm_mean_2003_2025 - a.harm_mean_2003_2025).slice(0, 24), [fitted]);
  return (
    <div>
      <Hero />
      {d.error && <div className="mx-auto mb-8 max-w-3xl"><Failed error={d.error} retry={d.retry} what="the summary figures" /></div>}
      <Problem row={row} names={names} onCountry={setCountry} />
      <Repair row={row} d={d} />
      <Proof d={d} />
      <YourArea d={d} />
      <Now d={d} />

      <div ref={journeyRef} className="py-[var(--sec-sm)]">{journeyNear ? <DataJourney compact /> : <DotSkeleton h={220} label="Loading the data journey" />}</div>

      <section id="tools" className="scroll-mt-24 py-[var(--sec-md)]">
        <Reveal><SectionHead eyebrow="Everything inside" title={<>One record. <span className="italic">Nine ways in.</span></>} /></Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALL.map((t, i) => (
            <Reveal key={t.href} delay={(i % 3) * 0.05}>
              <Link href={t.href} className="tile group flex h-full flex-col p-6">
                <Eyebrow info={false}><span className="eyebrow-n">{String(i + 1).padStart(2, "0")}</span></Eyebrow>
                <p className="display mt-3 text-2xl">{t.label}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">{t.blurb}</p>
                <p className="mt-auto pt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-primary)]">Open <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">→</span></p>
              </Link>
            </Reveal>
          ))}
        </div>
        {top.length > 0 && (
          <Reveal>
            <p className="mt-8 font-mono text-[11px] uppercase leading-loose tracking-[0.16em] text-[var(--text-muted)]">
              <span className="text-[var(--text-primary)]">The {top.length} fitted countries with the most fire · </span>
              {top.map((c, i) => <span key={c.country}>{i > 0 && <span aria-hidden className="mx-2 opacity-50">·</span>}<Link href={`/explorer?country=${encodeURIComponent(c.country)}`} className="no-ul hover:text-[var(--text-primary)]">{prettyName(c.country)}</Link>{" "}</span>)}
            </p>
          </Reveal>
        )}
      </section>

      <Reveal>
        <Tile tone="ink" className="relative mt-4 overflow-hidden p-10 text-center sm:p-16">
          <h2 className="display relative t-d1">Pick a place. <span className="italic">See its fires.</span></h2>
          <p className="relative mx-auto mt-4 max-w-lg opacity-75">Draw any area on the map, choose the years, and download the harmonized calendar as CSV. No account, no API key.</p>
          <div className="mt-8"><Pill href="/explorer" tone="red">Open the calendar explorer →</Pill></div>
        </Tile>
      </Reveal>
    </div>
  );
}
