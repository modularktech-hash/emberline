"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";
import type { Live, Tle } from "@/lib/data";

export type Cell = [number, number, number, number, number, string];
export interface SatState { name: string; instrument: string; lat: number; lng: number; alt: number; color: string }

export const SAT_COLORS: Record<string, string> = {
  Terra: "#7a4fa0", Aqua: "#3f7f96", "Suomi-NPP": "#d9431a", "NOAA-20": "#b8860b", "NOAA-21": "#2f8f5b",
};
const RAMP = ["#f9c46b", "#f49b3f", "#e66a26", "#c93f1c", "#96221a", "#561114"];
const fireColor = (frp: number, max: number) => RAMP[Math.min(5, Math.floor(Math.sqrt(frp / max) * 6))];
const EARTH_KM = 6371;

/** Position of each satellite at time `t`, plus the next orbit as a ground track. */
export function satellitePositions(recs: Array<{ tle: Tle; rec: SatRec }>, t: Date) {
  const gmst = gstime(t);
  return recs.flatMap(({ tle, rec }) => {
    const pv = propagate(rec, t);
    if (!pv || typeof pv.position === "boolean" || !pv.position) return [];
    const g = eciToGeodetic(pv.position, gmst);
    return [{ name: tle.name, instrument: tle.instrument, lat: degreesLat(g.latitude), lng: degreesLong(g.longitude), alt: g.height / EARTH_KM, color: SAT_COLORS[tle.name] ?? "#121715" }];
  });
}

function orbitTrack(rec: SatRec, t: Date, minutes = 101, step = 1.5): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  for (let m = 0; m <= minutes; m += step) {
    const at = new Date(t.getTime() + m * 60_000);
    const pv = propagate(rec, at);
    if (!pv || typeof pv.position === "boolean" || !pv.position) continue;
    const g = eciToGeodetic(pv.position, gstime(at));
    pts.push([degreesLat(g.latitude), degreesLong(g.longitude), g.height / EARTH_KM]);
  }
  return pts;
}

interface Props {
  live: Live | null;
  tle: Tle[] | null;
  window?: "24h" | "7d";
  showFires?: boolean;
  showSats?: boolean;
  showOrbits?: boolean;
  speed?: number;
  autoRotate?: boolean;
  height?: number;
  interactive?: boolean;
  onPick?: (c: Cell) => void;
  onSats?: (s: SatState[]) => void;
}

