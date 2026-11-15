"use client";

/**
 * Home: one story in five chapters. Problem (the 2012 jump), Repair (raw becomes harmonized),
 * Proof (three blind checks), Your area (the calendar and a plain verdict) and Now (this month
 * and the live layer). Each chapter is one headline, one sentence, one visual and at most three
 * figures; everything else sits behind an expander or an "i". Every number is read from the
 * published data files.
 */
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CountryPicker } from "@/components/CountryPicker";
import { DataJourney } from "@/components/DataJourney";
import { DotClock, useToday } from "@/components/DotMatrix";
import { Stat } from "@/components/Figure";
import { EASE } from "@/lib/motion";
import { DriftClocks } from "@/components/DriftClocks";
import { Eyebrow } from "@/components/Figure";
import { MonthUnusualPanel } from "@/components/MonthToDate";
import { TwoJoins } from "@/components/TwoJoins";
import { MonthYearCalendar } from "@/components/MonthYearCalendar";
import { PaperCutout } from "@/components/PaperCutout";
import { HeadlineTable, StepCollapse } from "@/components/Proof";
import { NSW_REPORT } from "@/lib/reportLink";
import { CountUp, DotDigits, DotSkeleton, Expand, Failed, InfoDot, Pill, Reveal, SectionHead, StatTile, Tile } from "@/components/ui";
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
/** Still globe shown until the interactive one starts (same picture as the globe's own poster, without loading three.js). */
function GlobeStill({ height }: { height: number }) {
  const d = Math.round(height * 0.72);
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <div aria-hidden className="rounded-full shadow-[0_0_60px_10px_rgba(242,165,107,0.35)]" style={{ width: d, maxWidth: "100%", aspectRatio: "1 / 1", background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 50% 50%, transparent 58%, rgba(60,30,15,0.18) 72%), url(/geo/land-dots.png) 22% 50% / 200% 100% #f3ecdc", backgroundBlendMode: "normal, normal, multiply" }} />
    </div>
  );
}

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

const FIRST = 2003, LAST = 2025;

/** Splits a headline line into words that rise in one after another. */
function Words({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {text.split(" ").map((w, i, a) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-top">
          <motion.span className="inline-block" initial={{ y: "105%", opacity: 0, rotate: 4 }} animate={{ y: "0%", opacity: 1, rotate: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: delay + i * 0.04 }}>{w}{i < a.length - 1 ? "\u00a0" : ""}</motion.span>
        </span>
      ))}
    </>
  );
}


