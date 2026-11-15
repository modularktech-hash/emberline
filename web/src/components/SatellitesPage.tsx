"use client";

import { fmtNum } from "@/lib/format";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CountryPicker } from "@/components/CountryPicker";
import { prettyName } from "@/lib/names";
import { Chip, PageHead, Reveal } from "@/components/ui";
import { SAT_COLORS } from "@/lib/sats";
import { DriftClocks } from "@/components/DriftClocks";
import { Eyebrow } from "@/components/Figure";
import { clock, getDrift, getTle } from "@/lib/data";
import { useParquet } from "@/lib/useParquet";

const FireGlobe = dynamic(() => import("@/components/FireGlobe"), { ssr: false });

const FLEET = [
  { name: "Terra", sensor: "MODIS", launched: "Dec 1999", pixel: "1 km", alt: "~705 km", node: "10:30 descending", status: "Drifting earlier since 2022", role: "The morning half of the long MODIS record." },
  { name: "Aqua", sensor: "MODIS", launched: "May 2002", pixel: "1 km", alt: "~705 km", node: "13:30 ascending", status: "Drifting later since 2022", role: "Our reference sensor: the unit of the harmonized record." },
  { name: "Suomi-NPP", sensor: "VIIRS", launched: "Oct 2011", pixel: "375 m", alt: "~824 km", node: "13:30 ascending", status: "Stable", role: "Same overpass time as Aqua — the overlap that makes harmonization possible." },
  { name: "NOAA-20", sensor: "VIIRS", launched: "Nov 2017", pixel: "375 m", alt: "~824 km", node: "13:30 ascending", status: "Stable", role: "Live layer. Half an orbit behind Suomi-NPP." },
  { name: "NOAA-21", sensor: "VIIRS", launched: "Nov 2022", pixel: "375 m", alt: "~824 km", node: "13:30 ascending", status: "Stable", role: "Live layer. The newest of the fleet." },
];

/**
 * Published fire diurnal cycle (Andela et al. 2015, ACP 15:8831, Table 1):
 * FRP(t) = base + (peak - base) * exp(-(t - h)^2 / (2 sigma^2)), per land cover.
 * Literature values for illustration — not fitted here.
 */
const DIURNAL: Record<string, { s: number; peak: number; base: number; h: number }> = {
  "Temperate forest": { s: 1.14, peak: 846, base: 24.2, h: 13.31 },
  "Tropical forest": { s: 0.85, peak: 1364, base: 27.3, h: 13.34 },
  "Woody savanna": { s: 0.94, peak: 1501, base: 21.1, h: 13.21 },
  Savanna: { s: 1.09, peak: 1711, base: 39.0, h: 13.08 },
  Shrubland: { s: 1.35, peak: 3079, base: 108.9, h: 13.16 },
  Grassland: { s: 1.06, peak: 1642, base: 37.3, h: 12.95 },
  Cropland: { s: 0.95, peak: 1259, base: 23.9, h: 13.33 },
};
/**
 * Platform timeline. Start = first month of each platform's fire product as listed in
 * docs/data-reference.md ("Products we use": MCD14ML Nov 2000, VNP14IMGML Jan 2012,
 * VJ114IMGML Jan 2018, VJ214IMGML 2023); Aqua = its first detection in our archive
 * (2002-07-04, docs/session-notes.md). Drift since 2022: docs/research-findings.md §1, drift.json.
 */
const TIMELINE = [
  { name: "Terra", sensor: "MODIS", from: 2000 + 10 / 12, label: "Nov 2000", drift: true, use: "raw record to 2011" },
  { name: "Aqua", sensor: "MODIS", from: 2002 + 6 / 12, label: "Jul 2002", drift: true, use: "reference unit; history to 2011" },
  { name: "Suomi-NPP", sensor: "VIIRS", from: 2012, label: "Jan 2012", drift: false, use: "history from 2012" },
  { name: "NOAA-20", sensor: "VIIRS", from: 2018, label: "Jan 2018", drift: false, use: "live layer only" },
  { name: "NOAA-21", sensor: "VIIRS", from: 2023, label: "2023", drift: false, use: "live layer only" },
];
const DRIFT_FROM = 2022;