export default function FireGlobe({
  live, tle, window: win = "24h", showFires = true, showSats = true, showOrbits = true, speed = 60,
  autoRotate = true, height = 560, interactive = true, onPick, onSats,
}: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [Globe, setGlobe] = useState<null | typeof import("react-globe.gl").default>(null);
  const [land, setLand] = useState<object[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [hover, setHover] = useState<Cell | null>(null);

  useEffect(() => { import("react-globe.gl").then((m) => setGlobe(() => m.default)); }, []);
  useEffect(() => {
    fetch("/geo/countries.geojson").then((r) => r.json()).then((g) => setLand(g.features)).catch(() => setLand([]));
  }, []);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // Simulation clock: real time scaled by `speed`, ticking ~10 times a second.
  useEffect(() => {
    if (!showSats) return;
    const start = Date.now(), base = Date.now();
    const id = setInterval(() => setNow(new Date(base + (Date.now() - start) * speed)), 100);
    return () => clearInterval(id);
  }, [speed, showSats]);

  const recs = useMemo(() => (tle ?? []).map((t) => ({ tle: t, rec: twoline2satrec(t.line1, t.line2) })), [tle]);
  const sats = useMemo(() => (showSats ? satellitePositions(recs, now) : []), [recs, now, showSats]);
  useEffect(() => { onSats?.(sats); }, [sats, onSats]);

  // Orbits are recomputed once a simulated minute, not every frame.
  const orbitKey = Math.floor(now.getTime() / 60_000);
  const orbits = useMemo(() => (showSats && showOrbits
    ? recs.map(({ tle: t, rec }) => ({ name: t.name, color: SAT_COLORS[t.name], pts: orbitTrack(rec, new Date(orbitKey * 60_000)) }))
    : []), [recs, orbitKey, showSats, showOrbits]);

  const cells = useMemo(() => (showFires && live ? live.windows[win].cells : []) as Cell[], [live, win, showFires]);
  const maxFrp = useMemo(() => Math.max(1, ...cells.slice(0, 50).map((c) => c[3])), [cells]);
  const rings = useMemo(() => cells.slice(0, 18), [cells]);

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const c = g.controls() as { autoRotate: boolean; autoRotateSpeed: number; enableZoom: boolean };
    c.autoRotate = autoRotate;
    c.autoRotateSpeed = 0.45;
    c.enableZoom = interactive;
  }, [Globe, autoRotate, interactive]);
  useEffect(() => { ref.current?.pointOfView({ lat: 12, lng: 18, altitude: 2.3 }, 0); }, [Globe]);

  const material = useMemo(() => new THREE.MeshPhongMaterial({ color: "#f3ecdc", emissive: "#efe4cb", emissiveIntensity: 0.35, shininess: 4 }), []);
  const satMesh = useMemo(() => (d: object) => {
    const s = d as SatState;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshLambertMaterial({ color: s.color }));
    const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 1.4), new THREE.MeshLambertMaterial({ color: "#1d3a5c" }));
    grp.add(body, panel);
    return grp;
  }, []);

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      {Globe ? (
        <Globe
          ref={ref}
          width={width}
          height={height}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={material}
          showAtmosphere
          atmosphereColor="#f2a56b"
          atmosphereAltitude={0.16}
          hexPolygonsData={land}
          hexPolygonResolution={3}
          hexPolygonMargin={0.42}
          hexPolygonUseDots
          hexPolygonColor={() => "rgba(18,23,21,0.62)"}
          pointsData={cells}
          pointLat={(d) => (d as Cell)[0]}
          pointLng={(d) => (d as Cell)[1]}
          pointAltitude={(d) => Math.min(0.32, 0.006 + Math.sqrt((d as Cell)[3] / maxFrp) * 0.2)}
          pointRadius={(d) => Math.min(0.55, 0.16 + Math.log10(1 + (d as Cell)[2]) * 0.12)}
          pointColor={(d) => fireColor((d as Cell)[3], maxFrp)}
          pointsMerge={!interactive}
          pointsTransitionDuration={900}
          onPointHover={interactive ? (d) => setHover(d as Cell | null) : undefined}
          onPointClick={interactive ? (d) => onPick?.(d as Cell) : undefined}
          ringsData={rings}
          ringLat={(d) => (d as Cell)[0]}
          ringLng={(d) => (d as Cell)[1]}
          ringColor={() => (t: number) => `rgba(217,67,26,${1 - t})`}
          ringMaxRadius={3.2}
          ringPropagationSpeed={1.6}
          ringRepeatPeriod={1400}
          objectsData={sats}
          objectLat="lat"
          objectLng="lng"
          objectAltitude="alt"
          objectThreeObject={satMesh as (d: object) => THREE.Object3D}
          objectLabel={(d: object) => `<div style="font:12px Geist,sans-serif;background:#121715;color:#f7f3e8;padding:4px 8px;border-radius:8px">${(d as SatState).name} · ${(d as SatState).instrument}</div>`}
          pathsData={orbits}
          pathPoints="pts"
          pathPointLat={(p) => (p as [number, number, number])[0]}
          pathPointLng={(p) => (p as [number, number, number])[1]}
          pathPointAlt={(p) => (p as [number, number, number])[2]}
          pathColor={(d: object) => [(d as { color: string }).color + "00", (d as { color: string }).color]}
          pathStroke={1.4}
          pathDashLength={0.25}
          pathDashGap={0.008}
          pathDashAnimateTime={9000}
          pathTransitionDuration={0}
        />
      ) : (
        <div className="flex h-full items-center justify-center"><div className="h-[70%] aspect-square animate-pulse rounded-full bg-[var(--surface-2)]" /></div>
      )}
      {interactive && hover && (
        <div className="tabular pointer-events-none absolute left-4 top-4 rounded-xl bg-[var(--ink)] px-3.5 py-2.5 text-xs leading-relaxed text-[#f7f3e8] shadow-xl">
          <p className="font-medium">{hover[0].toFixed(1)}°, {hover[1].toFixed(1)}°</p>
          <p>{hover[2].toLocaleString()} detections · {Math.round(hover[3]).toLocaleString()} MW total</p>
          <p className="text-[#b8b2a2]">peak {Math.round(hover[4])} MW · {hover[5]}</p>
        </div>
      )}
    </div>
  );
}