/* ------------------------------------------------------------------ hero */
function Hero({ d }: { d: HomeData }) {
  const sum = d.sum;
  const live24 = sum ? Object.values(sum.windows["24h"].totals).reduce((a, b) => a + b, 0) : 0;
  // The globe is the heaviest thing on the page: a still stands in until the page has loaded and gone idle.
  const [spin, setSpin] = useState(false);
  useEffect(() => {
    let t = 0;
    const go = () => { t = window.setTimeout(() => setSpin(true), 400); };
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
    return () => { clearTimeout(t); window.removeEventListener("load", go); };
  }, []);
  const { data: live } = useParquet(() => (spin ? getLive() : new Promise<Awaited<ReturnType<typeof getLive>>>(() => {})), spin ? "home-live" : "home-live-wait");

  return (
    <section className="relative pb-10 pt-12 sm:pt-20">
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <div className="glass-thin mx-auto inline-flex items-center gap-2.5 bg-[var(--surface)] px-4 py-1.5 text-[13px] text-[var(--text-secondary)]">
          <span className="live-dot" aria-hidden />
          {sum ? <span><span className="tabular font-medium text-[var(--text-primary)]">{fmtInt(live24)}</span> near-real-time, raw detections in the 24 h to <span className="tabular">{fmtUtc(parseUtc(sum.fetched_utc))}</span></span> : "NASA FIRMS · MODIS + VIIRS · archive 2001–2025"}
        </div>
        <h1 className="display t-hero mt-8">
          <span className="block"><Words text="23 years of fire." delay={0.05} /></span>
          <span className="block text-[var(--red)] sm:whitespace-nowrap"><Words text="One steady line." delay={0.22} /></span>
        </h1>
        <p className="mx-auto mt-7 max-w-[34rem] text-[18px] leading-relaxed text-[var(--text-secondary)]">
          In 2012 the fire satellites changed, and the counts jumped overnight. The fires did not. We repair that break, country by country, into one burning activity calendar, so a fire manager can see whether a month in their area is <span className="accent text-[1.15em] text-[var(--text-primary)]">really unusual.</span>
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Pill href="/explorer" tone="red">Check your area</Pill>
          <Pill href={NSW_REPORT} tone="ink">Get a report</Pill>
          <Pill href="/globe" tone="line">Live globe →</Pill>
        </div>
        <nav aria-label="The evidence" className="mx-auto mt-7 grid max-w-3xl gap-3 text-left sm:grid-cols-3" data-testid="hero-evidence">
          {[
            ["#repair", "Before and after", "The naively joined raw record against the harmonized one, Canada 2003–2025."],
            ["/method", "The method", "How each VIIRS detection becomes an Aqua-MODIS-equivalent count."],
            ["/method#headline", "The validation", "Four corrections scored on the same held-out years, 2019–2021."],
          ].map(([href, t, d2]) => (
            <Link key={href} href={href} className="tile group block p-4">
              <p className="text-[14px] font-medium">{t} <span aria-hidden className="inline-block text-[var(--red)] transition-transform group-hover:translate-x-1">{href.startsWith("#") ? "↓" : "→"}</span></p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{d2}</p>
            </Link>
          ))}
        </nav>
        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          <a href="#story" className="no-ul hover:text-[var(--text-primary)]">The story ↓</a><a href="#proof" className="no-ul hover:text-[var(--text-primary)]">The proof ↓</a><a href="#area" className="no-ul hover:text-[var(--text-primary)]">Your area ↓</a><a href="#tools" className="no-ul hover:text-[var(--text-primary)]">The tools ↓</a>
        </p>
      </div>

      <div className="relative mx-auto mt-4 max-w-[760px] cursor-grab active:cursor-grabbing">
        {spin ? <FireGlobe live={live ?? null} tle={d.tle?.satellites ?? null} interactive allowZoom={false} showOrbits height={600} speed={60} maxPoints={5000} /> : <GlobeStill height={600} />}
        <p className="pointer-events-none mt-1 text-center font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Drag to spin · hover a fire for details · live layer: NOAA-20 / NOAA-21 / MODIS, raw</p>
      </div>

      <Widgets d={d} />
      <nav aria-label="Start here" className="mx-auto mt-4 grid max-w-5xl gap-4 sm:grid-cols-3">
        {[
          ["/explorer", "Explore a country", "Its month-by-month detections, raw or harmonized, as a calendar you can download."],
          ["/compare", "Compare two regions", "Two countries side by side, in one unit, on one scale."],
          ["/method", "Understand the correction", "How VIIRS detections become Aqua-equivalent, and how it was tested."],
        ].map(([href, t, d2]) => (
          <Link key={href} href={href} className="tile group block p-5">
            <p className="text-[15px] font-medium">{t} <span aria-hidden className="inline-block text-[var(--red)] transition-transform group-hover:translate-x-1">→</span></p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">{d2}</p>
          </Link>
        ))}
      </nav>
      {d.table && <Ticker names={[...[...d.table.countries].sort((a, b) => b.harm_mean_2003_2025 - a.harm_mean_2003_2025).slice(0, 24).map((c) => prettyName(c.country)), "Terra", "Aqua", "Suomi-NPP", "NOAA-20", "NOAA-21"]}
        label={`The ${Math.min(24, d.table.countries.length)} fitted countries with the most fire, and the satellites`} />}
    </section>
  );
}

/* ------------------------------------------- ticker of existing names */
function Ticker({ names, label }: { names: string[]; label: string }) {
  const [paused, setPaused] = useState(false);
  const row = names.map((n) => (
    <span key={n} className="flex items-center gap-6 pr-6 font-mono text-[12px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
      {n}<span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--red)]" />
    </span>
  ));
  return (
    <div className="mx-auto mt-14 flex max-w-5xl items-center gap-3">
      <div className={`marquee marquee-quiet flex-1 py-2 ${paused ? "marquee-paused" : ""}`}>
        <p className="sr-only">{label}: {names.join(", ")}</p>
        <div aria-hidden>{row}{row.map((r, i) => <span key={i}>{r}</span>)}</div>
      </div>
      <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? "Play the name ticker" : "Pause the name ticker"}
        className="glass-thin flex h-8 w-8 shrink-0 items-center justify-center text-[11px] text-[var(--text-secondary)]">{paused ? "▶" : "❚❚"}</button>
    </div>
  );
}

