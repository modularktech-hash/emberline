"use client";

import { DotClock, DotStat, DotText, dotCompact, useToday } from "@/components/DotMatrix";
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CountUp, Reveal } from "@/components/ui";
import { getCountryTable, getDrift, getLive, getSeason, getTle, type CountryRow, type DriftFile } from "@/lib/data";
import { getParams } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import { ALL } from "@/lib/nav";
import { Eyebrow, Stat } from "@/components/Figure";
import { DriftClocks } from "@/components/DriftClocks";
import { NA, fmtAge, fmtClock, fmtInt, fmtR2, fmtRatio, fmtSigned, fmtUtc, parseUtc, span } from "@/lib/format";
import { median } from "@/lib/ember";
import { ORIGINAL_FOUR, prettyName } from "@/lib/names";
import type { Params } from "@/lib/types";

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

const FireGlobe = dynamic(() => import("@/components/FireGlobe"), { ssr: false });
import { EASE } from "@/lib/motion";

/** Splits a headline line into words that rise in one after another. */
function Words({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {text.split(" ").map((w, i, a) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-top">
          <motion.span className="inline-block" initial={{ y: "105%", opacity: 0, rotate: 4 }} animate={{ y: "0%", opacity: 1, rotate: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: delay + i * 0.07 }}>{w}{i < a.length - 1 ? "\u00a0" : ""}</motion.span>
        </span>
      ))}
    </>
  );
}

function useHomeData() {
  return useParquet(async () => {
    const [live, tle, table, drift, season, params] = await Promise.all([getLive(), getTle(), getCountryTable(), getDrift(), getSeason(), getParams()]);
    return { live, tle, table, drift, season, params };
  }, "home");
}

/* ------------------------------------------------------------------ hero */
function Hero({ d }: { d: ReturnType<typeof useHomeData>["data"] }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const textY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const live24 = d ? Object.values(d.live.windows["24h"].totals).reduce((a, b) => a + b, 0) : 0;

  return (
    <section ref={ref} className="relative pb-10 pt-14 sm:pt-24">
      <motion.div style={{ y: textY, opacity: fade }} className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}
          className="glass-thin mx-auto inline-flex items-center gap-2.5 px-4 py-1.5 text-[13px] text-[var(--text-secondary)]">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--ember)] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--ember)]" /></span>
          {d ? <span><span className="tabular font-medium text-[var(--text-primary)]">{fmtInt(live24)}</span> near-real-time, raw detections in the 24 h to <span className="tabular">{fmtUtc(parseUtc(d.live.fetched_utc))}</span></span> : "NASA FIRMS · MODIS + VIIRS · archive 2001–2025"}
        </motion.div>
        <h1 className="display t-hero mt-8">
          <span className="block"><Words text="23 years of fire." delay={0.1} /></span>
          <span className="block italic text-[var(--ember)] sm:whitespace-nowrap"><Words text="One steady line." delay={0.38} /></span>
        </h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.8 }}
          className="mx-auto mt-7 max-w-md text-[17px] leading-relaxed text-[var(--text-secondary)]">
          Two generations of NASA satellites, harmonized country by country to reduce the discontinuity between sensor records. Source archive from 2001; harmonized record 2003–2025.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.7, ease: EASE }} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/explorer" className="pill-dark px-6 py-3 text-[15px] font-medium">Open the calendar</Link>
          <Link href="/globe" className="glass rounded-full px-6 py-3 text-[15px] font-medium">Live globe &nbsp;→</Link>
        </motion.div>
      </motion.div>

      {/* No scroll parallax on the globe: moving a live WebGL canvas every scrolled frame was a source of judder. */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 1 }}
        className="relative mx-auto mt-6 max-w-[760px] cursor-grab active:cursor-grabbing">
        <div aria-hidden className="pointer-events-none absolute inset-[4%] rounded-full bg-[radial-gradient(circle,rgba(255,140,80,0.26),transparent_66%)]" />
        <FireGlobe live={d?.live ?? null} tle={d?.tle.satellites ?? null} interactive allowZoom={false} showOrbits height={600} speed={60} maxPoints={5000} />
        <p className="pointer-events-none mt-1 text-center text-xs tracking-wide text-[var(--text-muted)]">Drag to spin · hover a fire for details</p>
      </motion.div>

      <Widgets d={d} />
      {d && <Ticker names={[...[...d.table.countries].sort((a, b) => b.harm_mean_2003_2025 - a.harm_mean_2003_2025).slice(0, 24).map((c) => prettyName(c.country)), "Terra", "Aqua", "Suomi-NPP", "NOAA-20", "NOAA-21"]}
        label={`The ${Math.min(24, d.table.countries.length)} fitted countries with the most fire, and the satellites`} />}
    </section>
  );
}

