"use client";

/**
 * The home hero in the Nothing language: a dot-matrix headline, the record chart as a dark widget
 * (the centrepiece), a row of small widgets and the evidence tiles. The chart paints from
 * content/hero.json, computed by scripts/build_hero.py from calendar_raw_global.parquet and
 * calendar_harmonized_global.parquet, so the first paint needs no request. Live values arrive later.
 */
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import hero from "@/content/hero.json";
import { DotDigits, Pill } from "@/components/ui";
import { fmtInt, fmtNum, fmtRatio } from "@/lib/format";
import { isPerfLow } from "@/lib/perf";
import { NSW_REPORT } from "@/lib/reportLink";
import { WhereBox } from "@/components/WhereBox";

type Mode = "raw" | "harm";
const [Y0, Y1] = hero.years;
const YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
const ROWS = 20, PX = 24, PY = 12, R = 3.7, LEFT = 30, TOP = 14;
const W = LEFT + YEARS.length * PX + 6, H = TOP + ROWS * PY + 26;
/** Palette of the always-dark widget: deep body, bright tip. */
const C = {
  raw: { body: "#2f6db0", tip: "#8cbcf2" },
  harm: { body: "#bb3814", tip: "#ff7a3d" },
  off: "rgba(244,244,242,0.075)",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const still = () => isPerfLow() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A ratio in the dot face, with the decimal point set in the grotesk (Doto's point reads as a comma). */
function StepNum({ v }: { v: number }) {
  const [a, b] = fmtNum(v, 2).split(".");
  return <span className="dot-num text-[clamp(2.4rem,1.6rem+3vw,4.2rem)]">{a}<span className="font-[family-name:var(--font-ui)] font-semibold">.</span>{b}</span>;
}

/* ------------------------------------------------------------- the artifact */
function RecordWidget() {
  const [ci, setCi] = useState(0);
  const [mode, setMode] = useState<Mode>("raw");
  const touched = useRef(false);
  const reduce = useReducedMotion();
  // Plays the repair once on arrival (raw, then harmonized), unless the visitor has already chosen.
  useEffect(() => {
    if (still()) return;
    const t = window.setTimeout(() => { if (!touched.current) setMode("harm"); }, 1700);
    return () => clearTimeout(t);
  }, []);
  const c = hero.countries[ci];
  const max = Math.max(...c.raw, ...c.harm) * 1.04;
  const rowsOf = (v: number) => (v > 0 ? Math.max(1, Math.round((v / max) * ROWS)) : 0);
  const on = mode === "raw" ? c.raw : c.harm, off = mode === "raw" ? c.harm : c.raw;
  const col = C[mode], ghost = C[mode === "raw" ? "harm" : "raw"].tip;
  const x = (i: number) => LEFT + i * PX + PX / 2;
  const y = (r: number) => TOP + (ROWS - 1 - r) * PY + PY / 2; // r = 0 is the bottom row
  const x2012 = LEFT + (2012 - Y0) * PX;
  const yOne = TOP + ROWS * PY - (1 / max) * ROWS * PY;
  const pick = (m: Mode) => { touched.current = true; setMode(m); };
  const name = c.country;
  return (
    <figure className="hero-art relative overflow-hidden rounded-[var(--r-tile)] bg-[#0b0b0b] p-5 text-[#f4f4f2] sm:p-7" data-testid="hero-record" data-mode={mode}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption className="min-w-0 pr-16 sm:pr-0">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-[#f4f4f2]/55">The record · fire detections per year</p>
          <p className="mt-1.5 font-mono text-[12px] uppercase tracking-[0.16em]">{name} <span className="text-[#f4f4f2]/45">· {Y0}–{Y1} · 2003–11 average = 1</span></p>
        </figcaption>
        <div role="group" aria-label="Series" className="relative flex rounded-full border border-[#f4f4f2]/20 p-1 font-mono text-[11px] uppercase tracking-[0.14em]">
          {(["raw", "harm"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)} data-testid={`hero-mode-${m}`}
              className="relative z-10 rounded-full px-3.5 py-1.5 uppercase transition-colors duration-200 sm:px-4" style={{ color: mode === m ? "#0b0b0b" : "rgba(244,244,242,0.7)" }}>
              {mode === m && <motion.span layoutId="hero-thumb" aria-hidden className="absolute inset-0 -z-10 rounded-full" style={{ background: m === "raw" ? C.raw.tip : C.harm.tip }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }} />}
              {m === "raw" ? "Raw" : "Harmonized"}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block h-auto w-full" role="img"
        aria-label={`${name}, yearly detections ${Y0}–${Y1}, indexed to the 2003–2011 average. ${mode === "raw" ? "Raw splice, MODIS to 2011 then VIIRS" : "Harmonized"}: 2012 step ${fmtRatio(mode === "raw" ? c.step_raw : c.step_harm)}.`}>
        {[0, 1, 2].map((k) => { const v = (max / 1.04) * (k / 2); const yy = TOP + ROWS * PY - (v / max) * ROWS * PY; return k ? <text key={k} x={LEFT - 8} y={yy + 3} textAnchor="end" fontSize="9" fill="rgba(244,244,242,0.4)" fontFamily="var(--font-code)">{fmtNum(v, 1)}</text> : null; })}
        {YEARS.map((yr, i) => {
          const lit = rowsOf(on[i]), g = rowsOf(off[i]);
          return (
            <g key={yr}>
              {Array.from({ length: ROWS }, (_, r) => {
                const isOn = r < lit, tip = r === lit - 1;
                return <circle key={r} className="hero-dot" cx={x(i)} cy={y(r)} r={R}
                  style={{ fill: isOn ? (tip ? col.tip : col.body) : C.off, transitionDelay: `${i * 14 + r * 9}ms` }} />;
              })}
              {g > 0 && <circle className="hero-ghost" cx={x(i)} r={R + 1.6} fill="none" stroke={ghost} strokeWidth="1.2" strokeOpacity="0.75"
                style={{ cy: y(g - 1), transitionDelay: `${i * 14}ms` } as React.CSSProperties} />}
            </g>
          );
        })}
        <motion.path fill="none" stroke={col.tip} strokeWidth="1.4" strokeOpacity="0.55" strokeLinejoin="round" initial={false}
          animate={{ d: on.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(Math.max(0, rowsOf(v) - 1))}`).join(" "), stroke: col.tip }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} />
        <line x1={LEFT} x2={W - 6} y1={yOne} y2={yOne} stroke="rgba(244,244,242,0.45)" strokeWidth="1" strokeDasharray="1 4" strokeLinecap="round" className="hero-ghost" />
        <text x={LEFT - 8} y={yOne + 3} textAnchor="end" fontSize="9" fill="rgba(244,244,242,0.7)" fontFamily="var(--font-code)">1</text>
        <line x1={x2012} x2={x2012} y1={TOP - 6} y2={TOP + ROWS * PY + 4} stroke="#d71921" strokeWidth="1.6" strokeDasharray="3 4" strokeLinecap="round" />
        <text x={x2012 + 6} y={TOP + 2} fontSize="9.5" fill="#ff5a60" fontFamily="var(--font-code)" letterSpacing="1">2012 · VIIRS</text>
        {YEARS.map((yr, i) => (yr === Y0 || yr === 2012 || yr === Y1 || (yr % 5 === 0 && yr !== 2010)) && (
          <text key={yr} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9.5" fill={yr === 2012 ? "#f4f4f2" : "rgba(244,244,242,0.45)"} fontFamily="var(--font-code)">{yr}</text>
        ))}
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#f4f4f2]/12 pt-4">
        {(["raw", "harm"] as const).map((m) => (
          <button key={m} type="button" onClick={() => pick(m)} className="group text-left" aria-label={`Show the ${m === "raw" ? "raw" : "harmonized"} series`}>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: mode === m ? C[m].tip : "rgba(244,244,242,0.45)" }}>
              <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: C[m].tip }} />2012 step · {m === "raw" ? "raw splice" : "harmonized"}
            </p>
            <p key={`${name}-${m}`} className="hero-readout mt-1 flex items-baseline leading-none transition-opacity duration-300" style={{ opacity: mode === m ? 1 : 0.35, color: C[m].tip }}>
              <span className="mr-1 font-[family-name:var(--font-ui)] text-[clamp(1.4rem,1rem+1.4vw,2.2rem)] font-medium">×</span>
              <StepNum v={m === "raw" ? c.step_raw : c.step_harm} />
            </p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-[#f4f4f2]/65">
        {mode === "raw"
          ? <>Joined naively (MODIS to 2011, VIIRS from 2012), {name}&apos;s fire count jumps {fmtRatio(c.step_raw)} in 2012. The sensor changed, not the fire.</>
          : <>Harmonized to one unit (Aqua-MODIS-equivalent), the 2012 step is {fmtRatio(c.step_harm)}. Blue rings mark the raw splice.</>}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Country">
        {hero.countries.map((k, i) => (
          <button key={k.country} type="button" aria-pressed={i === ci} onClick={() => setCi(i)} data-testid="hero-country"
            className="rounded-full border px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors duration-200"
            style={i === ci ? { background: "#f4f4f2", color: "#0b0b0b", borderColor: "#f4f4f2" } : { borderColor: "rgba(244,244,242,0.22)", color: "rgba(244,244,242,0.75)" }}>
            {k.country}
          </button>
        ))}
        <span className="ml-auto hidden font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#f4f4f2]/40 sm:inline">NASA FIRMS · fit {hero.fit_version}</span>
      </div>
    </figure>
  );
}

/* --------------------------------------------------- the pop-up paper satellite */
/** A paper cut-out satellite on a folded tab, standing in front of the widget. Unfolds once, then sways (CSS only). */
function PaperSatellite({ className = "" }: { className?: string }) {
  const paper = "#ffffff", edge = "#0b0b0b";
  return (
    <div aria-hidden className={`pointer-events-none select-none ${className}`}>
      <div className="hero-pop">
        <div className="paper-sway">
          <svg viewBox="0 0 220 190" className="block h-auto w-full overflow-visible" style={{ filter: "drop-shadow(10px 14px 0 rgba(11,11,11,0.16))" }}>
            <g stroke={edge} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
              {/* the fold tab it stands on */}
              <path d="M54 168 L166 168 L180 184 L40 184 Z" fill="#eaeae7" />
              <line x1="54" x2="166" y1="168" y2="168" strokeDasharray="3 3" />
              {/* stem */}
              <path d="M106 168 L106 128 L114 128 L114 168 Z" fill={paper} />
              <g transform="rotate(-14 110 84)">
                {/* panels */}
                <rect x="14" y="66" width="60" height="34" fill={paper} />
                <rect x="146" y="66" width="60" height="34" fill={paper} />
                {[29, 44, 59, 161, 176, 191].map((x) => <line key={x} x1={x} x2={x} y1="66" y2="100" strokeWidth="1" />)}
                <line x1="14" x2="74" y1="83" y2="83" strokeWidth="1" /><line x1="146" x2="206" y1="83" y2="83" strokeWidth="1" />
                <line x1="74" x2="90" y1="83" y2="83" /><line x1="130" x2="146" y1="83" y2="83" />
                {/* body */}
                <rect x="90" y="56" width="40" height="56" rx="6" fill={paper} />
                <line x1="90" x2="130" y1="84" y2="84" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                <circle cx="110" cy="122" r="9" fill="#0b0b0b" stroke="none" />
                <circle cx="110" cy="122" r="3.4" fill="#d71921" stroke="none" />
                <line x1="110" x2="110" y1="56" y2="38" /><circle cx="110" cy="34" r="4" fill={paper} />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ small widgets */
function Gauge({ pct }: { pct: number }) {
  const n = 40, lit = Math.round((pct / 100) * n);
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return <circle key={i} cx={50 + Math.cos(a) * 44} cy={50 + Math.sin(a) * 44} r="1.5" fill={i < lit ? "var(--red)" : "var(--dot-dim)"} />;
      })}
    </svg>
  );
}

function Widgets({ live24 }: { live24: number | null | undefined }) {
  const sc = hero.step_collapse, we = hero.worked_example, te = hero.typical_error;
  const label = "font-mono text-[10px] uppercase tracking-[0.18em]";
  const box = "group relative flex aspect-square flex-col items-center justify-center p-4 text-center";
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-testid="hero-widgets">
      <Link href="/globe" className={`${box} tile tile-ink tile-circle no-ul`} aria-label="Live layer: near-real-time detections, last 24 hours">
        <p className={`${label} flex items-center gap-2 opacity-70`}><span className="live-dot" aria-hidden />Live · 24 h</p>
        <p className="mt-2 leading-none">{live24 != null ? <DotDigits text={fmtInt(live24)} className="text-[clamp(1.5rem,0.9rem+2.2vw,2.6rem)]" /> : <span className={`${label} opacity-60`}>{live24 === undefined ? "loading" : "not recorded"}</span>}</p>
        <p className="mt-2 max-w-[11rem] text-[11.5px] leading-snug opacity-70">raw detections, NOAA-20/21 + MODIS</p>
      </Link>
      <Link href="/method#proof" className={`${box} tile no-ul`} style={{ boxShadow: "var(--shadow-paper)" }}>
        <p className={`${label} text-[var(--text-muted)]`}>2012 jump removed</p>
        <p className="mt-2 flex items-baseline leading-none"><DotDigits text={String(sc.within_1_25_harm)} className="text-[clamp(2rem,1.2rem+2.8vw,3.4rem)]" /><span className="dot-num text-[clamp(1.1rem,0.8rem+1vw,1.6rem)] text-[var(--text-muted)]">/{sc.n}</span></p>
        <p className="mt-2 max-w-[12rem] text-[11.5px] leading-snug text-[var(--text-secondary)]">countries within ×{sc.within_factor} of the unchanged sensor (raw: {sc.within_1_25_raw})</p>
      </Link>
      <Link href={NSW_REPORT} className={`${box} tile no-ul !border-transparent !bg-[var(--red)] text-white`} data-testid="hero-nsw">
        <p className={`${label} opacity-80`}>NSW · {MONTHS[we.month - 1]} {we.year}</p>
        <p className="mt-2 flex items-baseline leading-none"><DotDigits text={fmtNum(we.times_median, 0)} className="text-[clamp(2.4rem,1.4rem+3.4vw,4rem)]" /><span className="ml-0.5 text-[clamp(1.3rem,1rem+1vw,2rem)] font-medium">×</span></p>
        <p className="mt-2 max-w-[12rem] text-[11.5px] leading-snug opacity-85">its median {new Date(Date.UTC(2000, we.month - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" })}, harmonized. Get the report →</p>
      </Link>
      <Link href="/method#headline" className={`${box} tile tile-circle no-ul`}>
        <Gauge pct={te.median_country_month_ape_pct} />
        <p className={`${label} relative text-[var(--text-muted)]`}>Typical miss</p>
        <p className="relative mt-2 flex items-baseline leading-none"><DotDigits text={fmtNum(te.median_country_month_ape_pct, 0)} className="text-[clamp(2rem,1.2rem+2.8vw,3.4rem)]" /><span className="text-xl font-medium">%</span></p>
        <p className="relative mt-2 max-w-[10rem] text-[11.5px] leading-snug text-[var(--text-secondary)]">per country-month, held-out {te.test_years[0]}–{String(te.test_years[1]).slice(2)}</p>
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------- hero */
export function NothingHero({ live24 }: { live24: number | null | undefined }) {
  return (
    <section className="relative pb-6 pt-8 sm:pt-14 lg:pt-24" aria-labelledby="hero-title">
      <div className="grid items-center gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2.5 rounded-full border-[length:var(--stroke)] border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            <span className="live-dot" aria-hidden />NASA FIRMS · {Y0}–{Y1}
          </p>
          <h1 id="hero-title" className="hero-title-box mt-7">
            <span className="display block text-[clamp(1.5rem,1.1rem+1.6vw,2.4rem)] leading-tight">23 years of fire.</span>
            <span className="hero-dot-title mt-2 block text-[var(--red)]">One steady line</span>
          </h1>
          <p className="mt-6 max-w-[32rem] text-[17px] leading-relaxed text-[var(--text-secondary)]">
            In 2012 the fire satellites changed and the counts jumped overnight. The fires did not. Emberline repairs the break, country by country, so you can tell whether a month is <span className="accent text-[1.15em] text-[var(--text-primary)]">really unusual.</span>
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Pill href="/explorer" tone="red">Check your area</Pill>
            <Pill href={NSW_REPORT} tone="ink">Get a report</Pill>
          </div>
        </div>
        <div className="relative min-w-0">
          <PaperSatellite className="absolute -top-[3.4rem] right-1 z-10 w-[92px] sm:-top-24 sm:right-8 sm:w-[150px] lg:-top-[6.6rem] lg:right-12 lg:w-[170px]" />
          <RecordWidget />
        </div>
      </div>

      <WhereBox />

      <div className="mt-12"><Widgets live24={live24} /></div>

      <nav aria-label="The evidence" className="mt-12 grid gap-3 sm:gap-4 md:grid-cols-3" data-testid="hero-evidence">
        {[
          ["#repair", "Before and after", "The naively joined raw record against the harmonized one, Canada 2003–2025."],
          ["/method", "The method", "How each VIIRS detection becomes an Aqua-MODIS-equivalent count."],
          ["/method#headline", "The validation", "Four corrections scored on the same held-out years, 2019–2021."],
        ].map(([href, t, d2], i) => (
          <Link key={href} href={href} className="tile group flex items-start gap-4 p-5 no-ul sm:p-6">
            <span className="dot-num text-[2.6rem] leading-[0.9] text-[var(--red)]">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="block text-[16px] font-medium">{t} <span aria-hidden className="inline-block text-[var(--red)] transition-transform group-hover:translate-x-1">{href.startsWith("#") ? "↓" : "→"}</span></span>
              <span className="mt-1 block text-[13px] leading-relaxed text-[var(--text-secondary)]">{d2}</span>
            </span>
          </Link>
        ))}
      </nav>
      <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        <a href="#story" className="no-ul hover:text-[var(--text-primary)]">The story ↓</a><a href="#proof" className="no-ul hover:text-[var(--text-primary)]">The proof ↓</a><a href="#area" className="no-ul hover:text-[var(--text-primary)]">Your area ↓</a><a href="#tools" className="no-ul hover:text-[var(--text-primary)]">The tools ↓</a><Link href="/globe" className="no-ul hover:text-[var(--text-primary)]">Live globe →</Link>
      </p>
    </section>
  );
}