/* ------------------------------------------------- "at a glance" panel */
/** What each live feed is, in words (keys as written by scripts/build_live.py). */
const FEED: Record<string, { name: string; sensor: string; color: string }> = {
  "NOAA-20": { name: "NOAA-20", sensor: "VIIRS 375 m", color: "var(--on-ink)" },
  "NOAA-21": { name: "NOAA-21", sensor: "VIIRS 375 m", color: "var(--grey-2)" },
  MODIS: { name: "Terra + Aqua", sensor: "MODIS 1 km", color: "var(--red)" },
};
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Widgets({ d }: { d: HomeData }) {
  const now = useToday();
  const tile = "tile h-full p-5 sm:p-6";
  const dark = "tile-ink";
  const w = d.sum?.windows["24h"];
  const feeds = w ? Object.entries(w.totals) : [];
  const live24 = feeds.length ? feeds.reduce((a, [, v]) => a + v, 0) : null;
  const fetched = parseUtc(d.sum?.fetched_utc);
  const age = fmtAge(fetched, now);
  const dates = w?.dates ?? [];
  const countries = d.table?.countries ?? [];
  const notFitted = d.table?.not_fitted ?? [];
  const detections = countries.length ? countries.reduce((a, c) => a + c.detections_filtered, 0) + notFitted.reduce((a, c) => a + c.detections_filtered, 0) : null;
  const withRecord = countries.length + notFitted.filter((c) => c.has_raw_calendar && c.detections_filtered > 0).length;
  const years = countries.flatMap((c) => c.annual.map((a) => a.year));
  const acc = accuracySummary(d.params ?? undefined);
  const sats = d.tle?.satellites ?? [];
  const p = d.params ?? undefined;
  return (
    <section aria-labelledby="glance" className="mx-auto mt-16 max-w-5xl">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <Eyebrow info={false}>At a glance · read from the data files</Eyebrow>
            <h2 id="glance" className="display t-d3 mt-2">One day of fire, and the long record it joins.</h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
            The live count is today&apos;s raw satellite view. Emberline&apos;s job is the long record: every year from 2003 to 2025 converted to one unit (Aqua MODIS-equivalent), so a fire season in 2005 and one in 2025 can be compared on the same footing. 2001–2002 are not complete Aqua reference years (Aqua launched in 2002).
          </p>
        </div>
      </Reveal>

      <div className="mt-6 grid gap-3 sm:gap-4 md:grid-cols-3">
        <Reveal className="md:col-span-2">
          <div className={`${tile} ${dark}`}>
            <div className="flex items-start justify-between gap-4">
              <Eyebrow info={false} className="!text-inherit opacity-70">Near-real-time · raw detections · last 24 hours</Eyebrow>
              <span className="live-dot mt-1 shrink-0" aria-hidden />
            </div>
            <div className="mt-5">
              {live24 != null ? <DotDigits text={fmtInt(live24)} className="text-[clamp(3rem,2rem+6vw,6.5rem)] leading-none" /> : <p className="font-mono text-sm uppercase tracking-[0.14em] opacity-60">{d.sum === undefined ? "loading" : "not recorded"}</p>}
            </div>
            <p className="mt-3 text-[15px] leading-snug">
              <span className="font-medium">active-fire detections</span> <span className="opacity-70">Each one a satellite pixel flagged as burning, seen from orbit in the 24 hours before the snapshot.</span>
            </p>
            {live24 != null && (
              <div className="mt-5">
                <div className="flex h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--on-ink)_14%,transparent)]" aria-hidden>
                  {feeds.map(([k, v]) => <span key={k} style={{ width: `${(v / live24) * 100}%`, background: FEED[k]?.color ?? "#999" }} />)}
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-3">
                  {feeds.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 sm:block">
                      <dt className="opacity-75"><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: FEED[k]?.color ?? "#999" }} />{FEED[k]?.name ?? k} <span className="opacity-60">· {FEED[k]?.sensor ?? ""}</span></dt>
                      <dd className="tabular font-medium sm:mt-0.5"><CountUp to={v} /></dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <div className="mt-5 border-t border-[color-mix(in_srgb,var(--on-ink)_16%,transparent)] pt-4 text-[12px] leading-relaxed opacity-80">
              <p>
                <span>As of {fmtUtc(fetched)}</span>{age && <> · updated {age}</>}
                {dates.length > 0 && <> · acquisitions dated {dates.length > 1 ? `${dayLabel(dates[0])} – ${dayLabel(dates[dates.length - 1])}` : dayLabel(dates[0])} (UTC)</>}
              </p>
              <p className="stat-source mt-1.5 opacity-80">
                Source: NASA FIRMS near-real-time global 24 h feeds — VIIRS on NOAA-20 and NOAA-21, MODIS C6.1 on Terra and Aqua. Raw and uncorrected; not the Suomi-NPP record Emberline harmonizes, whose live feed is empty. Includes volcanoes and gas flares.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div className={`${tile} flex flex-col items-center text-center`}>
            <Eyebrow className="self-start">Time now · UTC</Eyebrow>
            <DotClock size={128} />
            <p className="tabular display mt-1 text-2xl">{now ? fmtClock(now.getUTCHours() + now.getUTCMinutes() / 60) : "loading"} <span className="text-sm font-medium text-[var(--text-muted)]">UTC</span></p>
            <p className="text-sm text-[var(--text-secondary)]">{now ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : ""}</p>
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-muted)]">Satellite fire records are stamped in UTC. Emberline converts each detection to local solar time (UTC + longitude ÷ 15) before any time-of-day analysis.</p>
          </div>
        </Reveal>

        <Reveal>
          <div className={tile}>
            <Stat dot label="The record" value={detections != null ? `${fmtNum(detections / 1e6, 1)}M` : d.table === undefined ? "loading" : "not recorded"}
              unit="detections"
              note={<>Daytime vegetation-fire detections, raw, {years.length ? span(Math.min(...years), Math.max(...years)) : "loading"}, in {withRecord || "loading"} FIRMS countries and territories; {countries.length || "loading"} of them have enough data to fit. Exact total {fmtInt(detections)}.</>}
              source={<>Source: NASA FIRMS archive (MODIS C6.1, VIIRS Suomi-NPP) · countries.json</>} />
          </div>
        </Reveal>
        <Reveal delay={0.05}>
          <div className={`${tile} !border-transparent !bg-[var(--red)] text-white`}>
            <Stat dot tone="ember" label="Held-out R² · median country" value={acc ? fmtR2(acc.medianR2) : d.params === undefined ? "loading" : "not recorded"} unit="R²"
              note={acc && p ? <>Median held-out R² over the {acc.own} countries with their own fit: the corrected record against Aqua reference observations in {span(p.test_years[0], p.test_years[1])}, years left out of the fit. 1 is perfect. Best single country: {prettyName(acc.best)}, {fmtR2(acc.bestR2)} (raw VIIRS there: {fmtR2(acc.bestRaw)}). The model beats raw VIIRS in {acc.beats} of {acc.fitted} fitted countries.</> : null}
              source={p ? <>Fit {p.fit_version} · trained {span(p.train_years[0], p.train_years[1])}</> : null} />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <Link href="/satellites" className={`${tile} ${dark} group flex flex-col`}>
            <Stat dot tone="dark" label="The fleet" value={sats.length ? String(sats.length) : d.tle === undefined ? "loading" : "not recorded"} unit="satellites"
              note={<>
                In the harmonized record: {sats.filter((s) => s.name !== "NOAA-20" && s.name !== "NOAA-21").map((s) => `${s.name} (${s.instrument})`).join(", ")}.
                {" "}Live layer only: {sats.filter((s) => s.name === "NOAA-20" || s.name === "NOAA-21").map((s) => s.name).join(", ")} (VIIRS).
              </>}
              source={d.tle ? <>Orbits: public TLEs, {fmtUtc(parseUtc(d.tle.fetched))}</> : null} />
            <span className="mt-auto pt-4 text-sm opacity-70 transition-transform group-hover:translate-x-1">See every satellite →</span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}


