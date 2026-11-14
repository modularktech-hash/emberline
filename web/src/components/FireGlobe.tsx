"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";
import type { Live, Tle } from "@/lib/data";
import { setPerfLow, usePerfLow } from "@/lib/perf";

export type Cell = [number, number, number, number, number, string];
export interface SatState { name: string; instrument: string; lat: number; lng: number; alt: number; color: string }

export const SAT_COLORS: Record<string, string> = {
  Terra: "#7a4fa0", Aqua: "#3f7f96", "Suomi-NPP": "#d9431a", "NOAA-20": "#b8860b", "NOAA-21": "#2f8f5b",
};
const RAMP = ["#f9c46b", "#f49b3f", "#e66a26", "#c93f1c", "#96221a", "#561114"];
const fireColor = (frp: number, max: number) => RAMP[Math.min(5, Math.floor(Math.sqrt(frp / max) * 6))];
const EARTH_KM = 6371;
/**
 * Dotted land, pre-baked into one small equirectangular texture
 * (scripts/make_globe_texture.py). It replaces ~10k H3 hex-dot meshes that
 * were polyfilled from countries.geojson on the main thread at every load.
 */
const LAND_TEXTURE = "/geo/land-dots.png";

/** Position of each satellite at time `t`. */
export function satellitePositions(recs: Array<{ tle: Tle; rec: SatRec }>, t: Date) {
  const gmst = gstime(t);
  return recs.flatMap(({ tle, rec }) => {
    const pv = propagate(rec, t);
    if (!pv || typeof pv.position === "boolean" || !pv.position) return [];
    const g = eciToGeodetic(pv.position, gmst);
    return [{ name: tle.name, instrument: tle.instrument, lat: degreesLat(g.latitude), lng: degreesLong(g.longitude), alt: g.height / EARTH_KM, color: SAT_COLORS[tle.name] ?? "#121715" }];
  });
}

function orbitTrack(rec: SatRec, t: Date, minutes = 101, step = 2): Array<[number, number, number]> {
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
  /** Wheel zoom; off on the home page so scrolling never gets captured. */
  allowZoom?: boolean;
  /** Hover labels on satellites. Costs a raycast per pointer move, so only pages about satellites turn it on. */
  satLabels?: boolean;
  /** Cap on fire cells drawn (largest radiated power first). */
  maxPoints?: number;
  onPick?: (c: Cell) => void;
  onSats?: (s: SatState[]) => void;
}