/* ------------------------------------------- ticker of existing names */
function Ticker({ names, label }: { names: string[]; label: string }) {
  const row = names.map((n) => (
    <span key={n} className="flex items-center gap-6 pr-6 font-mono text-[12px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
      {n}<span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--ember)] opacity-70" />
    </span>
  ));
  return (
    <div className="marquee mx-auto mt-14 max-w-5xl py-2">
      <p className="sr-only">{label}: {names.join(", ")}</p>
      <div aria-hidden>{row}{row.map((r, i) => <span key={i}>{r}</span>)}</div>
    </div>
  );
}

/* ------------------------------------------------- "at a glance" panel */
/** What each live feed is, in words (keys as written by scripts/build_live.py). */
const FEED: Record<string, { name: string; sensor: string; color: string }> = {
  "NOAA-20": { name: "NOAA-20", sensor: "VIIRS 375 m", color: "#f3efe6" },
  "NOAA-21": { name: "NOAA-21", sensor: "VIIRS 375 m", color: "#f49b3f" },
  MODIS: { name: "Terra + Aqua", sensor: "MODIS 1 km", color: "#d9431a" },
};
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Widgets({ d }: { d: ReturnType<typeof useHomeData>["data"] }) {
  const now = useToday();
  const tile = "h-full rounded-[30px] p-5 sm:p-6";
  const dark = "bg-[#141414] text-[#f3efe6] shadow-[0_24px_44px_-26px_rgba(0,0,0,0.6)]";
  const w = d?.live.windows["24h"];
  const feeds = w ? Object.entries(w.totals) : [];
  const live24 = feeds.length ? feeds.reduce((a, [, v]) => a + v, 0) : null;
  const fetched = parseUtc(d?.live.fetched_utc);
  const age = fmtAge(fetched, now);
  const dates = w?.dates ?? [];
  const countries = d?.table.countries ?? [];
  const notFitted = d?.table.not_fitted ?? [];
  const detections = countries.length ? countries.reduce((a, c) => a + c.detections_filtered, 0) + notFitted.reduce((a, c) => a + c.detections_filtered, 0) : null;
  const withRecord = countries.length + notFitted.filter((c) => c.has_raw_calendar && c.detections_filtered > 0).length;
  const years = countries.flatMap((c) => c.annual.map((a) => a.year));
  const acc = accuracySummary(d?.params);
  const sats = d?.tle.satellites ?? [];
  const p = d?.params;
  return (
    <section aria-labelledby="glance" className="mx-auto mt-16 max-w-5xl">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <Eyebrow>At a glance · read from the data files</Eyebrow>
            <h2 id="glance" className="display t-d3 mt-2">One day of fire, and the long record it joins.</h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
            The live count is today&apos;s raw satellite view. Emberline&apos;s job is the long record: every year from 2003 to 2025 converted to one unit (Aqua MODIS-equivalent), so a fire season in 2005 and one in 2025 can be compared on the same footing. Aqua launched in May 2002, so 2001–2002 have no Aqua reference.
          </p>
        </div>
      </Reveal>

      <div className="mt-6 grid gap-3 sm:gap-4 md:grid-cols-3">
        <Reveal className="md:col-span-2">
          <div className={`${tile} ${dark}`}>
            <div className="flex items-start justify-between gap-4">
              <Eyebrow className="!text-white/60">Near-real-time · raw detections · last 24 hours</Eyebrow>
              <span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--ember)]" aria-hidden />
            </div>
            <div className="mt-5">
              {live24 != null ? <DotText text={fmtInt(live24)} dot={9} gap={3} lit="#f3efe6" dim="rgba(255,255,255,0.06)" /> : <p className="display text-4xl text-white/70">{d ? NA : "…"}</p>}
            </div>
            <p className="mt-3 text-[15px] leading-snug">
              <span className="font-medium">active-fire detections</span> <span className="text-white/70">— each one a satellite pixel flagged as burning, seen from orbit in the 24 hours before the snapshot.</span>
            </p>
            {live24 != null && (
              <div className="mt-5">
                <div className="flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
                  {feeds.map(([k, v]) => <span key={k} style={{ width: `${(v / live24) * 100}%`, background: FEED[k]?.color ?? "#999" }} />)}
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-3">
                  {feeds.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 sm:block">
                      <dt className="text-white/70"><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: FEED[k]?.color ?? "#999" }} />{FEED[k]?.name ?? k} <span className="text-white/45">· {FEED[k]?.sensor ?? ""}</span></dt>
                      <dd className="tabular font-medium sm:mt-0.5"><CountUp to={v} /></dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <div className="mt-5 border-t border-white/10 pt-4 text-[12px] leading-relaxed text-white/60">
              <p>
                <span className="text-white/85">As of {fmtUtc(fetched)}</span>{age && <> · updated {age}</>}
                {dates.length > 0 && <> · acquisitions dated {dates.length > 1 ? `${dayLabel(dates[0])} – ${dayLabel(dates[dates.length - 1])}` : dayLabel(dates[0])} (UTC)</>}
              </p>
              <p className="stat-source mt-1.5 text-white/50">
                Source: NASA FIRMS near-real-time global 24 h feeds — VIIRS on NOAA-20 and NOAA-21, MODIS C6.1 on Terra and Aqua. Raw and uncorrected; not the Suomi-NPP record Emberline harmonizes, whose live feed is empty. Includes volcanoes and gas flares.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div className={`glass ${tile} flex flex-col items-center text-center text-[var(--ink)]`}>
            <Eyebrow className="self-start">Time now · UTC</Eyebrow>
            <DotClock size={128} />
            <p className="tabular display mt-1 text-2xl">{now ? fmtClock(now.getUTCHours() + now.getUTCMinutes() / 60) : "…"} <span className="text-sm font-medium text-[var(--text-muted)]">UTC</span></p>
            <p className="text-sm text-[var(--text-secondary)]">{now ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : ""}</p>
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-muted)]">Satellite fire records are stamped in UTC. Emberline converts each detection to local solar time (UTC + longitude ÷ 15) before any time-of-day analysis.</p>
          </div>
        </Reveal>

        <Reveal>
          <div className={`glass ${tile}`}>
            <Stat dot label="The record" value={detections != null ? dotCompact(detections) : d ? NA : "…"}
              unit="detections"
              note={<>Daytime vegetation-fire detections, raw, {years.length ? span(Math.min(...years), Math.max(...years)) : "…"}, in {withRecord || "…"} FIRMS countries and territories; {countries.length || "…"} of them have enough data to fit. Exact total {fmtInt(detections)}.</>}
              source={<>Source: NASA FIRMS archive (MODIS C6.1, VIIRS Suomi-NPP) · countries.json</>} />
          </div>
        </Reveal>
        <Reveal delay={0.05}>
          <div className={`${tile} bg-[var(--ember)] text-white shadow-[0_24px_44px_-26px_rgba(217,67,26,0.8)]`}>
            <Stat dot tone="ember" label="Held-out R² · median country" value={acc ? fmtR2(acc.medianR2) : d ? NA : "…"} unit="R²"
              note={acc && p ? <>Median held-out R² over the {acc.own} countries with their own fit: the corrected record against Aqua reference observations in {span(p.test_years[0], p.test_years[1])}, years left out of the fit. 1 is perfect. Best single country: {prettyName(acc.best)}, {fmtR2(acc.bestR2)} (raw VIIRS there: {fmtR2(acc.bestRaw)}). The model beats raw VIIRS in {acc.beats} of {acc.fitted} fitted countries.</> : null}
              source={p ? <>Fit {p.fit_version} · trained {span(p.train_years[0], p.train_years[1])}</> : null} />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <Link href="/satellites" className={`${tile} ${dark} group flex flex-col transition-transform hover:-translate-y-1`}>
            <Stat dot tone="dark" label="The fleet" value={sats.length ? String(sats.length) : d ? NA : "…"} unit="satellites"
              note={<>
                In the harmonized record: {sats.filter((s) => s.name !== "NOAA-20" && s.name !== "NOAA-21").map((s) => `${s.name} (${s.instrument})`).join(", ")}.
                {" "}Live layer only: {sats.filter((s) => s.name === "NOAA-20" || s.name === "NOAA-21").map((s) => s.name).join(", ")} (VIIRS).
              </>}
              source={d ? <>Orbits: public TLEs, {fmtUtc(parseUtc(d.tle.fetched))}</> : null} />
            <span className="mt-auto pt-4 text-sm text-white/70 transition-transform group-hover:translate-x-1">See every satellite →</span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}