/* --------------------------------------------------------- sticky story */
/**
 * One text step of the sticky story. `active` comes from the chapter's single
 * useActiveStep() measurement, the same value that picks the visual, so the
 * text and the picture can never be a step apart.
 */
function StoryStep({ i, active, children }: { i: number; active: number; children: React.ReactNode }) {
  return (
    <div data-story-step={i} data-active={i === active ? "" : undefined}
      className="flex min-h-[48vh] flex-col justify-center py-6 transition-[opacity,transform] duration-[250ms] ease-out"
      style={{ opacity: i === active ? 1 : 0.3, transform: i > active ? "translateX(-10px)" : "none" }}>{children}</div>
  );
}

/**
 * Index of the story step under the middle of the viewport. An
 * IntersectionObserver with a thin band at the viewport centre
 * (rootMargin -45% top and bottom) fires whenever a step enters or leaves the
 * middle; the step whose box holds the centre line is then the active one.
 * Before the first step reaches the middle it is step 0; after the last one
 * has passed, the last step stays active.
 */
function useActiveStep(root: React.RefObject<HTMLElement | null>): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const steps = [...(root.current?.querySelectorAll<HTMLElement>("[data-story-step]") ?? [])];
    if (!steps.length || typeof IntersectionObserver === "undefined") return;
    const pick = () => {
      const mid = window.innerHeight / 2;
      const i = steps.findIndex((el) => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
      if (i >= 0) setActive(i);
      else if (steps[0].getBoundingClientRect().top > mid) setActive(0);
      else if (steps[steps.length - 1].getBoundingClientRect().bottom <= mid) setActive(steps.length - 1);
    };
    const io = new IntersectionObserver(pick, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach((el) => io.observe(el));
    // Backstop for jumps and late layout shifts the band can miss: one re-check when scrolling stops
    // (scrollend), never per scroll frame.
    window.addEventListener("scrollend", pick, { passive: true });
    pick();
    return () => { io.disconnect(); window.removeEventListener("scrollend", pick); };
  }, [root]);
  return active;
}

