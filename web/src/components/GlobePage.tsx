"use client";

import { fmtInt, fmtNum, fmtUtc, parseUtc } from "@/lib/format";
import { Eyebrow } from "@/components/Figure";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadJson } from "@/lib/queries";

interface Eonet { fetched_utc: string; label: string; n_events: number; date_range: [string, string] | null; events: Array<{ id: string; title: string | null; date: string | null; lat: number; lon: number; source: string | null }> }
import { getLive, getTle } from "@/lib/data";
import { useParquet } from "@/lib/useParquet";
import { Chip, PageHead, Reveal, Segmented } from "@/components/ui";
import { DotStat } from "@/components/DotMatrix";
import { RecentActivityCard } from "@/components/RecentActivityCard";
import type { Cell, SatState } from "@/components/FireGlobe";
import type { LiveWindow } from "@/lib/data";

/** Additive E36 metadata in live.json (docs/data-contract-additions.md §9); every field may be absent in older snapshots. */
type LiveWindowMeta = LiveWindow & { platforms?: string[]; detections_total?: number; frp_sum_definition?: string; window_start_utc?: string | null; window_end_utc?: string | null; window_span_note?: string };

export const FRP_SUM_NOTE = "sum of reported FRP across detections in this window — not instantaneous power or energy";
import { SAT_COLORS } from "@/lib/sats";

/**
 * Stale-snapshot threshold (E37): the page describes "the last 24 hours before the snapshot".
 * Once the snapshot is older than 24 h, even the 24 h window no longer overlaps the present day,
 * so the page says the snapshot is stale and gives its age. 
 */
export const STALE_AFTER_HOURS = 24;

const FireGlobe = dynamic(() => import("@/components/FireGlobe"), { ssr: false });

