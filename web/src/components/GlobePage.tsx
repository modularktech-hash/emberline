"use client";

import { fmtInt, fmtNum, fmtUtc, parseUtc } from "@/lib/format";
import { Eyebrow } from "@/components/Figure";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { getLive, getTle } from "@/lib/data";
import { useParquet } from "@/lib/useParquet";
import { Chip, PageHead, Reveal, Segmented } from "@/components/ui";
import { DotStat } from "@/components/DotMatrix";
import type { Cell, SatState } from "@/components/FireGlobe";
import { SAT_COLORS } from "@/lib/sats";

const FireGlobe = dynamic(() => import("@/components/FireGlobe"), { ssr: false });

export function GlobePage() {
  const { data } = useParquet(async () => ({ live: await getLive(), tle: await getTle() }), "globe");
  const [win, setWin] = useState<"24h" | "7d">("24h");
  const [fires, setFires] = useState(true);
  const [sats, setSats] = useState(true);
  const [orbits, setOrbits] = useState(true);
  const [spin, setSpin] = useState(true);
  const [speed, setSpeed] = useState(60);
  const [picked, setPicked] = useState<Cell | null>(null);
  const [satState, setSatState] = useState<SatState[]>([]);
  const onSats = useCallback((s: SatState[]) => setSatState(s), []);

  const w = data?.live.windows[win];
  const total = w ? Object.values(w.totals).reduce((a, b) => a + b, 0) : 0;
  const top = useMemo(() => (w ? (w.cells as Cell[]).slice(0, 8) : []), [w]);

  return (
    <div>
      <PageHead eyebrow="Live · NASA FIRMS near-real-time" title="Recent satellite" italic="fire detections."
        lede={<>Raw active-fire detections from the near-real-time feeds over the last {win === "24h" ? "24 hours" : "7 days"} before the snapshot, and the satellites that made them. Uncorrected, and they include gas flares and volcanoes. Drag to spin, scroll to zoom, hover a spike.</>} />
      {data && (
        <dl className="-mt-6 mb-8 grid max-w-4xl gap-x-6 gap-y-2 rounded-2xl border border-[var(--hairline)] p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[var(--text-muted)]">Observation window</dt><dd className="tabular mt-0.5 text-[var(--text-primary)]">{win === "24h" ? "last 24 h" : "last 7 days"} before the snapshot{w?.dates?.length ? `, acquisitions dated ${w.dates[0]}${w.dates.length > 1 ? ` to ${w.dates[w.dates.length - 1]}` : ""} (UTC)` : ""}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Fire data last fetched</dt><dd className="tabular mt-0.5 text-[var(--text-primary)]">{fmtUtc(parseUtc(data.live.fetched_utc))}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Orbit elements (TLE) fetched</dt><dd className="tabular mt-0.5 text-[var(--text-primary)]">{fmtUtc(parseUtc(data.tle.fetched))}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Satellite motion</dt><dd className="mt-0.5 text-[var(--text-primary)]">simulated from the TLEs at ×{speed} speed; not the satellites&apos; live positions</dd></div>
          <div className="sm:col-span-2 lg:col-span-4"><dt className="sr-only">Caveat</dt><dd className="font-medium text-[var(--ember)]">Raw and uncorrected · NOAA-20/21 VIIRS and MODIS, not the Suomi-NPP record Emberline harmonizes · includes gas flares and volcanoes</dd></div>
        </dl>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Reveal>
          <div className="window relative">
            <div className="flex flex-wrap items-center gap-2 bg-white/30 px-4 py-3">
              <Segmented label="window" value={win} onChange={setWin} options={[{ value: "24h", label: "24 hours" }, { value: "7d", label: "7 days" }]} />
              <Chip on={fires} onClick={() => setFires(!fires)}>Fires</Chip>
              <Chip on={sats} onClick={() => setSats(!sats)}>Satellites</Chip>
              <Chip on={orbits} onClick={() => setOrbits(!orbits)}>Orbits</Chip>
              <Chip on={spin} onClick={() => setSpin(!spin)}>Auto-spin</Chip>
              <label className="ml-auto flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                Time ×<span className="tabular w-8">{speed}</span>
                <input type="range" min={1} max={600} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Time speed" className="w-24 min-w-0 accent-[var(--ember)] sm:w-32" />
              </label>
            </div>
            <div className="bg-[radial-gradient(circle_at_50%_45%,rgba(255,214,150,0.35),transparent_60%)]">
              <FireGlobe live={data?.live ?? null} tle={data?.tle.satellites ?? null} window={win} showFires={fires} showSats={sats}
                showOrbits={orbits} speed={speed} autoRotate={spin} onPick={setPicked} onSats={onSats} height={600} satLabels />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--hairline)] px-4 py-3 text-xs text-[var(--text-secondary)]">
              <span>Spike height = radiated power · width = number of detections · 0.5° cells</span>
              {data && <span className="tabular ml-auto text-[var(--text-muted)]">Fires fetched {data.live.fetched_utc} · orbits {data.tle.fetched}</span>}
            </div>
          </div>
        </Reveal>

        <div className="space-y-4">
          <Reveal delay={0.05}>
            <div className="card p-5">
              <Eyebrow>Detections, last {win}</Eyebrow>
              <div className="mt-3">{w ? <DotStat text={fmtInt(total)} dot={5} /> : <span className="display text-4xl">…</span>}</div>
              <div className="mt-4 space-y-1.5 text-sm">
                {w && Object.entries(w.totals).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-[var(--text-secondary)]">{k}</span><span className="tabular">{fmtInt(v)}</span></div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
                Live layer = NOAA-20/21 VIIRS + MODIS. Suomi-NPP&apos;s live feed is empty, so this is a different platform mix from the harmonized history, and not corrected. Live feeds carry no source type, so volcanoes and gas flares are included.
              </p>
            </div>
          </Reveal>
          {picked && (
            <div className="card border-[var(--ember)] p-5">
              <Eyebrow>Selected cell</Eyebrow>
              <p className="tabular mt-2 text-lg">{fmtNum(picked[0], 2)}°, {fmtNum(picked[1], 2)}°</p>
              <p className="tabular text-sm text-[var(--text-secondary)]">{fmtInt(picked[2])} detections · {fmtInt(picked[3])} MW · peak {fmtInt(picked[4])} MW</p>
              <p className="text-xs text-[var(--text-muted)]">Seen by {picked[5]}</p>
            </div>
          )}
          <Reveal delay={0.1}>
            <div className="card p-5">
              <Eyebrow>Hottest cells</Eyebrow>
              <ol className="mt-3 space-y-2 text-sm">
                {top.map((c, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setPicked(c)} className="tabular flex w-full justify-between rounded-lg px-1 text-left hover:bg-[var(--surface-2)]">
                      <span className="text-[var(--text-secondary)]">{i + 1}. {fmtNum(c[0], 1)}°, {fmtNum(c[1], 1)}°</span>
                      <span>{fmtInt(c[3])} MW</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </div>

      <Reveal>
        <section className="card mt-8 min-w-0 p-5 sm:p-6">
          <h2 className="display text-3xl">The fleet, live</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Positions propagated from today&apos;s TLEs with SGP4, at the simulated clock above.</p>
          <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Satellite positions">
          <table className="tabular mt-4 w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Satellite</th><th className="font-normal">Sensor</th><th className="font-normal">Latitude</th><th className="font-normal">Longitude</th><th className="font-normal">Altitude</th><th className="font-normal">Overpass</th></tr></thead>
            <tbody>
              {satState.map((s) => {
                const t = data?.tle.satellites.find((x) => x.name === s.name);
                return (
                  <tr key={s.name} className="border-t border-[var(--hairline)]">
                    <td className="py-2.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SAT_COLORS[s.name] }} />{s.name}</td>
                    <td>{s.instrument}</td><td>{fmtNum(s.lat, 2)}°</td><td>{fmtNum(s.lng, 2)}°</td>
                    <td>{fmtInt(s.alt * 6371)} km</td><td className="text-xs text-[var(--text-secondary)]">{t?.overpass}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