/* --------------------------------------------------------- sticky story */
function StoryStep({ i, n, p, children }: { i: number; n: number; p: MotionValue<number>; children: React.ReactNode }) {
  const a = i / n, b = (i + 1) / n;
  const a0 = Math.max(0, a - 0.08), a1 = Math.max(0.01, a);
  const opacity = useTransform(p, [a0, a1, b - 0.06, b], [i === 0 ? 1 : 0.3, 1, 1, i === n - 1 ? 1 : 0.3]);
  const x = useTransform(p, [a0, a1], [i === 0 ? 0 : -10, 0]);
  return <motion.div style={{ opacity, x }} className="flex min-h-[60vh] flex-col justify-center py-6">{children}</motion.div>;
}

function OrbitChapter() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const rot = useTransform(p, [0, 1], [0, 540]);
  // SVG rotation written straight to the transform attribute, about the dial's centre in viewBox units.
  const orbitG = useRef<SVGGElement>(null);
  useMotionValueEvent(rot, "change", (v) => orbitG.current?.setAttribute("transform", `rotate(${v.toFixed(2)} 100 100)`));
  const orbitOpacity = useTransform(p, [0, 0.25, 0.32], [1, 1, 0.25]);
  const heat = useTransform(p, [0.2, 0.32, 0.5, 0.56], [0, 1, 1, 0]);
  const coarse = useTransform(p, [0.45, 0.55, 0.72, 0.78], [0, 1, 1, 0]);
  const fine = useTransform(p, [0.72, 0.82], [0, 1]);
  const steps = [
    ["01 · From orbit", "Five satellites circle Earth fourteen times a day.", "Terra and Aqua carry MODIS; Suomi-NPP, NOAA-20 and NOAA-21 carry VIIRS. Each crosses a given place at about the same local time every day."],
    ["02 · Heat", "They don't see flames. They see heat.", "A fire's radiated power, in megawatts, shows up in the infrared. Big fires shine; small ones barely register."],
    ["03 · 2000", "MODIS sees the world in 1 km squares.", "A small crop burn inside a square is too faint to cross the threshold. For twelve years, it simply isn't in the record."],
    ["04 · 2012", "VIIRS sees in 375 m squares. Seven times sharper.", "Suddenly the small fires appear. The record jumps — not because there is more fire, but because there is more seeing."],
  ];
  const fires = useMemo(() => Array.from({ length: 42 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 61) % 100, big: i % 7 === 0 })), []);
  return (
    <section ref={ref} className="relative mt-24 grid gap-8 md:grid-cols-2" style={{ height: "380vh" }}>
      <div className="md:pr-4">
        {steps.map(([e, t, b], i) => (
          <StoryStep key={i} i={i} n={steps.length} p={p}>
            <Eyebrow>{e}</Eyebrow>
            <h2 className="display mt-3 t-d2">{t}</h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-[var(--text-secondary)]">{b}</p>
          </StoryStep>
        ))}
      </div>
      <div className="sticky top-24 hidden h-[70vh] items-center justify-center md:flex">
        <div className="window relative aspect-square w-full max-w-[480px]">
          <motion.svg style={{ opacity: orbitOpacity }} viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
            <circle cx="100" cy="100" r="46" fill="#efe4cb" stroke="var(--ink)" strokeOpacity="0.25" />
            {[62, 74, 86].map((r, i) => <ellipse key={r} cx="100" cy="100" rx={r} ry={r * 0.36} fill="none" stroke="var(--ink)" strokeOpacity="0.14" strokeDasharray="2 3" transform={`rotate(${-30 + i * 28} 100 100)`} />)}
            <g ref={orbitG}>
              {[["#7a4fa0", 62, -30], ["#3f7f96", 74, -2], ["#d9431a", 86, 26]].map(([c, r, a], i) => (
                <g key={i} transform={`rotate(${a} 100 100)`}><circle cx={100 + (r as number)} cy="100" r="4" fill={c as string} /></g>
              ))}
            </g>
          </motion.svg>
          <motion.div style={{ opacity: heat }} className="absolute inset-8 rounded-2xl bg-[radial-gradient(circle_at_40%_45%,#fff0c7_0%,#f49b3f_22%,#c93f1c_40%,rgba(86,17,20,0.08)_70%,transparent)]">
            <p className="tabular absolute bottom-3 left-4 font-mono text-[11px] text-[var(--ink)]">fire radiative power, in MW</p>
          </motion.div>
          <motion.div style={{ opacity: coarse }} className="absolute inset-8 grid grid-cols-4 gap-1">
            {Array.from({ length: 16 }, (_, i) => <div key={i} className={`rounded-md ${[5, 10].includes(i) ? "bg-[var(--seq-5)]" : "bg-[var(--surface-2)]"}`} />)}
          </motion.div>
          <motion.div style={{ opacity: fine }} className="absolute inset-8 grid grid-cols-12 gap-[2px]">
            {Array.from({ length: 144 }, (_, i) => {
              const f = fires.find((q) => Math.floor(q.x / 8.4) + 12 * Math.floor(q.y / 8.4) === i);
              return <div key={i} className="rounded-[2px]" style={{ background: f ? (f.big ? "var(--seq-6)" : "var(--seq-3)") : "var(--surface-2)" }} />;
            })}
          </motion.div>
          <div className="absolute left-4 top-4 rounded-full bg-[var(--ink)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f7f3e8]">sensor view</div>
        </div>
      </div>
    </section>
  );
}

