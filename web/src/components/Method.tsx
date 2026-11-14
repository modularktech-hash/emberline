"use client";

import { fmtClock, fmtNum, fmtPct, fmtR2, fmtRatio } from "@/lib/format";
import { Eyebrow } from "@/components/Figure";
import { getParams } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import { fmt } from "@/lib/ember";
import { PageHead, Reveal } from "@/components/ui";

const W = 640, H = 260, L = 40, R = 14, T = 14, B = 34;
const HUES = ["#d9431a", "#b8860b", "#3f7f96", "#7a4fa0", "#2f8f5b", "#96221a"];

function Bar({ value, tone }: { value: number; tone: "good" | "bad" }) {
  const w = Math.max(2, Math.min(100, Math.abs(value) * 100));
  return (
    <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-2)] align-middle">
      <span className="block h-full rounded-full" style={{ width: `${tone === "good" ? w : 100}%`, background: tone === "good" ? "var(--ember)" : "#d8b4ac" }} />
    </span>
  );
}

export function Method() {
  const { data: p, error, loading } = useParquet(() => getParams(), "params");
  const names = p ? Object.keys(p.countries).sort() : [];
  const origin = typeof window === "undefined" ? "https://<this-site>" : window.location.origin;
  const x = (frp: number) => L + (Math.log10(frp) / 3) * (W - L - R);
  const y = (prob: number) => T + (1 - prob) * (H - T - B);
  const curve = (b0: number, b1: number) =>
    Array.from({ length: 80 }, (_, i) => {
      const frp = 10 ** ((i / 79) * 3);
      return `${i ? "L" : "M"}${x(frp).toFixed(1)},${y(1 / (1 + Math.exp(-(b0 + b1 * Math.log(frp))))).toFixed(1)}`;
    }).join(" ");

  return (
    <div>
      <PageHead eyebrow="Science · method & proof" title="How we know the correction" italic="is real."
        lede="Three steps, tested on years the model never saw, checked against a sensor that never changed, and honest about where it is weakest." />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["01 · Match", "On the same day and place (within ~3.5 km), did the old sensor, Aqua MODIS, also see the fire that VIIRS saw? Both pass overhead in the early afternoon."],
          ["02 · Learn", "From 2012–2018 we learn the chance that MODIS sees a fire, given how much energy it radiates. Big fires: almost always. Small ones: rarely."],
          ["03 · Rebuild", "Every VIIRS detection is weighted by that chance. The total is the count a MODIS-class sensor would have made, comparable back to 2003."],
        ].map(([t, d]) => (
          <div key={t} className="card p-5"><Eyebrow>{t}</Eyebrow><p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{d}</p></div>
        ))}
      </div>

      {error && <p className="mt-8 text-sm text-[var(--text-secondary)]">Could not load the fit: {error.message}</p>}
      {loading && <div className="mt-8 h-64 animate-pulse rounded-2xl bg-[var(--surface-2)]" />}
      {p && (
        <>
          <Reveal><section className="card mt-8 p-5 sm:p-6">
            <h2 className="display text-2xl">Tested on years the model never saw</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Fitted on {p.train_years[0]}–{p.train_years[1]}, scored on {p.test_years[0]}–{p.test_years[1]} against what Aqua MODIS actually observed,
              per ~250 km² cell and month. R² of 1 is perfect; below 0 is worse than guessing the average.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="tabular w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Region</th><th className="font-normal">Emberline R² (95% CI)</th><th className="font-normal">Raw VIIRS R²</th><th className="font-normal">Best single cut-off R²</th><th className="font-normal">Bias</th><th className="font-normal">Cell-months</th></tr></thead>
                <tbody>
                  {names.map((n) => {
                    const c = p.countries[n]; const t = c.validation_test; const ci = c.validation_test_ci95;
                    return (
                      <tr key={n} className="border-t border-[var(--hairline)]">
                        <td className="py-2.5">{n}</td>
                        <td><span className="text-[var(--ember)]">{fmtR2(t.model.r2)}</span> <span className="text-xs text-[var(--text-muted)]">({fmtR2(ci.r2[0])} to {fmtR2(ci.r2[1])})</span> <Bar value={t.model.r2} tone="good" /></td>
                        <td className="text-[var(--text-secondary)]">{fmtR2(t.raw_viirs.r2)} <Bar value={1} tone="bad" /></td>
                        <td className="text-[var(--text-secondary)]">{fmtR2(t.threshold.r2)}</td>
                        <td className="text-[var(--text-secondary)]">{fmtPct(t.model.bias_pct)}</td>
                        <td className="text-[var(--text-muted)]">{fmt(t.model.n_cell_months)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section></Reveal>

          <Reveal><section className="card mt-6 p-5 sm:p-6">
            <h2 className="display text-2xl">The control: a sensor that did not change</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              How much did yearly counts change from 2009–11 to 2012–14? Aqua MODIS flew unchanged through both periods, so it shows what fire really did.
              A correct record should sit near Aqua, not near the raw splice.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="tabular w-full min-w-[520px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Region</th><th className="font-normal">Raw splice (MODIS → VIIRS)</th><th className="font-normal">Aqua only (truth)</th><th className="font-normal">Emberline</th></tr></thead>
                <tbody>
                  {names.map((n) => { const k = p.countries[n].null_control; return (
                    <tr key={n} className="border-t border-[var(--hairline)]">
                      <td className="py-2.5">{n}</td>
                      <td className="text-[#96221a]">{fmtRatio(k.spliced_raw_step_ratio_2012)}</td>
                      <td>{fmtRatio(k.aqua_only_step_ratio_2012)}</td>
                      <td className="text-[var(--ember)]">{fmtRatio(k.harmonized_step_ratio_2012)}</td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
          </section></Reveal>

          <Reveal><section className="card mt-6 p-5 sm:p-6">
            <h2 className="display text-2xl">What MODIS can and cannot see</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Fitted chance that Aqua MODIS also detects a fire VIIRS saw, by the fire&apos;s radiated power. The shaded band is the 9–11 MW
              range reported in the literature as MODIS &ldquo;thresholds of FRP detection&rdquo; (Laurent et al. 2019, citing Roberts &amp; Wooster 2008 and
              Schroeder et al. 2010) — a sanity check on the order of magnitude, not the same quantity.
            </p>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full max-w-3xl" role="img" aria-label="Detection probability against fire radiative power">
              <rect x={x(9)} width={x(11) - x(9)} y={T} height={H - T - B} fill="var(--text-primary)" opacity="0.08" />
              {[0, 0.5, 1].map((v) => (<g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--gridline)" /><text x={L - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)">{v}</text></g>))}
              {[1, 10, 100, 1000].map((f) => (<text key={f} x={x(f)} y={H - 16} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{f} MW</text>))}
              <text x={(W + L) / 2} y={H - 2} textAnchor="middle" fontSize="10" fill="var(--text-muted)">fire radiative power of the VIIRS detection</text>
              {names.map((n, i) => <path key={n} d={curve(p.countries[n].logistic.b0, p.countries[n].logistic.b1)} fill="none" stroke={HUES[i % HUES.length]} strokeWidth="2" />)}
            </svg>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-secondary)]">
              {names.map((n, i) => { const c = p.countries[n]; return (
                <span key={n} className="tabular"><span className="mr-1.5 inline-block h-0.5 w-5 align-middle" style={{ background: HUES[i % HUES.length] }} />
                  {n}: 50% at {fmtNum(c.frp_at_p50_mw, 1)} MW ({fmtNum(c.frp_at_p50_ci95_mw[0], 1)}–{fmtNum(c.frp_at_p50_ci95_mw[1], 1)})</span>); })}
            </div>
          </section></Reveal>

          <Reveal><section className="card mt-6 p-5 sm:p-6">
            <h2 className="display text-2xl">The record is still shifting: orbital drift</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Since 2022 Aqua has been drifting to a later overpass. These years were never used for fitting. The table shows Aqua&apos;s mean local
              solar time over fire detections, and observed Aqua divided by our prediction. Emberline&apos;s record from 2012 is built from Suomi-NPP,
              which has not drifted, so it is not exposed to this. In {p.train_years[0]}–2021 the ratio simply scatters year to year; read the drift years against that.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="tabular w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Region</th>{p.countries[names[0]].drift_era.map((d) => <th key={d.year} className="font-normal">{d.year}</th>)}<th className="font-normal">2012–21 range</th></tr></thead>
                <tbody>
                  {names.map((n) => { const c = p.countries[n]; const f = c.frozen_era_obs_over_pred.map((d) => d.obs_over_pred); return (
                    <tr key={n} className="border-t border-[var(--hairline)]">
                      <td className="py-2.5">{n}</td>
                      {c.drift_era.map((d) => <td key={d.year}>{fmtRatio(d.obs_over_pred)} <span className="text-xs text-[var(--text-muted)]">{fmtClock(d.aqua_lst)}</span></td>)}
                      <td className="text-[var(--text-muted)]">{fmtRatio(Math.min(...f))}–{fmtNum(Math.max(...f), 2)}</td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
          </section></Reveal>

          <Reveal><section className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="card p-5 sm:p-6">
              <h2 className="display text-2xl">Limits</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                <li>Fitted per country, standing in for region. No land-cover split yet.</li>
                <li>Matching is by day and ~3.5 km proximity, not exact pixel footprints.</li>
                <li>Scores are per small cell and month, which is noisy where fires are few and small (Portugal scores lowest).</li>
                <li>Daytime vegetation fires only; volcanoes, gas flares and offshore sources are excluded.</li>
                <li>Claims are regional. We do not claim a corrected global total.</li>
              </ul>
            </div>
            <div className="card p-5 sm:p-6">
              <h2 className="display text-2xl">Use the data</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">No account, no API key, no server. The files are plain Parquet:</p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-[var(--surface-2)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]"><code>{`import polars as pl
cal = pl.read_parquet(
  "${origin}/data/calendar_harmonized.parquet")
print(cal.filter(pl.col("key") == "Canada"))`}</code></pre>
              <p className="mt-3 text-xs text-[var(--text-muted)]">Fit {p.fit_version} · unit: {p.unit} · also <code>/data/params.json</code>, <code>/data/calendar_raw.parquet</code>.</p>
            </div>
          </section></Reveal>
        </>
      )}
    </div>
  );
}
