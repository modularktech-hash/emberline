"use client";

import { motion, useMotionValue, useScroll, useTransform, type MotionValue } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef } from "react";
import { CountUp, Reveal } from "@/components/ui";
import { clock, getCountryTable, getDrift, getLive, getSeason, getTle, type CountryRow, type DriftFile } from "@/lib/data";
import { getParams } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import { ALL } from "@/lib/nav";

const FireGlobe = dynamic(() => import("@/components/FireGlobe"), { ssr: false });
const EASE = [0.22, 1, 0.36, 1] as const;

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
  const globeY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const globeScale = useTransform(scrollYProgress, [0, 1], [1, 0.82]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const live24 = d ? Object.values(d.live.windows["24h"].totals).reduce((a, b) => a + b, 0) : 0;
  const detections = d ? d.table.countries.reduce((a, c) => a + c.detections_filtered, 0) : 0;
  const bestR2 = d ? Math.max(...d.table.countries.map((c) => c.r2_model)) : 0;

  return (
    <section ref={ref} className="relative -mx-4 overflow-hidden px-4 pb-8 pt-10 sm:-mx-6 sm:px-6 sm:pt-16">
      <motion.div style={{ y: globeY, scale: globeScale }} className="pointer-events-none absolute inset-x-0 top-24 mx-auto max-w-[900px] opacity-90 sm:top-10">
        <FireGlobe live={d?.live ?? null} tle={d?.tle.satellites ?? null} interactive={false} showOrbits height={720} speed={90} />
      </motion.div>
      <motion.div style={{ y: textY, opacity: fade }} className="relative z-10 mx-auto max-w-4xl text-center">
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="eyebrow">
          Emberline · NASA FIRMS · MODIS + VIIRS · 2001–2025
        </motion.p>
        <h1 className="display mt-6 text-[3.5rem] leading-[0.95] sm:text-[7.6rem]">
          {"25 years of fire.".split(" ").map((w, i) => (
            <motion.span key={i} className="inline-block" initial={{ opacity: 0, y: 40, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, ease: EASE, delay: 0.1 + i * 0.08 }}>
              {w}&nbsp;
            </motion.span>
          ))}
          <br />
          <motion.span className="inline-block italic text-[var(--ember)]" initial={{ opacity: 0, y: 40, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 1, ease: EASE, delay: 0.45 }}>
            One unbroken line.
          </motion.span>
        </h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.8 }}
          className="glass mx-auto mt-8 max-w-xl rounded-[22px] px-5 py-3 text-lg leading-relaxed text-[var(--text-secondary)] backdrop-blur-sm">
          Satellites have watched Earth burn since 2000. In 2012 a sharper one launched, and the fire record jumped. The fires did not. Emberline rebuilds the record so the satellite no longer matters.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.7, ease: EASE }} className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link href="/explorer" className="pill-dark px-6 py-3 text-[15px] font-medium">Open the calendar &nbsp;→</Link>
          <Link href="/globe" className="glass rounded-full px-6 py-3 text-[15px] font-medium">See today&apos;s fires live</Link>
        </motion.div>
      </motion.div>

      <div className="relative z-10 mx-auto mt-[23rem] grid max-w-5xl grid-cols-2 gap-3 sm:mt-[25rem] md:grid-cols-4">
        {[
          { v: live24, l: "fires seen from orbit in the last 24 h", s: "" },
          { v: detections, l: "filtered detections in the harmonized record", s: "" },
          { v: 5, l: "fire satellites tracked, live orbits", s: "" },
          { v: bestR2, l: "best held-out R², years the model never saw", s: "", dec: 2 },
        ].map((x, i) => (
          <Reveal key={i} delay={i * 0.06}>
            <div className="glass h-full rounded-[22px] p-4 sm:p-5">
              <p className="display text-3xl sm:text-4xl">{d ? <CountUp to={x.v} decimals={x.dec ?? 0} /> : "—"}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">{x.l}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- sticky story */
function StoryStep({ i, n, p, children }: { i: number; n: number; p: MotionValue<number>; children: React.ReactNode }) {
  const a = i / n, b = (i + 1) / n;
  const a0 = Math.max(0, a - 0.08), a1 = Math.max(0.01, a);
  const opacity = useTransform(p, [a0, a1, b - 0.06, b], [i === 0 ? 1 : 0.18, 1, 1, i === n - 1 ? 1 : 0.18]);
  const x = useTransform(p, [a0, a1], [i === 0 ? 0 : -10, 0]);
  return <motion.div style={{ opacity, x }} className="flex min-h-[60vh] flex-col justify-center py-6">{children}</motion.div>;
}

function OrbitChapter() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const rot = useTransform(p, [0, 1], [0, 540]);
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
            <p className="eyebrow">{e}</p>
            <h2 className="display mt-3 text-4xl leading-tight sm:text-5xl">{t}</h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-[var(--text-secondary)]">{b}</p>
          </StoryStep>
        ))}
      </div>
      <div className="sticky top-24 hidden h-[70vh] items-center justify-center md:flex">
        <div className="window relative aspect-square w-full max-w-[480px]">
          <motion.svg style={{ opacity: orbitOpacity }} viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
            <circle cx="100" cy="100" r="46" fill="#efe4cb" stroke="var(--ink)" strokeOpacity="0.25" />
            {[62, 74, 86].map((r, i) => <ellipse key={r} cx="100" cy="100" rx={r} ry={r * 0.36} fill="none" stroke="var(--ink)" strokeOpacity="0.14" strokeDasharray="2 3" transform={`rotate(${-30 + i * 28} 100 100)`} />)}
            <motion.g style={{ rotate: rot, originX: "100px", originY: "100px" }}>
              {[["#7a4fa0", 62, -30], ["#3f7f96", 74, -2], ["#d9431a", 86, 26]].map(([c, r, a], i) => (
                <g key={i} transform={`rotate(${a} 100 100)`}><circle cx={100 + (r as number)} cy="100" r="4" fill={c as string} /></g>
              ))}
            </motion.g>
          </motion.svg>
          <motion.div style={{ opacity: heat }} className="absolute inset-8 rounded-2xl bg-[radial-gradient(circle_at_40%_45%,#fff0c7_0%,#f49b3f_22%,#c93f1c_40%,rgba(86,17,20,0.08)_70%,transparent)]">
            <p className="tabular absolute bottom-3 left-4 font-mono text-[11px] text-[var(--ink)]">FRP ≈ 140 MW</p>
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
        <p className="eyebrow">05 · The jump · Canada, detections per year</p>
        <h2 className="display mt-3 text-4xl sm:text-6xl">The record says fire <span className="italic text-[var(--ember)]">exploded.</span></h2>
        <div className="window relative mt-8 p-4 sm:p-6">
          <svg viewBox="0 0 640 300" className="w-full">
            <defs><linearGradient id="hg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d9431a" stopOpacity="0.22" /><stop offset="1" stopColor="#d9431a" stopOpacity="0" /></linearGradient></defs>
            {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="20" x2="620" y1={276 - f * 252} y2={276 - f * 252} stroke="var(--gridline)" />)}
            <line x1={x2012} x2={x2012} y1="20" y2="276" stroke="var(--text-muted)" strokeDasharray="3 4" />
            <text x={x2012 + 6} y="32" fontSize="11" fill="var(--text-secondary)">2012 · VIIRS launches</text>
            <motion.path d={area} fill="url(#hg)" style={{ opacity: draw }} />
            <motion.path d={d} fill="none" stroke="var(--ember)" strokeWidth="3" strokeLinejoin="round" style={{ pathLength: draw }} />
            {years.filter((a) => a.year % 4 === 3).map((a) => <text key={a.year} x={20 + ((a.year - 2003) / 22) * 600} y="294" fontSize="11" textAnchor="middle" fill="var(--text-muted)">{a.year}</text>)}
          </svg>
          <motion.div style={{ opacity: cap1 }} className="card absolute right-6 top-6 max-w-[16rem] p-4">
            <p className="display text-5xl text-[var(--ember)]">×{row?.step_raw.toFixed(1)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Yearly detections, 2012–14 against 2009–11, in the raw record.</p>
          </motion.div>
          <motion.div style={{ opacity: cap2 }} className="card absolute right-6 top-6 max-w-[17rem] p-4">
            <p className="display text-5xl">×{row?.step_harm.toFixed(2)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Harmonized. Aqua MODIS, which never changed, says ×{row?.step_aqua.toFixed(2)}. The jump was the sensor.</p>
          </motion.div>
        </div>
        <motion.p style={{ opacity: cap2 }} className="display mt-6 text-3xl sm:text-4xl">The fires did not. <span className="italic text-[var(--ember)]">Keep scrolling.</span></motion.p>
      </div>
    </section>
  );
}