export function GlobePage() {
  const { data } = useParquet(async () => ({ live: await getLive(), tle: await getTle() }), "globe");
  const [win, setWin] = useState<"24h" | "7d">("24h");
  const [fires, setFires] = useState(true);
  const [sats, setSats] = useState(true);
  const [orbits, setOrbits] = useState(true);
  const [spin, setSpin] = useState(true);
  const [eonetOn, setEonetOn] = useState(false);
  const [eonet, setEonet] = useState<Eonet | null>(null);
  const [eonetErr, setEonetErr] = useState<string | null>(null);
  useEffect(() => {
    if (!eonetOn || eonet) return;
    let on = true;
    loadJson<Eonet>("eonet.json").then((d) => on && setEonet(d), (e: Error) => on && setEonetErr(e.message));
    return () => { on = false; };
  }, [eonetOn, eonet]);
  const [speed, setSpeed] = useState(60);
  const [paused, setPaused] = useState(false);
  const [played, setPlayed] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = window.setTimeout(() => {
      setNow(Date.now());
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPaused(true);
    }, 0);
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(t); };
  }, []);
  const [picked, setPicked] = useState<Cell | null>(null);
  const [satState, setSatState] = useState<SatState[]>([]);
  const onSats = useCallback((s: SatState[]) => setSatState(s), []);

  const w = data?.live.windows[win] as LiveWindowMeta | undefined;
  const total = w ? Object.values(w.totals).reduce((a, b) => a + b, 0) : 0;
  const top = useMemo(() => (w ? (w.cells as Cell[]).slice(0, 8) : []), [w]);
  const table = useMemo(() => (w ? (w.cells as Cell[]).slice(0, 25) : []), [w]);
  const fetchedMs = data ? parseUtc(data.live.fetched_utc)?.getTime() ?? null : null;
  const ageH = fetchedMs != null && now != null ? (now - fetchedMs) / 3_600_000 : null;
  const stale = ageH != null && ageH > STALE_AFTER_HOURS;
  const windowLabel = w?.window_start_utc && w?.window_end_utc ? `${w.window_start_utc} – ${w.window_end_utc}` : w?.dates?.length ? `${w.dates[0]}${w.dates.length > 1 ? ` to ${w.dates[w.dates.length - 1]}` : ""} (UTC dates)` : "";

  return (
    <div>
      <PageHead eyebrow="Live · NASA FIRMS near-real-time" title="Recent satellite" italic="fire detections."
        lede={<>Raw active-fire detections from the near-real-time feeds over the last {win === "24h" ? "24 hours" : "7 days"} before the snapshot, and the satellites that made them. Uncorrected, and they include gas flares and volcanoes. Drag to spin, scroll to zoom, hover a spike.</>} />
      {stale && ageH != null && (
        <p role="status" className="-mt-4 mb-6 max-w-4xl rounded-2xl border border-[var(--ember)] bg-[var(--ember-soft)] p-4 text-sm text-[var(--text-primary)]">
          <strong>Stale snapshot.</strong> These detections were fetched {ageH >= 48 ? `${fmtInt(ageH / 24)} days` : `${fmtInt(ageH)} hours`} ago ({data?.live.fetched_utc}), more than {STALE_AFTER_HOURS} h, so they no longer describe current fire activity. The globe and table show that snapshot as it was.
        </p>
      )}
      {data && (
        <dl className="-mt-6 mb-8 grid max-w-4xl gap-x-6 gap-y-2 rounded-2xl border border-[var(--hairline)] p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[var(--text-muted)]">Observation window</dt><dd className="tabular mt-0.5 text-[var(--text-primary)]">{win === "24h" ? "last 24 h" : "last 7 days"} before the snapshot{w?.dates?.length ? `, acquisitions dated ${w.dates[0]}${w.dates.length > 1 ? ` to ${w.dates[w.dates.length - 1]}` : ""} (UTC)` : ""}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Fire data last fetched</dt><dd className="tabular mt-0.5 text-[var(--text-primary)]">{fmtUtc(parseUtc(data.live.fetched_utc))}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Orbit elements (TLE) fetched</dt><dd className="tabular mt-0.5 text-[var(--text-primary)]">{fmtUtc(parseUtc(data.tle.fetched))}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Satellite motion</dt><dd className="mt-0.5 text-[var(--text-primary)]">simulated from the TLEs at ×{speed} speed; not the satellites&apos; live positions</dd></div>
          <div><dt className="text-[var(--text-muted)]">Window start – end (UTC)</dt><dd className="tabular mt-0.5 text-[var(--text-primary)]">{w?.window_start_utc && w?.window_end_utc ? `${w.window_start_utc} – ${w.window_end_utc}` : "window times from next refresh"}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Platforms in this window</dt><dd className="mt-0.5 text-[var(--text-primary)]">{w?.platforms?.length ? w.platforms.join(", ") : Object.keys(w?.totals ?? {}).join(", ")}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Detections in this window</dt><dd className="tabular mt-0.5 text-[var(--text-primary)]">{fmtInt(w?.detections_total ?? total)}</dd></div>
          <div><dt className="text-[var(--text-muted)]">Summed FRP (Σ FRP, MW)</dt><dd className="mt-0.5 text-[var(--text-primary)]">{FRP_SUM_NOTE}</dd></div>
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
              <Chip on={eonetOn} onClick={() => setEonetOn(!eonetOn)}>EONET wildfire events</Chip>
              <div className="ml-auto flex items-center gap-2" role="group" aria-label="Simulated satellite time">
              <button type="button" onClick={() => { setPaused(!paused); if (paused) setPlayed(true); }} aria-pressed={paused} className="glass-thin min-h-[32px] px-3 text-xs font-medium">{paused ? "▶ Play" : "❚❚ Pause"}</button>
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                Speed ×<span className="tabular w-8">{speed}</span>
                <input type="range" min={1} max={600} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Simulated time speed" className="w-24 min-w-0 accent-[var(--ember)] sm:w-32" />
              </label>
              </div>
            </div>
            <div className="bg-[radial-gradient(circle_at_50%_45%,rgba(255,214,150,0.35),transparent_60%)]">
              <FireGlobe live={data?.live ?? null} tle={data?.tle.satellites ?? null} window={win} showFires={fires} showSats={sats}
                showOrbits={orbits} speed={paused ? 0 : speed} autoRotate={spin} onPick={setPicked} onSats={onSats} height={600} satLabels
                focus={picked ? { lat: picked[0], lng: picked[1] } : null} motionOverride={played} events={eonetOn ? eonet?.events ?? null : null} />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--hairline)] px-4 py-3 text-xs text-[var(--text-secondary)]">
              <span>Spike height = summed FRP in the window (Σ FRP, not instantaneous power) · width = number of detections · 0.5° cells</span>
              <span className="font-medium text-[var(--text-primary)]">Satellite positions — simulated from TLEs{data ? ` fetched ${fmtUtc(parseUtc(data.tle.fetched))}` : ""}{paused ? " · paused" : ` · ×${speed}`}</span>
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
          {eonetOn && (
            <div className="card p-5" data-testid="eonet-panel">
              <Eyebrow>NASA EONET wildfire events</Eyebrow>
              {eonetErr ? <p className="mt-2 text-sm text-[var(--text-secondary)]">Could not load eonet.json: {eonetErr}</p> : !eonet ? <p className="mt-2 text-sm text-[var(--text-muted)]">Loading…</p> : (
                <>
                  <p className="tabular mt-2 text-2xl">{fmtInt(eonet.n_events)} <span className="text-sm text-[var(--text-secondary)]">open events (blue markers)</span></p>
                  <p className="tabular mt-1 text-xs text-[var(--text-secondary)]">{fmtInt(eonet.events.filter((e) => e.date && e.date >= eonet.events[0].date!.slice(0, 8) + "01").length)} with a latest report in {eonet.events[0]?.date?.slice(0, 7)} · reports {eonet.date_range?.[0].slice(0, 10)} to {eonet.date_range?.[1].slice(0, 10)}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{eonet.label}. “Open” means EONET has not closed the event; many were last reported long ago. Fetched {eonet.fetched_utc}. Hover a blue marker for its title.</p>
                  <ul className="mt-3 space-y-1.5 text-xs">{eonet.events.slice(0, 5).map((e) => (
                    <li key={e.id}><a className="link-ul" href={`https://eonet.gsfc.nasa.gov/api/v3/events/${e.id}`} target="_blank" rel="noreferrer">{e.title}</a> <span className="text-[var(--text-muted)]">{e.date?.slice(0, 10)}</span></li>))}</ul>
                </>
              )}
            </div>
          )}
          {picked && (
            <div className="card border-[var(--ember)] p-5">
              <Eyebrow>Selected cell</Eyebrow>
              <p className="tabular mt-2 text-lg">{fmtNum(picked[0], 2)}°, {fmtNum(picked[1], 2)}°</p>
              <p className="tabular text-sm text-[var(--text-secondary)]">{fmtInt(picked[2])} detections · Σ FRP {fmtInt(picked[3])} MW · peak {fmtInt(picked[4])} MW</p>
              <p className="text-xs text-[var(--text-muted)]">Seen by {picked[5]}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Σ FRP = {FRP_SUM_NOTE}.</p>
            </div>
          )}
          <Reveal delay={0.1}>
            <div className="card p-5">
              <Eyebrow>Hottest cells by Σ FRP · click to show on the globe</Eyebrow>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Σ FRP = {FRP_SUM_NOTE}.</p>
              <ol className="mt-3 space-y-2 text-sm">
                {top.map((c, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setPicked(c)} aria-label={`Show cell ${i + 1} on the globe`} aria-pressed={picked === c} className={`tabular flex min-h-[32px] w-full items-center justify-between rounded-lg px-1 text-left hover:bg-[var(--surface-2)] ${picked === c ? "bg-[var(--ember-soft)]" : ""}`}>
                      <span className="text-[var(--text-secondary)]">{i + 1}. {fmtNum(c[0], 1)}°, {fmtNum(c[1], 1)}°</span>
                      <span>Σ {fmtInt(c[3])} MW</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </div>

      <Reveal>
        <section className="card mt-8 min-w-0 p-5 sm:p-6" aria-labelledby="hottest-table">
          <h2 id="hottest-table" className="display text-3xl">Hottest cells, as a table</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">The same snapshot without the globe: the {table.length} 0.5° cells with the largest Σ FRP in the {win === "24h" ? "24-hour" : "7-day"} window. Σ FRP = {FRP_SUM_NOTE}.</p>
          <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Hottest cells table">
          <table className="tabular mt-4 w-full min-w-[640px] text-sm">
            <caption className="sr-only">Hottest 0.5° cells by summed FRP, {win} window, snapshot fetched {data?.live.fetched_utc}</caption>
            <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th scope="col" className="py-2 font-normal">#</th><th scope="col" className="font-normal">Latitude, longitude (cell centre)</th><th scope="col" className="font-normal">Window</th><th scope="col" className="font-normal">Detections</th><th scope="col" className="font-normal">Platforms</th><th scope="col" className="font-normal">Σ FRP (MW)</th><th scope="col" className="font-normal">Peak FRP (MW)</th></tr></thead>
            <tbody>
              {table.map((c, i) => (
                <tr key={i} className="border-t border-[var(--hairline)]">
                  <td className="py-2">{i + 1}</td><td>{fmtNum(c[0], 2)}°, {fmtNum(c[1], 2)}°</td>
                  <td className="text-xs text-[var(--text-secondary)]">{windowLabel}</td>
                  <td>{fmtInt(c[2])}</td><td className="text-xs">{c[5].split("+").join(", ")}</td><td>{fmtInt(c[3])}</td><td>{fmtInt(c[4])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      </Reveal>

      <RecentActivityCard />

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