function pathOf(vals: number[], max: number, w = 640, h = 300) {
  return vals.map((v, i) => `${i ? "L" : "M"}${(20 + (i / (vals.length - 1)) * (w - 40)).toFixed(1)},${(h - 24 - (v / max) * (h - 48)).toFixed(1)}`).join(" ");
}

function JumpChapter({ row }: { row: CountryRow | undefined }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const years = useMemo(() => row?.annual.filter((a) => a.year >= 2003 && a.year <= 2025) ?? [], [row]);
  const raw = years.map((a) => a.raw), harm = years.map((a) => a.harm);
  const max = Math.max(1, ...raw) * 1.05;
  const draw = useTransform(p, [0.05, 0.45], [0, 1]);
  const morph = useTransform(p, [0.55, 0.8], [0, 1]);
  const d = useTransform(morph, (m) => pathOf(raw.map((r, i) => r + (harm[i] - r) * m), max));
  const area = useTransform(d, (s) => (years.length ? `${s} L620,276 L20,276 Z` : ""));
  const cap1 = useTransform(p, [0.3, 0.4, 0.52, 0.58], [0, 1, 1, 0]);
  const cap2 = useTransform(p, [0.7, 0.8], [0, 1]);
  const x2012 = 20 + ((2011.5 - 2003) / 22) * 600;
  return (
    <section ref={ref} className="relative mt-10" style={{ height: "320vh" }}>
      <div className="sticky top-20 flex min-h-[86vh] flex-col justify-center">
        <Eyebrow>05 · The jump · Canada, detections per year</Eyebrow>
        <h2 className="display mt-3 t-d2">The record says fire <span className="italic text-[var(--ember)]">exploded.</span></h2>
        <div className="window relative mt-8 p-4 sm:p-6">
          <svg viewBox="0 0 640 300" className="w-full">
            <defs><linearGradient id="hg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d9431a" stopOpacity="0.22" /><stop offset="1" stopColor="#d9431a" stopOpacity="0" /></linearGradient></defs>
            {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="20" x2="620" y1={276 - f * 252} y2={276 - f * 252} stroke="var(--gridline)" />)}
            <line x1={x2012} x2={x2012} y1="20" y2="276" stroke="var(--text-muted)" strokeDasharray="3 4" />
            <text x={x2012 + 6} y="32" fontSize="11" fill="var(--text-secondary)">2012 · VIIRS record begins</text>
            <motion.path d={area} fill="url(#hg)" style={{ opacity: draw }} />
            <motion.path d={d} fill="none" stroke="var(--ember)" strokeWidth="3" strokeLinejoin="round" style={{ pathLength: draw }} />
            {years.filter((a) => a.year % 4 === 3).map((a) => <text key={a.year} x={20 + ((a.year - 2003) / 22) * 600} y="294" fontSize="11" textAnchor="middle" fill="var(--text-muted)">{a.year}</text>)}
          </svg>
          <motion.div style={{ opacity: cap1 }} className="card absolute right-6 top-6 max-w-[16rem] p-4">
            <p className="display tabular text-5xl text-[var(--ember)]">{fmtRatio(row?.step_raw)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Yearly detections, 2012–14 against 2009–11, in the raw record.</p>
          </motion.div>
          <motion.div style={{ opacity: cap2 }} className="card absolute right-6 top-6 max-w-[17rem] p-4">
            <p className="display tabular text-5xl">{fmtRatio(row?.step_harm)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Harmonized. Aqua MODIS alone, an unchanged sensor, says {fmtRatio(row?.step_aqua)}. Much of the jump was the sensor.</p>
          </motion.div>
        </div>
        <motion.p style={{ opacity: cap2 }} className="display mt-6 t-d3">Much of it was detection, not fire. <span className="italic text-[var(--ember)]">Keep scrolling.</span></motion.p>
      </div>
    </section>
  );
}

function DriftChapter({ drift }: { drift: DriftFile | undefined }) {
  const [country, setCountry] = useState("Australia");
  return (
    <section className="mt-16 py-16">
      <Reveal><Eyebrow>06 · Still shifting</Eyebrow></Reveal>
      <Reveal delay={0.05}><h2 className="display mt-3 max-w-3xl t-d2">And the old satellites are <span className="italic text-[var(--ember)]">drifting.</span></h2></Reveal>
      <Reveal delay={0.1}>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--text-secondary)]">
          A satellite in a sun-synchronous orbit passes over a place at the same local time every day. Terra and Aqua no longer do. Each clock below is measured from the fire detections themselves, year by year.
        </p>
      </Reveal>
      <Reveal delay={0.12}><div className="mt-8"><DriftClocks drift={drift} country={country} onCountry={setCountry} /></div></Reveal>
      <Reveal><p className="mt-6 text-sm text-[var(--text-secondary)]"><Link className="link-ul" href="/satellites">Every satellite, and the drift year by year →</Link></p></Reveal>
    </section>
  );
}