function PlatformTimeline({ until }: { until: number }) {
  const W = 720, L = 132, R = 14, row = 34, T = 8, H = T + TIMELINE.length * row + 26;
  const x0 = 2000, x = (t: number) => L + ((t - x0) / (until - x0)) * (W - L - R);
  const ticks = [2000, 2005, 2010, 2015, 2020, 2025].filter((t) => t <= until);
  return (
    <div className="mt-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Platform timeline (scrolls sideways on small screens)"><svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" role="img" aria-label={`Fire-record timeline: ${TIMELINE.map((p) => `${p.name} ${p.sensor} from ${p.label}`).join("; ")}; Terra and Aqua drifting since ${DRIFT_FROM}`}>
      <defs>
        <pattern id="tl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--surface-page)" /><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="3" /></pattern>
      </defs>
      {ticks.map((t) => (<g key={t}><line x1={x(t)} x2={x(t)} y1={T} y2={H - 22} stroke="var(--gridline)" /><text x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{t}</text></g>))}
      <line x1={x(2012)} x2={x(2012)} y1={T} y2={H - 22} stroke="var(--ember)" strokeDasharray="3 3" />
      {TIMELINE.map((p, i) => {
        const y = T + i * row + 8, c = SAT_COLORS[p.name];
        const end = p.drift ? DRIFT_FROM : until;
        return (
          <g key={p.name} style={{ color: c }}>
            <text x={0} y={y + 10} fontSize="12" fill="var(--text-primary)">{p.name} <tspan fill="var(--text-muted)" fontSize="10.5">{p.sensor}</tspan></text>
            <rect x={x(p.from)} y={y} width={Math.max(2, x(end) - x(p.from))} height={14} rx={3} fill={c} opacity="0.85" />
            {p.drift && <rect x={x(DRIFT_FROM)} y={y} width={x(until) - x(DRIFT_FROM)} height={14} rx={3} fill="url(#tl-hatch)" stroke={c} strokeWidth="1" />}
            <text x={x(p.from) + 4} y={y + 25} fontSize="9.5" fill="var(--text-muted)">{p.label} · {p.use}</text>
          </g>
        );
      })}
    </svg></div>
  );
}

const frp = (t: number, p: { s: number; peak: number; base: number; h: number }) => p.base + (p.peak - p.base) * Math.exp(-((t - p.h) ** 2) / (2 * p.s ** 2));