function Dial({ color, label, mv }: { color: string; label: string; mv: MotionValue<number> }) {
  const rot = useTransform(mv, (h) => (h / 24) * 360 - 180);
  const t = useTransform(mv, (h) => clock(h));
  return (
    <div className="card flex flex-col items-center p-5">
      <svg viewBox="0 0 120 120" className="w-32">
        <circle cx="60" cy="60" r="52" fill="var(--surface-1)" stroke="var(--hairline)" />
        {Array.from({ length: 24 }, (_, i) => <line key={i} x1="60" y1="10" x2="60" y2={i % 6 ? 14 : 18} stroke="var(--ink)" strokeOpacity="0.4" transform={`rotate(${i * 15} 60 60)`} />)}
        <line x1="60" y1="60" x2="60" y2="12" stroke="var(--seq-2)" strokeWidth="9" strokeOpacity="0.5" transform="rotate(15 60 60)" />
        <motion.line x1="60" y1="60" x2="60" y2="16" stroke={color} strokeWidth="3.5" strokeLinecap="round" style={{ rotate: rot, originX: "60px", originY: "60px" }} />
        <circle cx="60" cy="60" r="4" fill="var(--ink)" />
        <text x="60" y="98" textAnchor="middle" fontSize="8" fill="var(--text-muted)">gold = 13:00 fire peak</text>
      </svg>
      <p className="mt-2 text-sm font-medium" style={{ color }}>{label}</p>
      <motion.p className="tabular display text-2xl">{t}</motion.p>
    </div>
  );
}