/** A static stand-in: shown while three.js loads, and instead of the canvas when WebGL is unavailable or lost. */
export function GlobePoster({ height, note }: { height: number; note?: string }) {
  const d = Math.round(height * 0.72);
  return (
    <div className="flex h-full flex-col items-center justify-center" style={{ height }}>
      <div aria-hidden className="rounded-full shadow-[0_0_60px_10px_rgba(242,165,107,0.35)]"
        style={{ width: d, height: d, background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), transparent 45%), radial-gradient(circle at 50% 50%, transparent 58%, rgba(60,30,15,0.18) 72%), url(${LAND_TEXTURE}) 22% 50% / 200% 100% #f3ecdc`, backgroundBlendMode: "normal, normal, multiply" }} />
      {note && <p className="mt-4 max-w-xs text-center text-xs text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}

/** Catches a failed WebGL context creation so it never takes the page down. */
class GlobeBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const webglAvailable = () => typeof window !== "undefined" && ("WebGL2RenderingContext" in window || "WebGLRenderingContext" in window);

export default function FireGlobe(props: Props) {
  const height = props.height ?? 560;
  const [lost, setLost] = useState(false);
  const fallback = <GlobePoster height={height} note="The 3D globe needs WebGL, which this browser has turned off. Everything else on the page works." />;
  if (lost || !webglAvailable()) return fallback;
  return <GlobeBoundary fallback={fallback}><GlobeInner {...props} height={height} onLost={() => setLost(true)} /></GlobeBoundary>;
}

function GlobeInner({
  live, tle, window: win = "24h", showFires = true, showSats = true, showOrbits = true, speed = 60,
  autoRotate = true, height = 560, interactive = true, allowZoom, satLabels = false, maxPoints = 12000, onPick, onSats, onLost,
}: Props & { onLost: () => void }) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  const low = usePerfLow();
  const [width, setWidth] = useState(0);
  const [Globe, setGlobe] = useState<null | typeof import("react-globe.gl").default>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Cell | null>(null);

  // Load the three.js/globe chunk only once the globe is near the viewport.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      import("react-globe.gl").then((m) => setGlobe(() => m.default));
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!wrap.current) return;
    let last = 0;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (Math.abs(w - last) >= 2) { last = w; setWidth(w); } // ignore sub-pixel jitter: no resize loops
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const recs = useMemo(() => (tle ?? []).map((t) => ({ tle: t, rec: twoline2satrec(t.line1, t.line2) })), [tle]);

  // Simulated clock, kept in refs: advancing it never re-renders React.
  const sim = useRef({ base: 0, start: 0, speed });
  const simNow = useCallback(() => {
    const s = sim.current;
    if (!s.start) { s.base = s.start = Date.now(); }
    return new Date(s.base + (Date.now() - s.start) * s.speed);
  }, []);
  useEffect(() => {
    const now = simNow().getTime();
    sim.current = { base: now, start: Date.now(), speed };
  }, [speed, simNow]);

  // Satellites: five stable data objects whose three.js meshes we move ourselves.
  // Simulated epochs (ms) captured in callbacks, so render stays pure: one for the
  // satellites' initial placement, one for the orbit tracks (refreshed every 12 s).
  const [satEpoch, setSatEpoch] = useState<number | null>(null);
  const [orbitEpoch, setOrbitEpoch] = useState<number | null>(null);
  const satData = useMemo(() => (showSats && satEpoch != null ? satellitePositions(recs, new Date(satEpoch)) : []), [recs, showSats, satEpoch]);
  const meshes = useRef(new Map<string, THREE.Object3D>());
  const satMesh = useCallback((d: object) => {
    const s = d as SatState;
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshLambertMaterial({ color: s.color })));
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 1.4), new THREE.MeshLambertMaterial({ color: "#1d3a5c" })));
    meshes.current.set(s.name, grp);
    return grp;
  }, []);

  // Orbits: recomputed every 12 s of real time, not every simulated minute.
  const orbits = useMemo(() => (showSats && showOrbits && orbitEpoch != null
    ? recs.map(({ tle: t, rec }) => ({ name: t.name, color: SAT_COLORS[t.name], pts: orbitTrack(rec, new Date(orbitEpoch)) }))
    : []), [recs, showSats, showOrbits, orbitEpoch]);

  // Visibility: pause rendering and the satellite loop when off-screen or the tab is hidden.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let inView = true;
    const apply = () => setVisible(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; apply(); });
    io.observe(el);
    document.addEventListener("visibilitychange", apply);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", apply); };
  }, []);
  useEffect(() => {
    const g = ref.current;
    if (!g || !ready) return;
    if (visible) g.resumeAnimation(); else g.pauseAnimation();
  }, [visible, ready]);

  const onSatsRef = useRef(onSats);
  useEffect(() => { onSatsRef.current = onSats; }, [onSats]);
  useEffect(() => {
    if (!ready || !visible || !showSats || !recs.length) return;
    let raf = 0, lastPos = 0, lastReport = 0, lastOrbit = Date.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - lastPos < (low ? 100 : 33)) return;
      lastPos = t;
      const g = ref.current;
      if (!g) return;
      const pos = satellitePositions(recs, simNow());
      for (const s of pos) {
        const m = meshes.current.get(s.name);
        if (m) { const c = g.getCoords(s.lat, s.lng, s.alt); m.position.set(c.x, c.y, c.z); }
      }
      if (t - lastReport > 1000) { lastReport = t; onSatsRef.current?.(pos); }
      if (Date.now() - lastOrbit > 12_000) { lastOrbit = Date.now(); setOrbitEpoch(simNow().getTime()); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, visible, showSats, recs, low, simNow]);

  // Fires: one merged mesh (a single draw call), largest radiated power first.
  const cells = useMemo(() => (showFires && live ? (live.windows[win].cells as Cell[]).slice(0, low ? Math.min(maxPoints, 4000) : maxPoints) : []), [live, win, showFires, low, maxPoints]);
  const maxFrp = useMemo(() => Math.max(1, ...cells.slice(0, 50).map((c) => c[3])), [cells]);
  const rings = useMemo(() => (low ? [] : cells.slice(0, 10)), [cells, low]);
  const pointAltitude = useCallback((d: object) => Math.min(0.32, 0.006 + Math.sqrt((d as Cell)[3] / maxFrp) * 0.2), [maxFrp]);
  const pointRadius = useCallback((d: object) => Math.min(0.55, 0.18 + Math.log10(1 + (d as Cell)[2]) * 0.12), []);
  const pointColor = useCallback((d: object) => fireColor((d as Cell)[3], maxFrp), [maxFrp]);
  const ringColor = useCallback(() => (t: number) => `rgba(217,67,26,${1 - t})`, []);
  const pathColor = useCallback((d: object) => [(d as { color: string }).color + "00", (d as { color: string }).color], []);
  const objectLabel = useCallback((d: object) => `<div style="font:12px var(--font-ui,system-ui);background:#121715;color:#f7f3e8;padding:4px 8px;border-radius:8px">${(d as SatState).name} · ${(d as SatState).instrument}</div>`, []);
  const latOf = useCallback((d: object) => (d as Cell)[0], []);
  const lngOf = useCallback((d: object) => (d as Cell)[1], []);
  const pLat = useCallback((p: object) => (p as [number, number, number])[0], []);
  const pLng = useCallback((p: object) => (p as [number, number, number])[1], []);
  const pAlt = useCallback((p: object) => (p as [number, number, number])[2], []);

  // Hover and click on merged points: map the pointer to lat/lng and find the nearest cell.
  const nearest = useCallback((x: number, y: number): Cell | null => {
    const g = ref.current;
    if (!g || !cells.length) return null;
    const ll = g.toGlobeCoords(x, y);
    if (!ll) return null;
    const alt = g.pointOfView().altitude;
    const lim = Math.max(0.6, alt * 1.2); // degrees; looser when zoomed out
    let best: Cell | null = null, bd = lim * lim;
    const k = Math.cos((ll.lat * Math.PI) / 180);
    for (const c of cells) {
      const dl = c[0] - ll.lat;
      if (dl > lim || dl < -lim) continue;
      let dn = Math.abs(c[1] - ll.lng); if (dn > 180) dn = 360 - dn;
      const d2 = dl * dl + dn * k * dn * k;
      if (d2 < bd) { bd = d2; best = c; }
    }
    return best;
  }, [cells]);
  useEffect(() => {
    const el = wrap.current;
    if (!el || !ready || !interactive) return;
    let raf = 0, px = 0, py = 0, cur: Cell | null = null;
    const local = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const move = (e: PointerEvent) => {
      if (e.buttons) return; // dragging: no hover work
      [px, py] = local(e);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; const n = nearest(px, py); if (n !== cur) { cur = n; setHover(n); } });
    };
    const leave = () => { cur = null; setHover(null); };
    let down: [number, number] | null = null;
    const pdown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const up = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; // a drag, not a click
      const [x, y] = local(e); const n = nearest(x, y); if (n) onPick?.(n);
    };
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", pdown, { passive: true });
    el.addEventListener("pointerup", up);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); el.removeEventListener("pointerdown", pdown); el.removeEventListener("pointerup", up); };
  }, [ready, interactive, nearest, onPick]);

  useEffect(() => {
    const g = ref.current;
    if (!g || !ready) return;
    const c = g.controls() as { autoRotate: boolean; autoRotateSpeed: number; enableZoom: boolean };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    c.autoRotate = autoRotate && !low && !reduce;
    c.autoRotateSpeed = 0.45;
    c.enableZoom = allowZoom ?? interactive;
  }, [ready, autoRotate, interactive, allowZoom, low]);

  // Pixel ratio: 1.5 at most (1 in low-power mode). Rendering a retina canvas costs 2-4x the fill rate.
  useEffect(() => {
    const g = ref.current;
    if (!g || !ready) return;
    g.renderer().setPixelRatio(Math.min(low ? 1 : 1.5, window.devicePixelRatio || 1));
  }, [ready, low]);

  const material = useMemo(() => {
    const m = new THREE.MeshPhongMaterial({ color: "#fff6e6", emissive: "#efe4cb", emissiveIntensity: 0.28, shininess: 4 });
    new THREE.TextureLoader().load(LAND_TEXTURE, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      m.map = tex; m.needsUpdate = true;
    });
    return m;
  }, []);
  useEffect(() => () => { material.map?.dispose(); material.dispose(); }, [material]);

  const onReady = useCallback(() => {
    const g = ref.current;
    if (!g) return;
    g.pointOfView({ lat: 12, lng: 18, altitude: 2.3 }, 0);
    const canvas = g.renderer().domElement;
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onLost(); }, { once: true });
    try {
      const gl = g.renderer().getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) setPerfLow("software-gl");
    } catch { /* renderer string hidden: keep current mode */ }
    const t = simNow().getTime();
    setSatEpoch(t); setOrbitEpoch(t);
    setReady(true);
  }, [onLost, simNow]);
  const rendererConfig = useMemo(() => ({ antialias: !low, alpha: true, powerPreference: "high-performance" as const }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      {Globe && width > 0 ? (
        <Globe
          ref={ref}
          width={width}
          height={height}
          rendererConfig={rendererConfig}
          onGlobeReady={onReady}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={material}
          globeCurvatureResolution={low ? 6 : 4}
          showAtmosphere
          atmosphereColor="#f2a56b"
          atmosphereAltitude={0.16}
          enablePointerInteraction={satLabels && showSats && !low}
          pointsData={cells}
          pointLat={latOf}
          pointLng={lngOf}
          pointAltitude={pointAltitude}
          pointRadius={pointRadius}
          pointColor={pointColor}
          pointResolution={low ? 4 : 6}
          pointsMerge
          pointsTransitionDuration={0}
          ringsData={rings}
          ringLat={latOf}
          ringLng={lngOf}
          ringColor={ringColor}
          ringMaxRadius={3.2}
          ringPropagationSpeed={1.6}
          ringRepeatPeriod={1400}
          objectsData={satData}
          objectLat="lat"
          objectLng="lng"
          objectAltitude="alt"
          objectFacesSurfaces={false}
          objectThreeObject={satMesh as (d: object) => THREE.Object3D}
          objectLabel={objectLabel}
          pathsData={orbits}
          pathPoints="pts"
          pathPointLat={pLat}
          pathPointLng={pLng}
          pathPointAlt={pAlt}
          pathColor={pathColor}
          pathStroke={1.4}
          pathDashLength={0.25}
          pathDashGap={0.008}
          pathDashAnimateTime={low ? 0 : 9000}
          pathTransitionDuration={0}
        />
      ) : (
        <GlobePoster height={height} />
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