export function SatellitesPage() {
  const { data } = useParquet(async () => ({ tle: await getTle(), drift: await getDrift() }), "sats");
  const countries = data ? Object.keys(data.drift.countries).sort() : [];
  const [country, setCountry] = useState("Australia");
  const [cover, setCover] = useState("Savanna");
  const [year, setYear] = useState(2025);
  const rows = useMemo(() => data?.drift.countries[country] ?? [], [data, country]);
  const plats = ["Terra", "Aqua", "Suomi-NPP"];

  const chart = useMemo(() => {
    const yrs = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
    const lo = Math.min(9, ...rows.map((r) => r.lst)) - 0.3, hi = Math.max(15.5, ...rows.map((r) => r.lst)) + 0.3;
    return { yrs, lo, hi };
  }, [rows]);
  const W = 720, H = 300, L = 46, R = 16, T = 16, B = 30;
  const x = (y: number) => L + ((y - chart.yrs[0]) / Math.max(1, chart.yrs[chart.yrs.length - 1] - chart.yrs[0])) * (W - L - R);
  const y = (h: number) => T + (1 - (h - chart.lo) / (chart.hi - chart.lo)) * (H - T - B);

  const p = DIURNAL[cover];
  const at = (plat: string) => rows.find((r) => r.platform === plat && r.year === year)?.lst;
  const dx = (t: number) => L + ((t - 6) / 14) * (W - L - R);
  const dy = (v: number) => T + (1 - v / (p.peak * 1.08)) * (H - T - B);
  const curve = Array.from({ length: 141 }, (_, i) => 6 + i * 0.1).map((t, i) => `${i ? "L" : "M"}${dx(t).toFixed(1)},${dy(frp(t, p)).toFixed(1)}`).join(" ");

  return (
    <div>
      <PageHead eyebrow="Live · satellites" info="viirs" title="Which satellites saw it," italic="and when?"
        lede="Every number in Emberline was seen by one of these. The record breaks where the eyes change, and keeps shifting as the old ones drift." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {FLEET.map((s, i) => (
          <Reveal key={s.name} delay={i * 0.06}>
            <div className="card h-full p-5">
              <div className="flex items-center justify-between">
                <span className="h-3 w-3 rounded-sm" style={{ background: SAT_COLORS[s.name] }} />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{s.sensor}</span>
              </div>
              <p className="display mt-4 text-3xl">{s.name}</p>
              <dl className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                <div className="flex justify-between"><dt>Launched</dt><dd className="tabular">{s.launched}</dd></div>
                <div className="flex justify-between"><dt>Fire pixel</dt><dd>{s.pixel}</dd></div>
                <div className="flex justify-between"><dt>Altitude</dt><dd>{s.alt}</dd></div>
                <div className="flex justify-between"><dt>Nominal overpass</dt><dd>{s.node}</dd></div>
              </dl>
              <p className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-[11px] ${s.status === "Stable" ? "bg-[var(--surface-alt)]" : "bg-[var(--ember-soft)] text-[var(--ember)]"}`}>{s.status}</p>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">{s.role}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <section className="window mt-10">
          <div className="grid lg:grid-cols-[1fr_22rem]">
            <div className="min-w-0 overflow-hidden rounded-l-[var(--r-tile)]">
              <FireGlobe live={null} tle={data?.tle.satellites ?? null} showFires={false} speed={180} height={520} satLabels />
            </div>
            <div className="min-w-0 border-t border-[var(--hairline)] p-6 lg:border-l lg:border-t-0">
              <Eyebrow>Orbits, live</Eyebrow>
              <h2 className="display mt-2 text-3xl">Sun-synchronous, pole to pole.</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                Each satellite crosses the equator at the same local solar time on every orbit, about 14 times a day. That is why a fire seen by Aqua and by Suomi-NPP was seen at nearly the same moment — and why it matters when that moment drifts.
              </p>
              <p className="mt-4 text-xs text-[var(--text-muted)]">Propagated with SGP4 from TLEs fetched {data?.tle.fetched}. Time runs ×180.</p>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="card mt-10 min-w-0 p-5 sm:p-7" data-testid="platform-timeline">
          <Eyebrow>Platform timeline · fire records used here</Eyebrow>
          <h2 className="display mt-2 t-d3">Five satellites, one record</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
            When each platform&apos;s fire product begins, and what Emberline uses it for. The dashed line marks 2012, where the history switches from MODIS to Suomi-NPP VIIRS.
            Hatched: Terra and Aqua have left their fixed overpass times since {DRIFT_FROM}.
          </p>
          <PlatformTimeline until={data ? Number(data.tle.fetched.slice(0, 4)) + 1 : 2027} />
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
            Sources: product start dates from FIRMS product listings as recorded in docs/data-reference.md (MCD14ML Nov 2000, VNP14IMGML Jan 2012, VJ114IMGML Jan 2018, VJ214IMGML 2023);
            Aqua from its first detection in our archive (4 Jul 2002); drift from docs/research-findings.md §1 and the measured overpass times below. Launch dates are in the fleet cards above.
          </p>
        </section>
      </Reveal>

      <Reveal>
        <section className="mt-14 border-t border-[var(--hairline)] pt-10">
          <Eyebrow>Overpass clocks · measured from the detections</Eyebrow>
          <h2 className="display mt-2 t-d3">Two of the three clocks have <span className="italic text-[var(--ember)]">started to move.</span></h2>
          <div className="mt-5"><DriftClocks drift={data?.drift} country={country} onCountry={setCountry} /></div>
        </section>
      </Reveal>

      <Reveal>
        <section className="card mt-10 p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Measured from the detections</Eyebrow>
              <h2 className="display mt-2 t-d3">When each satellite actually passed, year by year</h2>
            </div>
            <CountryPicker value={country} options={countries} onChange={setCountry} />
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 w-full" role="img" aria-label="Mean local solar overpass time by year">
            {chart.yrs.length > 0 && <rect x={x(2021.5)} width={W - R - x(2021.5)} y={T} height={H - T - B} fill="var(--ember-soft)" />}
            {chart.yrs.length > 0 && <text x={x(2021.5) + 6} y={T + 12} fontSize="10" fill="var(--ember)">orbits drifting</text>}
            {[9, 10, 11, 12, 13, 14, 15].filter((h) => h > chart.lo && h < chart.hi).map((h) => (
              <g key={h}><line x1={L} x2={W - R} y1={y(h)} y2={y(h)} stroke="var(--gridline)" /><text x={L - 8} y={y(h) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)">{h}:00</text></g>
            ))}
            {chart.yrs.filter((v) => v % 3 === 0).map((v) => <text key={v} x={x(v)} y={H - 9} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{v}</text>)}
            {plats.map((pl) => {
              const pts = rows.filter((r) => r.platform === pl).sort((a, b) => a.year - b.year);
              if (!pts.length) return null;
              return (
                <g key={pl}>
                  <motion.path initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6 }}
                    d={pts.map((r, i) => `${i ? "L" : "M"}${x(r.year)},${y(r.lst)}`).join(" ")} fill="none" stroke={SAT_COLORS[pl]} strokeWidth="2.4" />
                  {pts.map((r) => <circle key={r.year} cx={x(r.year)} cy={y(r.lst)} r="2.6" fill={SAT_COLORS[pl]} />)}
                  <text x={W - R} y={y(pts[pts.length - 1].lst) - 7} textAnchor="end" fontSize="11" fill={SAT_COLORS[pl]}>{pl} {clock(pts[pts.length - 1].lst)}</text>
                </g>
              );
            })}
          </svg>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Mean local solar time (UTC + longitude/15, per detection) of daytime vegetation-fire detections.</p>
        </section>
      </Reveal>

      <Reveal>
        <section className="card mt-10 p-5 sm:p-7">
          <Eyebrow>Why the drift matters</Eyebrow>
          <h2 className="display mt-2 t-d3">Fire has a daily rhythm. <span className="italic text-[var(--ember)]">Satellites sample one moment of it.</span></h2>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5">{Object.keys(DIURNAL).map((c) => <Chip key={c} on={c === cover} onClick={() => setCover(c)}>{c}</Chip>)}</div>
            <label className="ml-auto flex items-center gap-2 text-sm">Year <span className="tabular w-10">{year}</span>
              <input type="range" min={2012} max={2025} value={year} onChange={(e) => setYear(Number(e.target.value))} className="accent-[var(--ember)]" />
            </label>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Diurnal fire cycle with satellite overpasses">
            {[6, 8, 10, 12, 14, 16, 18, 20].map((h) => <text key={h} x={dx(h)} y={H - 9} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{h}:00</text>)}
            <path d={`${curve} L${dx(20)},${dy(0)} L${dx(6)},${dy(0)} Z`} fill="var(--seq-2)" opacity="0.35" />
            <path d={curve} fill="none" stroke="var(--seq-5)" strokeWidth="2.4" />
            {plats.map((pl) => {
              const t = at(pl);
              if (t == null) return null;
              const share = frp(t, p) / p.peak;
              return (
                <motion.g key={pl} animate={{ x: 0 }}>
                  <motion.line initial={false} x1={dx(t)} x2={dx(t)} animate={{ x1: dx(t), x2: dx(t) }} y1={T} y2={H - B} stroke={SAT_COLORS[pl]} strokeWidth="2" strokeDasharray="4 3" transition={{ type: "spring", stiffness: 120, damping: 18 }} />
                  <motion.circle initial={false} cx={dx(t)} cy={dy(frp(t, p))} animate={{ cx: dx(t), cy: dy(frp(t, p)) }} r="6" fill={SAT_COLORS[pl]} stroke="#fff" strokeWidth="2" transition={{ type: "spring", stiffness: 120, damping: 18 }} />
                  <motion.text initial={false} x={dx(t) + 8} animate={{ x: dx(t) + 8 }} y={pl === "Terra" ? T + 14 : pl === "Aqua" ? T + 30 : T + 46} fontSize="11" fill={SAT_COLORS[pl]}>{pl} {clock(t)} · {Math.round(share * 100)}% of peak</motion.text>
                </motion.g>
              );
            })}
          </svg>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
            Curve: the published fire diurnal cycle for {cover.toLowerCase()} (Andela et al. 2015, ACP 15:8831, Table 1: peak {fmtNum(p.h, 2)} h, σ {p.s} h), shown for illustration — it was fitted on geostationary data at 0.1°, and real cycles widen at coarser scales. Overpass times: measured over {prettyName(country)} in {year}. As Aqua drifts off the peak it samples less of each day&apos;s fire; Suomi-NPP stays on it.
          </p>
        </section>
      </Reveal>
    </div>
  );
}