function OrbitChapter() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: orbitP } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useScrollOrFinal(orbitP, 1);
  const rot = useTransform(p, [0, 1], [0, 540]);
  // SVG rotation written straight to the transform attribute, about the dial's centre in viewBox units.
  const orbitG = useRef<SVGGElement>(null);
  useMotionValueEvent(rot, "change", (v) => orbitG.current?.setAttribute("transform", `rotate(${v.toFixed(2)} 100 100)`));
  // One measurement drives both columns: the step at the viewport centre is the active one, and each
  // visual is shown exactly while its own step is active (0 orbits, 1 heat, 2 MODIS 1 km grid, 3 VIIRS 375 m grid).
  const active = useActiveStep(ref);
  const layer = (k: number) => ({ opacity: active === k ? 1 : 0 });
  const fadeCls = "transition-opacity duration-[250ms] ease-out";
  const steps = [
    ["01 · From orbit", "Five satellites circle Earth fourteen times a day.", "Terra and Aqua carry MODIS; Suomi-NPP, NOAA-20 and NOAA-21 carry VIIRS. Each crosses a given place at about the same local time every day."],
    ["02 · Heat", "They don't see flames. They see heat.", "A fire's radiated power, in megawatts, shows up in the infrared. Big fires shine; small ones barely register."],
    ["03 · 2000", "MODIS sees the world in 1 km squares.", "A small crop burn inside a square is too faint to cross the threshold. For twelve years, it simply isn't in the record."],
    ["04 · 2012", "VIIRS sees in 375 m squares. Seven times sharper.", "Suddenly the small fires appear. Join the two records and the count jumps — not because there is more fire, but because there is more seeing."],
  ];
  const fires = useMemo(() => Array.from({ length: 42 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 61) % 100, big: i % 7 === 0 })), []);
  return (
    <section ref={ref} className="relative mt-10 grid gap-8 md:grid-cols-2" style={{ height: "300vh" }}>
      <div className="md:pr-4">
        {steps.map(([e, t, b], i) => (
          <StoryStep key={i} i={i} active={active}>
            <Eyebrow>{e}</Eyebrow>
            <h2 className="display mt-3 t-d2">{t}</h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-[var(--text-secondary)]">{b}</p>
          </StoryStep>
        ))}
      </div>
      <div className="sticky top-24 hidden h-[70vh] items-center justify-center md:flex">
        <div className="window relative aspect-square w-full max-w-[480px]">
          <svg data-story-visual="orbit" style={{ opacity: active === 0 ? 1 : 0.25 }} viewBox="0 0 200 200" className={`absolute inset-0 h-full w-full ${fadeCls}`}>
            <circle cx="100" cy="100" r="46" fill="var(--surface-alt)" stroke="var(--text-primary)" strokeWidth="1.5" />
            {[62, 74, 86].map((r, i) => <ellipse key={r} cx="100" cy="100" rx={r} ry={r * 0.36} fill="none" stroke="var(--ink)" strokeOpacity="0.14" strokeDasharray="2 3" transform={`rotate(${-30 + i * 28} 100 100)`} />)}
            <g ref={orbitG}>
              {[["var(--text-primary)", 62, -30], ["var(--grey-2)", 74, -2], ["var(--red)", 86, 26]].map(([c, r, a], i) => (
                <g key={i} transform={`rotate(${a} 100 100)`}><circle cx={100 + (r as number)} cy="100" r="4" fill={c as string} /></g>
              ))}
            </g>
          </svg>
          <div data-story-visual="heat" style={layer(1)} className={`${fadeCls} absolute inset-8 rounded-2xl bg-[radial-gradient(circle_at_40%_45%,var(--seq-1)_0%,var(--seq-3)_22%,var(--seq-5)_40%,transparent_70%)]`}>
            <p className="tabular absolute bottom-3 left-4 font-mono text-[11px] text-[var(--text-primary)]">fire radiative power, in MW</p>
          </div>
          <div data-story-visual="modis" style={layer(2)} className={`${fadeCls} absolute inset-8 grid grid-cols-4 gap-1`}>
            {Array.from({ length: 16 }, (_, i) => <div key={i} className={`rounded-md ${[5, 10].includes(i) ? "bg-[var(--seq-5)]" : "bg-[var(--surface-2)]"}`} />)}
          </div>
          <div data-story-visual="viirs" style={layer(3)} className={`${fadeCls} absolute inset-8 grid grid-cols-12 gap-[2px]`}>
            {Array.from({ length: 144 }, (_, i) => {
              const f = fires.find((q) => Math.floor(q.x / 8.4) + 12 * Math.floor(q.y / 8.4) === i);
              return <div key={i} className="rounded-[2px]" style={{ background: f ? (f.big ? "var(--seq-6)" : "var(--seq-3)") : "var(--surface-2)" }} />;
            })}
          </div>
          <div className="absolute left-4 top-4 rounded-full bg-[var(--ink)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--on-ink)]">sensor view</div>
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
  const { scrollYProgress: jumpP } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useScrollOrFinal(jumpP, 1);
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
    <section ref={ref} className="relative mt-10" style={{ height: "260vh" }}>
      <div className="sticky top-20 flex min-h-[86vh] flex-col justify-center">
        <Eyebrow info="step">05 · The jump · Canada, detections per year</Eyebrow>
        <h2 className="display mt-3 t-d2">A naive join says fire <span className="italic">exploded.</span></h2>
        <div className="window relative mt-8 p-4 sm:p-6">
          <svg viewBox="0 0 640 300" className="w-full">
            <defs><linearGradient id="hg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--c-harm)" stopOpacity="0.22" /><stop offset="1" stopColor="var(--c-harm)" stopOpacity="0" /></linearGradient></defs>
            {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="20" x2="620" y1={276 - f * 252} y2={276 - f * 252} stroke="var(--gridline)" />)}
            <line x1={x2012} x2={x2012} y1="20" y2="276" stroke="var(--red)" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
            <text x={x2012 + 6} y="32" fontSize="11" fill="var(--text-secondary)">2012 · VIIRS record begins</text>
            <motion.path d={area} fill="url(#hg)" style={{ opacity: draw }} />
            <motion.path d={d} fill="none" stroke="var(--ember)" strokeWidth="3" strokeLinejoin="round" style={{ pathLength: draw }} />
            {years.filter((a) => a.year % 4 === 3).map((a) => <text key={a.year} x={20 + ((a.year - 2003) / 22) * 600} y="294" fontSize="11" textAnchor="middle" fill="var(--text-muted)">{a.year}</text>)}
          </svg>
          <motion.div style={{ opacity: cap1 }} className="card absolute right-6 top-6 max-w-[16rem] p-4">
            <p className="dot-num text-5xl text-[var(--c-raw)]">{fmtRatio(row?.step_raw)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Yearly detections, 2012–14 against 2009–11, with MODIS and VIIRS naively joined.</p>
          </motion.div>
          <motion.div style={{ opacity: cap2 }} className="card absolute right-6 top-6 max-w-[17rem] p-4">
            <p className="dot-num text-5xl text-[var(--c-harm)]">{fmtRatio(row?.step_harm)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Harmonized. Aqua MODIS alone, an unchanged sensor, says {fmtRatio(row?.step_aqua)}. Much of the jump was the sensor.</p>
          </motion.div>
        </div>
        <motion.p style={{ opacity: cap2 }} className="display mt-6 t-d3">Much of it was detection, not fire. <span className="italic">Keep scrolling.</span></motion.p>
      </div>
    </section>
  );
}