/* ---------------------------------------------------------------- page */
export function Home() {
  const { data: d } = useHomeData();
  const canada = d?.table.countries.find((c) => c.country === "Canada");
  const chile = d?.season.countries.Chile?.trend_days_per_decade;
  return (
    <div>
      <Hero d={d} />
      <OrbitChapter />
      <JumpChapter row={canada} />

      <section className="mt-8 py-12">
        <Reveal><Eyebrow>07 · How we know</Eyebrow></Reveal>
        <Reveal delay={0.05}><h2 className="display mt-3 max-w-3xl t-d2">Tested on years the model <span className="italic text-[var(--ember)]">never saw.</span></h2></Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(d?.table.countries ?? []).filter((c) => ORIGINAL_FOUR.includes(c.country)).map((c, i) => (
            <Reveal key={c.country} delay={i * 0.07}>
              <div className="card p-5">
                <Eyebrow>{prettyName(c.country)}</Eyebrow>
                <p className="mt-3 text-[var(--ink)]"><DotStat text={fmtR2(c.r2_model)} dot={7} /></p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">held-out R² against observed Aqua · raw VIIRS {fmtR2(c.r2_raw)}</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <motion.div className="h-full rounded-full bg-[var(--ember)]" initial={{ width: 0 }} whileInView={{ width: `${Math.max(0, c.r2_model) * 100}%` }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE, delay: 0.2 + i * 0.07 }} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal><p className="mt-6 text-sm text-[var(--text-secondary)]">The four countries the method was built on. {(() => { const a = accuracySummary(d?.params); return a ? <>Across all {a.fitted} fitted countries, each fitted separately, the median held-out R² of the {a.own} own-fit countries is {fmtR2(a.medianR2)}; the model beats raw VIIRS in {a.beats} of {a.fitted}. </> : null; })()}Fitted {d ? span(d.params.train_years[0], d.params.train_years[1]) : "2012–2018"}, scored {d ? span(d.params.test_years[0], d.params.test_years[1]) : "2019–2021"} per ~250 km² cell and month. Fit {d?.params.fit_version}. <Link href="/method" className="link-ul">Every country, method and proof →</Link></p></Reveal>
      </section>

      <DriftChapter drift={d?.drift} />

      <section className="py-16">
        <Reveal><Eyebrow>08 · What it changes</Eyebrow></Reveal>
        <div className="mt-6 grid items-center gap-8 lg:grid-cols-2">
          <Reveal><h2 className="display t-d2">Is the fire season starting earlier? <span className="italic text-[var(--ember)]">Less than the raw data says.</span></h2></Reveal>
          <Reveal delay={0.1}>
            <div className="card p-6">
              <Eyebrow>Chile · season onset trend, 2003–2025</Eyebrow>
              <div className="mt-5 space-y-5">
                {[["Raw record", chile?.raw_onset, "#c93f1c"], ["Harmonized", chile?.harm_onset, "var(--ink)"]].map(([l, v, c]) => (
                  <div key={l as string}>
                    <div className="flex justify-between text-sm"><span>{l as string}</span><span className="tabular display text-2xl">{v == null ? "—" : <>{fmtSigned(v as number)} <span className="stat-unit text-[var(--text-secondary)]">days / decade</span></>}</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <motion.div className="h-full rounded-full" style={{ background: c as string }} initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, Math.abs((v as number) ?? 0) * 10)}%` }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-relaxed text-[var(--text-secondary)]">Negative = earlier.{chile?.raw_onset != null && chile?.harm_onset != null && chile.raw_onset !== 0 ? ` ${Math.round((1 - chile.harm_onset / chile.raw_onset) * 100)}% of the apparent shift disappears once VIIRS's extra small early-season detections are weighted to the MODIS scale.` : ""} <Link href="/trends" className="link-ul">Every country →</Link></p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-16">
        <Reveal><Eyebrow>09 · Everything inside</Eyebrow></Reveal>
        <Reveal delay={0.05}><h2 className="display mt-3 t-d2">One record. <span className="italic text-[var(--ember)]">Nine ways in.</span></h2></Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALL.map((t, i) => (
            <Reveal key={t.href} delay={(i % 3) * 0.07}>
              <Link href={t.href} className="card group block h-full p-6">
                <Eyebrow><span className="eyebrow-n">{String(i + 1).padStart(2, "0")}</span></Eyebrow>
                <p className="display mt-3 text-3xl">{t.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{t.blurb}</p>
                <p className="mt-5 text-sm font-medium text-[var(--ember)] transition-transform group-hover:translate-x-1">Open →</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal>
        <section className="window relative mt-8 overflow-hidden p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_50%_0%,rgba(255,180,110,0.35),transparent)]" />
          <h2 className="display relative t-d1">Pick a place. <span className="italic text-[var(--ember)]">See its fires.</span></h2>
          <p className="relative mx-auto mt-4 max-w-lg text-[var(--text-secondary)]">Draw any area on the map, choose the years, and download the harmonized calendar as CSV. No account, no API key.</p>
          <Link href="/explorer" className="pill-dark relative mt-8 inline-block px-7 py-3.5 text-[15px] font-medium">Open the calendar explorer →</Link>
        </section>
      </Reveal>
    </div>
  );
}
