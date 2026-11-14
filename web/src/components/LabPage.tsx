"use client";

import { fmtNum, fmtPct, fmtR2, fmtRatio } from "@/lib/format";
import { Eyebrow } from "@/components/Figure";
import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { CountryPicker } from "@/components/CountryPicker";
import { Chip, PageHead, Reveal, Segmented } from "@/components/ui";
import { MONTHS, fmt, median, quantile } from "@/lib/ember";
import { getCountryTable } from "@/lib/data";
import { getCalendar, getParams } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";

const P = (frp: number, b0: number, b1: number) => 1 / (1 + Math.exp(-(b0 + b1 * Math.log(Math.max(0.1, frp)))));
const DIURNAL: Record<string, { s: number; h: number }> = {
  "Temperate forest": { s: 1.14, h: 13.31 }, "Tropical forest": { s: 0.85, h: 13.34 }, "Woody savanna": { s: 0.94, h: 13.21 },
  Savanna: { s: 1.09, h: 13.08 }, Shrubland: { s: 1.35, h: 13.16 }, Grassland: { s: 1.06, h: 12.95 }, Cropland: { s: 0.95, h: 13.33 },
};
const share = (t: number, d: { s: number; h: number }) => Math.exp(-((t - d.h) ** 2) / (2 * d.s ** 2));

function Tool({ n, title, intro, children, formula }: { n: string; title: string; intro: string; children: ReactNode; formula?: string }) {
  return (
    <Reveal>
      <section className="card p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="eyebrow pt-2"><span className="eyebrow-n">{n}</span></span>
          <div className="min-w-0 flex-1">
            <h2 className="display text-3xl">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{intro}</p>
            <div className="mt-5">{children}</div>
            {formula && <pre className="mt-5 overflow-x-auto rounded-xl bg-[var(--surface-2)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{formula}</pre>}
          </div>
        </div>
      </section>
    </Reveal>
  );
}
function Out({ label, value, big }: { label: string; value: ReactNode; big?: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)] p-4">
      <Eyebrow className="!tracking-[0.14em]">{label}</Eyebrow>
      <motion.p key={String(value)} initial={{ opacity: 0.3, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`display tabular ${big ? "text-5xl text-[var(--ember)]" : "text-3xl"}`}>{value}</motion.p>
    </div>
  );
}
const Num = ({ v, set, step = 1, min, max, w = "w-24" }: { v: number; set: (n: number) => void; step?: number; min?: number; max?: number; w?: string }) => (
  <input type="number" value={v} step={step} min={min} max={max} onChange={(e) => set(Number(e.target.value))}
    className={`tabular ${w} field rounded-xl px-2.5 py-1.5 text-sm`} />
);

