"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { CountryPicker } from "@/components/CountryPicker";
import { Failed, Loading, PageHead, Reveal, Segmented } from "@/components/ui";
import { fireDayLabel, getSeason } from "@/lib/data";
import { useParquet } from "@/lib/useParquet";

type Metric = "onset" | "peak" | "end" | "length";
const LABEL: Record<Metric, string> = { onset: "Season onset (10% of the year's detections)", peak: "Season peak (50%)", end: "Season end (90%)", length: "Season length (onset → end, days)" };
const fmt = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);

export function TrendsPage() {
  const { data, error, loading } = useParquet(() => getSeason(), "season");
  const names = data ? Object.keys(data.countries).sort() : [];
  const [country, setCountry] = useState("Chile");
  const [metric, setMetric] = useState<Metric>("onset");
  const c = data?.countries[country];

  const W = 760, H = 380, L = 54, R = 18, T = 18, B = 30;
  const years = c?.years.filter((y) => y.harm_onset != null) ?? [];
  const yx = (yr: number) => T + ((yr - 2003) / 22) * (H - T - B);
  const dx = (d: number) => L + (d / 366) * (W - L - R);
  const months = Array.from({ length: 12 }, (_, i) => {
    const day = Math.round((i * 365) / 12) + 1;
    return { day, label: fireDayLabel(day, c?.fire_year_start_month ?? 1).split(" ")[1] };
  });

  return (
    <div>
      <PageHead eyebrow="Insights · season shift" title="Is the fire season moving?" italic="Or is it the sensor?"
        lede="For every year: when the season starts (10% of the year's detections), peaks (50%) and ends (90%). In the raw record, VIIRS's sharper eyes catch small early burns MODIS never could, so seasons appear to start earlier. The harmonized record removes that." />

      {error && <Failed error={error} />}
      {loading && <Loading h={420} />}
      {c && (
        <>
          <CountryPicker value={country} options={names} onChange={setCountry} />

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["onset", "peak", "end", "length"] as Metric[]).map((m, i) => {
              const raw = c.trend_days_per_decade[`raw_${m}`], harm = c.trend_days_per_decade[`harm_${m}`];
              return (
                <Reveal key={m} delay={i * 0.05}>
                  <button type="button" onClick={() => setMetric(m)} className={`card w-full p-5 text-left transition-transform hover:-translate-y-0.5 ${metric === m ? "!border-[var(--ember)]" : ""}`}>
                    <p className="eyebrow">{m} · days per decade</p>
                    <div className="mt-3 flex items-end gap-4">
                      <div><p className="display tabular text-4xl">{fmt(harm)}</p><p className="text-xs text-[var(--text-secondary)]">harmonized</p></div>
                      <div><p className="display tabular text-2xl text-[var(--seq-5)]">{fmt(raw)}</p><p className="text-xs text-[var(--text-secondary)]">raw</p></div>
                    </div>
                  </button>
                </Reveal>
              );
            })}
          </div>

          <Reveal>
            <section className="window mt-8 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="eyebrow">{country} · the fire season, year by year (fire year starts {fireDayLabel(1, c.fire_year_start_month)})</p>
                <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
                  <span><span className="mr-1.5 inline-block h-2.5 w-5 rounded-sm bg-[var(--ink)] align-middle opacity-80" />harmonized</span>
                  <span><span className="mr-1.5 inline-block h-2.5 w-5 rounded-sm bg-[var(--seq-4)] align-middle opacity-60" />raw</span>
                </div>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label={`Fire season timing in ${country}`}>
                {months.map((m) => <g key={m.day}><line x1={dx(m.day)} x2={dx(m.day)} y1={T} y2={H - B} stroke="var(--gridline)" /><text x={dx(m.day) + 3} y={H - 10} fontSize="10" fill="var(--text-muted)">{m.label}</text></g>)}
                {years.map((y, i) => {
                  const cy = yx(y.year);
                  return (
                    <g key={y.year}>
                      <text x={L - 8} y={cy + 3.5} textAnchor="end" fontSize="10" fill={y.year === 2012 ? "var(--ember)" : "var(--text-muted)"}>{y.year}</text>
                      {y.raw_onset != null && y.raw_end != null && (
                        <motion.rect initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.02 }}
                          style={{ originX: `${dx(y.raw_onset)}px` }} x={dx(y.raw_onset)} y={cy - 6} width={dx(y.raw_end) - dx(y.raw_onset)} height="5" rx="2.5" fill="var(--seq-4)" opacity="0.55" />
                      )}
                      {y.harm_onset != null && y.harm_end != null && (
                        <motion.rect initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.02 + 0.1 }}
                          style={{ originX: `${dx(y.harm_onset)}px` }} x={dx(y.harm_onset)} y={cy} width={dx(y.harm_end) - dx(y.harm_onset)} height="5" rx="2.5" fill="var(--ink)" opacity="0.8" />
                      )}
                      {y.harm_peak != null && <circle cx={dx(y.harm_peak)} cy={cy + 2.5} r="3.5" fill="var(--ember)" stroke="#fff" strokeWidth="1" />}
                    </g>
                  );
                })}
              </svg>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Bars run from onset (10%) to end (90%); the dot marks the peak (50%). Raw: MODIS to 2011, VIIRS from 2012. Harmonized: Aqua-equivalent throughout.</p>
            </section>
          </Reveal>

          <Reveal>
            <section className="card mt-8 overflow-x-auto p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="display text-3xl">{LABEL[metric]}</h2>
                <Segmented label="metric" value={metric} onChange={setMetric} options={(["onset", "peak", "end", "length"] as Metric[]).map((m) => ({ value: m, label: m }))} />
              </div>
              <table className="tabular mt-5 w-full min-w-[620px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Year</th><th className="font-normal">Raw</th><th className="font-normal">Harmonized</th><th className="font-normal">Difference</th><th className="font-normal">Raw detections</th><th className="font-normal">Harmonized</th></tr></thead>
                <tbody>
                  {years.map((y) => {
                    const r = y[`raw_${metric}` as keyof typeof y] as number | null | undefined;
                    const h = y[`harm_${metric}` as keyof typeof y] as number | null | undefined;
                    const show = (v: number | null | undefined) => (metric === "length" ? (v ?? "—") : fireDayLabel(v, c.fire_year_start_month));
                    return (
                      <tr key={y.year} className="border-t border-[var(--hairline)]">
                        <td className={`py-2 ${y.year === 2012 ? "text-[var(--ember)]" : ""}`}>{y.year}</td>
                        <td className="text-[var(--text-secondary)]">{show(r)}</td><td>{show(h)}</td>
                        <td className="text-[var(--text-secondary)]">{r != null && h != null ? `${r - h > 0 ? "+" : ""}${r - h} d` : "—"}</td>
                        <td className="text-[var(--text-muted)]">{Math.round(y.raw_total ?? 0).toLocaleString()}</td>
                        <td className="text-[var(--text-muted)]">{Math.round(y.harm_total ?? 0).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </Reveal>

          <Reveal>
            <section className="card mt-8 overflow-x-auto p-5 sm:p-6">
              <h2 className="display text-3xl">Every region, side by side</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Least-squares trend 2003–2025, days per decade. Negative = earlier.</p>
              <table className="tabular mt-5 w-full min-w-[620px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Region</th><th className="font-normal">Onset raw</th><th className="font-normal">Onset harmonized</th><th className="font-normal">Length raw</th><th className="font-normal">Length harmonized</th><th className="font-normal">Sensor share of onset shift</th></tr></thead>
                <tbody>
                  {names.map((n) => {
                    const t = data!.countries[n].trend_days_per_decade;
                    const share = t.raw_onset != null && t.harm_onset != null && Math.abs(t.raw_onset) > 0.5 ? 1 - t.harm_onset / t.raw_onset : null;
                    return (
                      <tr key={n} className="border-t border-[var(--hairline)]">
                        <td className="py-2.5">{n}</td><td className="text-[var(--seq-5)]">{fmt(t.raw_onset)}</td><td>{fmt(t.harm_onset)}</td>
                        <td className="text-[var(--seq-5)]">{fmt(t.raw_length)}</td><td>{fmt(t.harm_length)}</td>
                        <td className="text-[var(--text-secondary)]">{share == null ? "—" : `${Math.round(share * 100)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">&quot;Sensor share&quot; = the part of the raw onset trend that disappears after harmonizing. A trend over 23 years is fragile, especially where the fire year is short; read these as indications, with the year-by-year table above.</p>
            </section>
          </Reveal>
        </>
      )}
    </div>
  );
}
