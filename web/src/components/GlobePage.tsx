"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { getLive, getTle } from "@/lib/data";
import { useParquet } from "@/lib/useParquet";
import { Chip, CountUp, PageHead, Reveal, Segmented } from "@/components/ui";
import { SAT_COLORS, type Cell, type SatState } from "@/components/FireGlobe";

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
      <PageHead eyebrow="Live · NASA FIRMS near-real-time" title="Every fire seen from orbit," italic="right now."
        lede={<>The last {win === "24h" ? "24 hours" : "7 days"} of active-fire detections worldwide, and the satellites that saw them, at their real positions from today&apos;s public orbital data. Drag to spin, scroll to zoom, hover a spike.</>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
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
                <input type="range" min={1} max={600} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="accent-[var(--ember)]" />
              </label>
            </div>
            <div className="bg-[radial-gradient(circle_at_50%_45%,rgba(255,214,150,0.35),transparent_60%)]">
              <FireGlobe live={data?.live ?? null} tle={data?.tle.satellites ?? null} window={win} showFires={fires} showSats={sats}
                showOrbits={orbits} speed={speed} autoRotate={spin} onPick={setPicked} onSats={onSats} height={600} />
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
              <p className="eyebrow">Detections, last {win}</p>
              <p className="display mt-2 text-5xl"><CountUp key={win + total} to={total} /></p>
              <div className="mt-4 space-y-1.5 text-sm">
                {w && Object.entries(w.totals).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-[var(--text-secondary)]">{k}</span><span className="tabular">{v.toLocaleString()}</span></div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
                Live layer = NOAA-20/21 VIIRS + MODIS. Suomi-NPP&apos;s live feed is empty, so this is a different platform mix from the harmonized history, and not corrected. Live feeds carry no source type, so volcanoes and gas flares are included.
              </p>
            </div>
          </Reveal>
          {picked && (
            <div className="card border-[var(--ember)] p-5">
              <p className="eyebrow">Selected cell</p>
              <p className="tabular mt-2 text-lg">{picked[0].toFixed(2)}°, {picked[1].toFixed(2)}°</p>
              <p className="tabular text-sm text-[var(--text-secondary)]">{picked[2].toLocaleString()} detections · {Math.round(picked[3]).toLocaleString()} MW · peak {Math.round(picked[4])} MW</p>
              <p className="text-xs text-[var(--text-muted)]">Seen by {picked[5]}</p>
            </div>
          )}
          <Reveal delay={0.1}>
            <div className="card p-5">
              <p className="eyebrow">Hottest cells</p>
              <ol className="mt-3 space-y-2 text-sm">
                {top.map((c, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setPicked(c)} className="tabular flex w-full justify-between rounded-lg px-1 text-left hover:bg-[var(--surface-2)]">
                      <span className="text-[var(--text-secondary)]">{i + 1}. {c[0].toFixed(1)}°, {c[1].toFixed(1)}°</span>
                      <span>{Math.round(c[3]).toLocaleString()} MW</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </div>

      <Reveal>
        <section className="card mt-8 overflow-x-auto p-5 sm:p-6">
          <h2 className="display text-3xl">The fleet, live</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Positions propagated from today&apos;s TLEs with SGP4, at the simulated clock above.</p>
          <table className="tabular mt-4 w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-2 font-normal">Satellite</th><th className="font-normal">Sensor</th><th className="font-normal">Latitude</th><th className="font-normal">Longitude</th><th className="font-normal">Altitude</th><th className="font-normal">Overpass</th></tr></thead>
            <tbody>
              {satState.map((s) => {
                const t = data?.tle.satellites.find((x) => x.name === s.name);
                return (
                  <tr key={s.name} className="border-t border-[var(--hairline)]">
                    <td className="py-2.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SAT_COLORS[s.name] }} />{s.name}</td>
                    <td>{s.instrument}</td><td>{s.lat.toFixed(2)}°</td><td>{s.lng.toFixed(2)}°</td>
                    <td>{Math.round(s.alt * 6371)} km</td><td className="text-xs text-[var(--text-secondary)]">{t?.overpass}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </Reveal>
    </div>
  );
}