export function LabPage() {
  const { data } = useParquet(async () => ({ params: await getParams(), table: await getCountryTable() }), "lab");
  const names = data ? Object.keys(data.params.countries).sort() : [];
  const [region, setRegion] = useState("Australia");
  const fit = data?.params.countries[region];

  // 1 detection probability
  const [frp, setFrp] = useState(10);
  // 2 converter
  const [list, setList] = useState("3.2, 5.8, 12, 41, 7.5, 160, 2.1, 9.9, 22, 4.4");
  // 3 step ratio
  const [mode, setMode] = useState<"raw" | "harm">("raw");
  const [ra, setRa] = useState<[number, number]>([2009, 2011]);
  const [rb, setRb] = useState<[number, number]>([2012, 2014]);
  // 4 diurnal
  const [cover, setCover] = useState("Savanna");
  const [tA, setTA] = useState(13.5);
  const [tB, setTB] = useState(14.9);
  // 5 trend
  const [t0, setT0] = useState(2012);
  const [t1, setT1] = useState(2025);
  // 6 anomaly
  const [ay, setAy] = useState(2023);
  const [am, setAm] = useState(7);
  const { data: cal } = useParquet(() => getCalendar({ scope: "country", keys: [region], mode: "harmonized" }), `lab-cal-${region}`);

  const annual = useMemo(() => data?.table.countries.find((c) => c.country === region)?.annual ?? [], [data, region]);
  const values = list.split(/[\s,;]+/).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const sumP = fit ? values.reduce((s, v) => s + P(v, fit.logistic.b0, fit.logistic.b1), 0) : 0;

  const mean = (lo: number, hi: number) => {
    const v = annual.filter((a) => a.year >= lo && a.year <= hi).map((a) => a[mode]);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const before = mean(...ra), after = mean(...rb);

  const trend = useMemo(() => {
    const pts = annual.filter((a) => a.year >= t0 && a.year <= t1).map((a) => [a.year, a.harm]);
    const n = pts.length;
    if (n < 3) return null;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
    const slope = sxy / sxx, icpt = my - slope * mx;
    const ssr = pts.reduce((s, p) => s + (p[1] - (icpt + slope * p[0])) ** 2, 0), sst = pts.reduce((s, p) => s + (p[1] - my) ** 2, 0);
    const se = Math.sqrt(ssr / (n - 2) / sxx);
    return { slope, pct: (slope / my) * 100, r2: 1 - ssr / sst, t: slope / se, n };
  }, [annual, t0, t1]);

  const anomaly = useMemo(() => {
    if (!cal) return null;
    const hist = cal.rows.filter((r) => r.month === am && r.year !== ay && r.year >= 2003 && r.value != null).map((r) => r.value as number);
    const v = cal.rows.find((r) => r.year === ay && r.month === am)?.value ?? null;
    if (v == null || !hist.length) return null;
    const rank = hist.filter((h) => h < v).length / hist.length;
    return { v, med: median(hist), q90: quantile(hist, 0.9), rank };
  }, [cal, ay, am]);

  const W = 640, H = 200;
  const lx = (f: number) => 30 + (Math.log10(f) + 0.3) / 3.3 * (W - 50);
  const ly = (p: number) => 10 + (1 - p) * (H - 36);

  return (
    <div>
      <PageHead eyebrow="Science · lab" title="The model," italic="in your hands."
        lede="Every coefficient Emberline uses, exposed as a calculator. Pick a region, move the numbers, and see exactly how a VIIRS detection becomes a MODIS-equivalent count." />

      <div className="card sticky top-24 z-20 flex flex-wrap items-center gap-3 p-3">
        <Eyebrow as="span" className="pl-2">Region</Eyebrow>
        <CountryPicker value={region} options={names} onChange={setRegion} />
        {fit && <span className="tabular ml-auto pr-2 text-xs text-[var(--text-muted)]">b₀ {fmtNum(fit.logistic.b0, 3)} · b₁ {fmtNum(fit.logistic.b1, 3)} · κ {fmtNum(fit.kappa, 3)}</span>}
      </div>

      <div className="mt-6 space-y-6">
        <Tool n="01" title="Detection probability" intro="How likely is it that Aqua MODIS also detected a fire that VIIRS saw, given the fire's radiated power? Fitted on 2012–2018."
          formula={`P(MODIS detects) = 1 / (1 + exp(−(b₀ + b₁ · ln FRP)))\n                = 1 / (1 + exp(−(${fit?.logistic.b0.toFixed(3)} + ${fit?.logistic.b1.toFixed(3)} · ln ${frp})))`}>
          <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
            <div>
              <label className="flex items-center gap-3 text-sm">FRP <input type="range" min={-0.3} max={3} step={0.01} value={Math.log10(frp)} onChange={(e) => setFrp(Math.round(10 ** Number(e.target.value) * 10) / 10)} className="flex-1 accent-[var(--ember)]" /><Num v={frp} set={setFrp} step={0.1} min={0.5} /> MW</label>
              <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full">
                <rect x={lx(9)} width={lx(11) - lx(9)} y={10} height={H - 36} fill="var(--ink)" opacity="0.06" />
                {[1, 10, 100, 1000].map((f) => <text key={f} x={lx(f)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{f} MW</text>)}
                {fit && <path d={Array.from({ length: 90 }, (_, i) => 10 ** (-0.3 + (i / 89) * 3.3)).map((f, i) => `${i ? "L" : "M"}${lx(f)},${ly(P(f, fit.logistic.b0, fit.logistic.b1))}`).join(" ")} fill="none" stroke="var(--ember)" strokeWidth="2.4" />}
                {fit && <motion.circle initial={false} cx={lx(frp)} cy={ly(P(frp, fit.logistic.b0, fit.logistic.b1))} animate={{ cx: lx(frp), cy: ly(P(frp, fit.logistic.b0, fit.logistic.b1)) }} r="6" fill="var(--ink)" stroke="#fff" strokeWidth="2" />}
              </svg>
            </div>
            <div className="space-y-3">
              <Out big label={`P(Aqua also detects) · ${region}`} value={fit ? `${fmtNum(P(frp, fit.logistic.b0, fit.logistic.b1) * 100, 1)}%` : "—"} />
              <Out label="FRP at 50% (95% CI)" value={fit ? `${fmtNum(fit.frp_at_p50_mw, 1)} MW` : "—"} />
              <p className="text-xs text-[var(--text-muted)]">CI {fit?.frp_at_p50_ci95_mw.map((v) => fmtNum(v, 1)).join("–")} MW. Shaded: 9–11 MW &ldquo;thresholds of FRP detection&rdquo; (Laurent et al. 2019) — a sanity check, not the same quantity.</p>
            </div>
          </div>
        </Tool>

        <Tool n="02" title="VIIRS → MODIS-equivalent converter" intro="Paste the FRP of any set of VIIRS detections (MW, comma- or space-separated). Emberline weights each by its detection probability and scales by κ."
          formula={`Aqua-equivalent count = κ · Σ P(FRPᵢ) = ${fit?.kappa.toFixed(3)} × ${sumP.toFixed(3)} = ${fit ? (fit.kappa * sumP).toFixed(3) : "—"}`}>
          <textarea value={list} onChange={(e) => setList(e.target.value)} rows={3} className="tabular w-full field rounded-2xl p-3 font-mono text-sm" />
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Out label="VIIRS detections" value={values.length} />
            <Out label="Σ P (expected MODIS sightings)" value={fmtNum(sumP, 2)} />
            <Out label="κ (pixels per MODIS detection)" value={fmtNum(fit?.kappa, 3)} />
            <Out big label="MODIS-equivalent count" value={fit ? fmtNum(fit.kappa * sumP, 2) : "—"} />
          </div>
        </Tool>

        <Tool n="03" title="Step-ratio calculator" intro="How much did yearly detections change between two periods? Try the default (2009–11 vs 2012–14) to see the sensor jump, then flip to harmonized."
          formula={`ratio = mean(${mode}, ${rb[0]}–${rb[1]}) / mean(${mode}, ${ra[0]}–${ra[1]}) = ${after != null ? fmt(after) : "—"} / ${before != null ? fmt(before) : "—"}`}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Segmented label="step-mode" value={mode} onChange={setMode} options={[{ value: "raw", label: "Raw" }, { value: "harm", label: "Harmonized" }]} />
            <span>Before</span><Num v={ra[0]} set={(n) => setRa([n, ra[1]])} min={2001} max={2025} w="w-20" />–<Num v={ra[1]} set={(n) => setRa([ra[0], n])} min={2001} max={2025} w="w-20" />
            <span>After</span><Num v={rb[0]} set={(n) => setRb([n, rb[1]])} min={2001} max={2025} w="w-20" />–<Num v={rb[1]} set={(n) => setRb([rb[0], n])} min={2001} max={2025} w="w-20" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Out label="Mean before" value={fmt(before)} /><Out label="Mean after" value={fmt(after)} />
            <Out big label="Ratio" value={before && after != null ? fmtRatio(after / before) : "—"} />
          </div>
        </Tool>

        <Tool n="04" title="Overpass sampling" intro="What share of a day's peak fire activity does a satellite see at a given local overpass time? Published diurnal cycles (Andela et al. 2015, Table 1), for illustration."
          formula={`share(t) = exp(−(t − h_peak)² / 2σ²)   h_peak = ${DIURNAL[cover].h} h, σ = ${DIURNAL[cover].s} h  (baseline ignored)`}>
          <div className="flex flex-wrap gap-1.5">{Object.keys(DIURNAL).map((c) => <Chip key={c} on={c === cover} onClick={() => setCover(c)}>{c}</Chip>)}</div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">Overpass A <Num v={tA} set={setTA} step={0.05} min={6} max={20} /> h</label>
            <label className="flex items-center gap-2">Overpass B <Num v={tB} set={setTB} step={0.05} min={6} max={20} /> h</label>
            <span className="text-xs text-[var(--text-muted)]">Try 13.5 (Suomi-NPP) vs 14.9 (Aqua over Australia, 2025)</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Out label="A sees, of peak" value={`${fmtNum(share(tA, DIURNAL[cover]) * 100, 0)}%`} />
            <Out label="B sees, of peak" value={`${fmtNum(share(tB, DIURNAL[cover]) * 100, 0)}%`} />
            <Out big label="B ÷ A" value={fmtRatio(share(tB, DIURNAL[cover]) / share(tA, DIURNAL[cover]))} />
          </div>
        </Tool>

        <Tool n="05" title="Trend calculator" intro="Ordinary least squares on the harmonized yearly totals for any range of years."
          formula={trend ? `slope = ${trend.slope.toFixed(1)} detections/yr  (${trend.pct.toFixed(2)}% of mean per yr)   R² = ${trend.r2.toFixed(3)}   t = ${trend.t.toFixed(2)}, n = ${trend.n}` : "need ≥ 3 years"}>
          <div className="flex flex-wrap items-center gap-3 text-sm">From <Num v={t0} set={setT0} min={2001} max={2025} w="w-20" /> to <Num v={t1} set={setT1} min={2001} max={2025} w="w-20" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Out big label="Change per year" value={trend ? fmtPct(trend.pct) : "—"} />
            <Out label="Slope (detections / yr)" value={trend ? fmt(trend.slope) : "—"} />
            <Out label="R²" value={trend ? fmtR2(trend.r2) : "—"} />
            <Out label="|t| > 2.1 ≈ significant" value={trend ? (Math.abs(trend.t) > 2.1 ? "yes" : "no") : "—"} />
          </div>
        </Tool>

        <Tool n="06" title="Anomaly calculator" intro="Where does one month sit against the same month in every other year, on the harmonized record?">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            Year <Num v={ay} set={setAy} min={2003} max={2025} w="w-20" />
            Month <select value={am} onChange={(e) => setAm(Number(e.target.value))} className="field rounded-xl px-2.5 py-1.5">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Out label={`${MONTHS[am - 1]} ${ay}`} value={fmt(anomaly?.v)} />
            <Out label="Median of other years" value={fmt(anomaly?.med)} />
            <Out label="× median" value={anomaly?.med ? fmtRatio(anomaly.v / anomaly.med) : "—"} />
            <Out big label="Percentile" value={anomaly ? `${Math.round(anomaly.rank * 100)}th` : "—"} />
          </div>
          {anomaly && anomaly.q90 != null && anomaly.v > anomaly.q90 && <p className="mt-3 text-sm font-medium text-[var(--ember)]">Critical period: above the 90th percentile for {MONTHS[am - 1]}.</p>}
        </Tool>
      </div>
    </div>
  );
}