function DriftChapter({ drift }: { drift: DriftFile | undefined }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const rows = drift?.countries?.Portugal ?? [];
  const lst = (plat: string, y: number) => rows.find((r) => r.platform === plat && r.year === y)?.lst;
  const a0 = lst("Aqua", 2015) ?? 13.2, a1 = lst("Aqua", 2025) ?? 14.4, t0 = lst("Terra", 2015) ?? 11, t1 = lst("Terra", 2025) ?? 9.9, s = lst("Suomi-NPP", 2025) ?? 13.3;
  const aq = useTransform(p, [0.3, 0.7], [a0, a1]);
  const te = useTransform(p, [0.3, 0.7], [t0, t1]);
  const yr = useTransform(p, [0.3, 0.7], [2015, 2025]);
  const yrText = useTransform(yr, (v) => String(Math.round(v)));
  const sn = useMotionValue(s);
  return (
    <section ref={ref} className="mt-16 py-16">
      <Reveal><p className="eyebrow">06 · Still shifting</p></Reveal>
      <Reveal delay={0.05}><h2 className="display mt-3 max-w-3xl text-4xl sm:text-6xl">And the old satellites are <span className="italic text-[var(--ember)]">drifting.</span></h2></Reveal>
      <Reveal delay={0.1}>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--text-secondary)]">
          Since 2022 Terra and Aqua have left their fixed orbits. Fires peak around 13:00, so as each one passes earlier or later it sees less fire, though nothing burns less. Measured over Portugal from the detections themselves:
        </p>
      </Reveal>
      <div className="mt-8 grid items-center gap-4 sm:grid-cols-[auto_1fr_1fr_1fr]">
        <motion.p className="display tabular text-6xl text-[var(--ember)] sm:text-7xl">{yrText}</motion.p>
        <Dial color="#7a4fa0" label="Terra · MODIS" mv={te} />
        <Dial color="#3f7f96" label="Aqua · MODIS" mv={aq} />
        <Dial color="#d9431a" label="Suomi-NPP · VIIRS" mv={sn} />
      </div>
      <Reveal><p className="mt-6 text-sm text-[var(--text-secondary)]">Emberline builds its post-2012 record from Suomi-NPP, which has held its 13:30 orbit, so the harmonized record is not exposed to the drift. <Link className="underline decoration-[var(--ember)] underline-offset-4" href="/satellites">See every satellite →</Link></p></Reveal>
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
        <Reveal><p className="eyebrow">07 · How we know</p></Reveal>
        <Reveal delay={0.05}><h2 className="display mt-3 max-w-3xl text-4xl sm:text-6xl">Tested on years the model <span className="italic text-[var(--ember)]">never saw.</span></h2></Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(d?.table.countries ?? []).map((c, i) => (
            <Reveal key={c.country} delay={i * 0.07}>
              <div className="card p-5">
                <p className="eyebrow">{c.country}</p>
                <p className="display mt-2 text-5xl"><CountUp to={c.r2_model} decimals={2} /></p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">held-out R² vs observed Aqua · raw VIIRS: {c.r2_raw.toFixed(1)}</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <motion.div className="h-full rounded-full bg-[var(--ember)]" initial={{ width: 0 }} whileInView={{ width: `${Math.max(0, c.r2_model) * 100}%` }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE, delay: 0.2 + i * 0.07 }} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal><p className="mt-6 text-sm text-[var(--text-secondary)]">Fitted 2012–2018, scored 2019–2021 per ~250 km² cell and month. Fit {d?.params.fit_version}. <Link href="/method" className="underline decoration-[var(--ember)] underline-offset-4">Full method and proof →</Link></p></Reveal>
      </section>

      <DriftChapter drift={d?.drift} />

      <section className="py-16">
        <Reveal><p className="eyebrow">08 · What it changes</p></Reveal>
        <div className="mt-6 grid items-center gap-8 lg:grid-cols-2">
          <Reveal><h2 className="display text-4xl sm:text-6xl">Is the fire season starting earlier? <span className="italic text-[var(--ember)]">Less than the raw data says.</span></h2></Reveal>
          <Reveal delay={0.1}>
            <div className="card p-6">
              <p className="eyebrow">Chile · season onset trend, 2003–2025</p>
              <div className="mt-5 space-y-5">
                {[["Raw record", chile?.raw_onset, "#c93f1c"], ["Harmonized", chile?.harm_onset, "var(--ink)"]].map(([l, v, c]) => (
                  <div key={l as string}>
                    <div className="flex justify-between text-sm"><span>{l as string}</span><span className="tabular display text-2xl">{v == null ? "—" : `${(v as number).toFixed(1)} days / decade`}</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <motion.div className="h-full rounded-full" style={{ background: c as string }} initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, Math.abs((v as number) ?? 0) * 10)}%` }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-relaxed text-[var(--text-secondary)]">Negative = earlier. Half of the apparent shift is VIIRS spotting small early-season burns MODIS never could. <Link href="/trends" className="underline decoration-[var(--ember)] underline-offset-4">Every region →</Link></p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-16">
        <Reveal><p className="eyebrow">09 · Everything inside</p></Reveal>
        <Reveal delay={0.05}><h2 className="display mt-3 text-4xl sm:text-6xl">One record. <span className="italic text-[var(--ember)]">Nine ways in.</span></h2></Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALL.map((t, i) => (
            <Reveal key={t.href} delay={(i % 3) * 0.07}>
              <Link href={t.href} className="card group block h-full p-6 transition-transform hover:-translate-y-1">
                <p className="font-mono text-[11px] text-[var(--text-muted)]">{String(i + 1).padStart(2, "0")}</p>
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
          <h2 className="display relative text-5xl sm:text-7xl">Pick a place. <span className="italic text-[var(--ember)]">See its fires.</span></h2>
          <p className="relative mx-auto mt-4 max-w-lg text-[var(--text-secondary)]">Draw any area on the map, choose the years, and download the harmonized calendar as CSV. No account, no API key.</p>
          <Link href="/explorer" className="pill-dark relative mt-8 inline-block px-7 py-3.5 text-[15px] font-medium">Open the calendar explorer →</Link>
        </section>
      </Reveal>
    </div>
  );
}