function DriftChapter({ drift }: { drift: DriftFile | undefined }) {
  const [country, setCountry] = useState("Australia");
  return (
    <section className="py-[var(--sec-md)]">
      <Reveal><Eyebrow>06 · Still shifting</Eyebrow></Reveal>
      <Reveal delay={0.05}><h2 className="display mt-3 max-w-3xl t-d2">And the old satellites are <span className="italic">drifting.</span></h2></Reveal>
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

/* ----------------------------------------------------------- 03 · proof */
function Proof({ d }: { d: HomeData }) {
  const { ref, near } = useNear<HTMLElement>();
  const { data: pf } = useParquet(() => (near ? getProof() : new Promise<Awaited<ReturnType<typeof getProof>>>(() => {})), near ? "home-proof" : "home-proof-wait");
  const pct = (v: number) => `${fmtNum(v * 100, 1)}%`;
  const s = pf?.step_collapse.all, r = pf?.records, seam = pf?.seam;
  const acc = accuracySummary(d.params ?? undefined);
  return (
    <section id="proof" ref={ref} className="scroll-mt-24 py-[var(--sec-lg)]">
      <Reveal><SectionHead eyebrow="03 · Proof" size="d1" title={<>Three checks the repair <span className="italic">could have failed.</span></>}
        lede="None of them uses the fitting target. Each asks one thing: after the repair, does 2012 still look special?" /></Reveal>
      <div className="mt-10 grid gap-4 lg:grid-cols-3" data-testid="home-proof">
        <Reveal><StatTile tone="ink" size="lg" label="Step collapse" info="stepCollapse" value={s ? `${s.within_1_25_harm}/${s.n}` : pf === undefined ? undefined : undefined}
          note={s && pf ? <>countries whose 2012 step now lands within ×{pf.step_collapse.within_factor} of an unchanged sensor. In the raw splice: <span className="dot-num">{s.within_1_25_raw}/{s.n}</span>.</> : "Loading proof.json"} className="h-full" /></Reveal>
        <Reveal delay={0.06}><StatTile size="lg" label="False-Record Counter" info="falseRecord" value={r ? pct(r.series.harmonized.share) : undefined}
          note={r ? <>of months in 2012–2021 beat the 2003–2011 maximum of their calendar month, down from <span className="dot-num">{pct(r.series.raw_splice.share)}</span> when MODIS and VIIRS are naively joined. No-change reference {fmtNum(r.chance_reference.share * 100, 0)}%: with 9 baseline years, a year like them has a 1 in 10 chance of being the largest of 10.</> : "Loading proof.json"} className="h-full" /></Reveal>
        <Reveal delay={0.12}><StatTile size="lg" label="Find the Seam" info="seam" value={seam ? `${seam.harm_2012}/${seam.n_countries}` : undefined}
          note={seam ? <>countries where 2012 is still the biggest jump, down from <span className="dot-num">{seam.raw_2012}/{seam.n_countries}</span>. By chance alone: {fmtNum(seam.chance_2012, 1)}.</> : "Loading proof.json"} className="h-full" /></Reveal>
      </div>
      <Reveal><Tile className="mt-8 min-w-0 p-5 sm:p-7"><HeadlineTable lazy compact /></Tile></Reveal>
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

/* ------------------------------------------------------- worked example */
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function WorkedExample() {
  const { ref, near } = useNear<HTMLElement>();
  const { data: pf } = useParquet(() => (near ? getProof() : new Promise<Awaited<ReturnType<typeof getProof>>>(() => {})), near ? "home-proof" : "home-proof-wait");
  const w = pf?.worked_example, u = w?.unusual;
  const err = w ? pf?.limits.per_country[w.main_country] : undefined;
  const href = w ? `/explorer?box=${w.bbox.join(",")}&mode=harmonized` : "/explorer";
  const mo = u ? MONTH_NAMES[u.month - 1] : "";
  const steps: Array<[string, React.ReactNode]> = w && u ? [
    ["Select an area", <>A box over {w.label}: {fmtInt(w.n_cells)} grid cells of about 45 km, {fmtInt(w.n_cells_with_data)} with detections, all in {w.countries.map(prettyName).join(", ")} ({w.main_country_fit_source === "pooled" ? "pooled fit" : "own fit"}).</>],
    ["Find its most unusual month", <>In the harmonized record, {w.years[0]}–{w.years[1]}: <span className="text-[var(--text-primary)]">{mo} {u.year}</span>, {fmtInt(u.value)} detections, rank {u.rank} of {u.n_years} {mo}s.</>],
    ["Compare it with history", <>The other {u.n_reference_years} {mo}s, {w.years[0]}–{w.years[1]} ({mo} {u.year} itself excluded): median {fmtInt(u.median)}, range {fmtInt(u.min)}–{fmtInt(u.max)}.
      Same box (the same {fmtInt(w.n_cells)} cells), same calendar month, same harmonized series ({prettyName(w.main_country)}&apos;s {w.main_country_fit_source === "pooled" ? "pooled" : "own"} fit).</>],
    ["Read the result", <>{mo} {u.year} had about {u.times_median != null ? `${fmtNum(u.times_median, 0)} times` : "far more than"} the median of the other {mo}s here, and {fmtNum(u.value / u.next_highest, 1)} times the highest of them ({fmtInt(u.next_highest)}).
      {err?.[0] != null && <> {prettyName(w.main_country)}&apos;s typical held-out error is ±{fmtNum(err[0], 0)}% (median monthly miss, 2019–2021; not a confidence interval; 1 month in 5 missed by more than ±{fmtNum(err[1], 0)}%), far smaller than that gap.</>}
      {" "}The raw record shows {fmtInt(w.raw_same_month)} that month, but raw VIIRS counts cannot be compared with MODIS months before 2012.</>],
    ["Download it", <>In the Explorer, <span className="text-[var(--text-primary)]">Calendar CSV</span> saves the monthly series with its unit, fit version and a link that rebuilds the view.</>],
  ] : [];
  return (
    <section id="example" ref={ref} className="scroll-mt-24 py-[var(--sec-md)]" data-testid="worked-example">
      <Reveal><SectionHead eyebrow="Worked example · for a land manager or emergency planner" title={<>How unusual was <span className="italic">that month?</span></>}
        lede="Five steps with real numbers. This is historical context: it describes the record, it does not predict fires." /></Reveal>
      {!w ? <DotSkeleton h={260} label="Loading the worked example" /> : (
        <Reveal>
          <ol className="mt-8 grid gap-4 md:grid-cols-5">
            {steps.map(([t, body], i) => (
              <li key={t}><Tile className="h-full p-5">
                <Eyebrow info={false}><span className="eyebrow-n">{String(i + 1).padStart(2, "0")}</span> · {t}</Eyebrow>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">{body}</p>
              </Tile></li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Pill href={NSW_REPORT} tone="red">Open the full report →</Pill>
            <Pill href={href} tone="line">Open this area in the Explorer →</Pill>
            <p className="text-[12px] text-[var(--text-muted)]">Most unusual month: the highest rank among the same calendar month in every year, ties broken by the gap to its median; median and range are the other years of that month. <InfoDot k="unusualMonth" align="start" /></p>
          </div>
        </Reveal>
      )}
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
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
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

/* ---------------------------------------------------------------- page */
export function Home() {
  const d = useHomeData();
  const canada = d.table?.countries.find((c) => c.country === "Canada");
  const { ref: journeyRef, near: journeyNear } = useNear<HTMLDivElement>("600px");
  return (
    <div>
      <Hero d={d} />
      <TwoJoins />
      <div id="now" className="scroll-mt-24"><MonthUnusualPanel /></div>
      {d.error && <div className="mx-auto my-8 max-w-3xl"><Failed error={d.error} retry={d.retry} what="the summary figures" /></div>}

      <section id="story" className="scroll-mt-24 pt-[var(--sec-lg)]">
        <div className="grid items-end gap-8 md:grid-cols-[1.6fr_1fr]">
          <Reveal><SectionHead eyebrow="The story" title={<>How joining two satellite records <span className="italic">creates a jump.</span></>} lede="Four short steps, then the jump itself, then the repair. Scroll through, or skip to the proof." /></Reveal>
          <PaperCutout className="mx-auto hidden w-full max-w-[20rem] md:block" />
        </div>
      </section>
      <div id="problem" className="scroll-mt-24"><OrbitChapter /></div>
      <div id="repair" className="scroll-mt-24"><JumpChapter row={canada} /></div>
      <DriftChapter drift={d.drift ?? undefined} />

      <Proof d={d} />
      <WorkedExample />
      <YourArea d={d} />

      <div ref={journeyRef} className="py-[var(--sec-sm)]">{journeyNear ? <DataJourney compact /> : <DotSkeleton h={220} label="Loading the data journey" />}</div>

      <section id="tools" className="scroll-mt-24 py-[var(--sec-md)]">
        <Reveal><SectionHead eyebrow="Everything inside" title={<>One record. <span className="italic">Ten ways in.</span></>} /></Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALL.map((t, i) => (
            <Reveal key={t.href} delay={(i % 3) * 0.04}>
              <Link href={t.href} className="tile group flex h-full flex-col p-6">
                <Eyebrow info={false}><span className="eyebrow-n">{String(i + 1).padStart(2, "0")}</span></Eyebrow>
                <p className="display mt-3 text-2xl">{t.label}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">{t.blurb}</p>
                <p className="mt-auto pt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-primary)]">Open <span aria-hidden className="inline-block text-[var(--red)] transition-transform group-hover:translate-x-1">→</span></p>
              </Link>
            </Reveal>
          ))}
        </div>
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
