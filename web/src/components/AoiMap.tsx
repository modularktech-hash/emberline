"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { bboxToFeature, cellsToFeatureCollection, type Bbox } from "@/lib/aoi";
import type { Theme } from "@/lib/colorScale";
import { readTheme } from "@/lib/theme";

/**
 * Area picker map: processed H3 res-2 cells as a faint coverage layer, the
 * cells of the current selection highlighted, and a "Draw box" mode.
 *
 * MapLibre (not Mapbox): no token, no account. Basemap: OpenFreeMap, keyless.
 * The style JSON is fetched first with a timeout; if the host is unreachable
 * the map falls back to a plain background with a graticule, and the
 * coverage / selection layers still draw, so selection keeps working.
 *
 * Drawing uses a transparent overlay with pointer events (mouse, pen and
 * touch alike) rather than map events, so the map's own pan/zoom handlers
 * are untouched while not drawing.
 */

const BASEMAP: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const STYLE_TIMEOUT_MS = 5000;

const COLORS: Record<Theme, { bg: string; grid: string; accent: string; box: string; unprocessed: string }> = {
  light: { bg: "#eef0f2", grid: "#d5d8dc", accent: "#2a78d6", box: "#0b0b0b", unprocessed: "#8a8984" },
  dark: { bg: "#16181b", grid: "#2b2e33", accent: "#6da7ec", box: "#ffffff", unprocessed: "#898781" },
};

function plainStyle(theme: Theme): StyleSpecification {
  const lines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let lng = -180; lng <= 180; lng += 30) {
    lines.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[lng, -85], [lng, 85]] },
    });
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    lines.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[-180, lat], [180, lat]] },
    });
  }
  return {
    version: 8,
    sources: { graticule: { type: "geojson", data: { type: "FeatureCollection", features: lines } } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": COLORS[theme].bg } },
      { id: "graticule", type: "line", source: "graticule", paint: { "line-color": COLORS[theme].grid, "line-width": 1 } },
    ],
  };
}

async function loadBasemap(theme: Theme): Promise<StyleSpecification | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STYLE_TIMEOUT_MS);
  try {
    const response = await fetch(BASEMAP[theme], { signal: controller.signal });
    if (!response.ok) return null;
    const style = (await response.json()) as StyleSpecification;
    return style && style.version === 8 ? style : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  theme: Theme;
  /** Processed H3 res-2 parents (have a calendar). Null while loading. */
  coverage: string[] | null;
  /** Processed cells in the current selection. */
  selected: string[];
  /** Cells the box covers that are not processed. */
  unprocessed: string[];
  bbox: Bbox | null;
  onDraw: (bbox: Bbox) => void;
}

export function AoiMap({ theme, coverage, selected, unprocessed, bbox, onDraw }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<"loading" | "ok" | "unavailable">("loading");
  const [drawing, setDrawing] = useState(false);
  const [failed, setFailed] = useState(false);
  const dragRef = useRef<{ x: number; y: number; id: number } | null>(null);
  /** The last box this map drew itself; a box from the inputs is fitted, a drawn one is not. */
  const drawnRef = useRef<string | null>(null);
  /** The last box the map was fitted to. */
  const fittedRef = useRef<string | null>(null);
  const bboxRef = useRef(bbox);
  useEffect(() => {
    bboxRef.current = bbox;
  }, [bbox]);

  // Create the map (again on a theme change, so the basemap matches).
  useEffect(() => {
    if (!containerRef.current) return;
    // Hydration renders with the server's "light" snapshot before the real
    // theme is read; skip that pass so a dark page builds its map only once.
    if (theme !== readTheme()) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;

    (async () => {
      try {
        const [maplibregl, remote] = await Promise.all([import("maplibre-gl"), loadBasemap(theme)]);
        if (cancelled || !containerRef.current) return;
        // MapLibre 6 looks for its worker next to its own module file, which
        // bundling moves; scripts/copy-maplibre-worker.mjs serves it here.
        maplibregl.setWorkerUrl(`/vendor/maplibre-gl-${maplibregl.getVersion()}/maplibre-gl-worker.mjs`);
        setBasemap(remote ? "ok" : "unavailable");
        map = new maplibregl.Map({
          container: containerRef.current,
          style: remote ?? plainStyle(theme),
          center: [10, 5],
          zoom: 0.3,
          renderWorldCopies: false,
          cooperativeGestures: true,
          // The OpenFreeMap style carries its own source attribution; adding
          // it again here printed it twice. Compact (an "i" button) only on
          // narrow maps, where the full line would cover the cells.
          attributionControl: { customAttribution: "Cells: H3" },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        // Tile and style errors are reported here instead of thrown; a missing
        // tile leaves a gap, it must not take the page down.
        map.on("error", () => {});
        map.on("load", () => {
          if (!map || cancelled) return;
          const c = COLORS[theme];
          map.addSource("coverage", { type: "geojson", data: EMPTY });
          map.addSource("unprocessed", { type: "geojson", data: EMPTY });
          map.addSource("selected", { type: "geojson", data: EMPTY });
          map.addSource("box", { type: "geojson", data: EMPTY });
          map.addLayer({ id: "coverage-fill", type: "fill", source: "coverage", paint: { "fill-color": c.accent, "fill-opacity": 0.1 } });
          map.addLayer({ id: "coverage-line", type: "line", source: "coverage", paint: { "line-color": c.accent, "line-opacity": 0.45, "line-width": 0.6 } });
          map.addLayer({ id: "unprocessed-line", type: "line", source: "unprocessed", paint: { "line-color": c.unprocessed, "line-width": 1, "line-dasharray": [2, 2] } });
          map.addLayer({ id: "selected-fill", type: "fill", source: "selected", paint: { "fill-color": c.accent, "fill-opacity": 0.4 } });
          map.addLayer({ id: "selected-line", type: "line", source: "selected", paint: { "line-color": c.accent, "line-width": 1.5 } });
          map.addLayer({ id: "box-line", type: "line", source: "box", paint: { "line-color": c.box, "line-width": 2, "line-dasharray": [3, 2] } });
          // MapLibre opens a compact attribution on load; start it folded.
          containerRef.current
            ?.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")
            ?.classList.remove("maplibregl-compact-show");
          setReady(true);
        });
        mapRef.current = map;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      fittedRef.current = null;
      setReady(false);
      map?.remove();
      mapRef.current = null;
    };
  }, [theme]);

  const coverageData = useMemo(() => (coverage ? cellsToFeatureCollection(coverage) : null), [coverage]);
  const selectedData = useMemo(() => cellsToFeatureCollection(selected), [selected]);
  const unprocessedData = useMemo(() => cellsToFeatureCollection(unprocessed.slice(0, 3000)), [unprocessed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !coverageData) return;
    map.getSource<GeoJSONSource>("coverage")?.setData(coverageData);
    // Open on everything that has data, unless a box is already selected.
    if (!bboxRef.current && coverageData.features.length > 0) {
      let w = 180, s = 90, e = -180, n = -90;
      for (const f of coverageData.features) {
        for (const [lng, lat] of f.geometry.coordinates[0]) {
          w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
        }
      }
      // Web Mercator stretches the poles; cap at 75°N / 60°S so the
      // populated cells (Arctic Canada and Siberia included) fill the view.
      map.resize();
      map.fitBounds([[w, Math.max(s, -60)], [Math.min(e, 180), Math.min(n, 75)]], { padding: 16, duration: 0 });
    }
  }, [ready, coverageData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getSource<GeoJSONSource>("selected")?.setData(selectedData);
    map.getSource<GeoJSONSource>("unprocessed")?.setData(unprocessedData);
  }, [ready, selectedData, unprocessedData]);

  // Fit a typed box together with the cells it resolves to, so the whole
  // selection is in view. A box drawn here is left where the user drew it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getSource<GeoJSONSource>("box")?.setData(bbox ? bboxToFeature(bbox) : EMPTY);
    const key = bbox ? bbox.join(",") : null;
    if (!bbox || !key || fittedRef.current === key || drawnRef.current === key) return;
    fittedRef.current = key;
    let [w, s, e, n] = bbox;
    for (const f of selectedData.features) {
      for (const [lng, lat] of f.geometry.coordinates[0]) {
        w = Math.min(w, lng);
        e = Math.max(e, lng);
        s = Math.min(s, lat);
        n = Math.max(n, lat);
      }
    }
    map.fitBounds(
      [
        [Math.max(w, -180), s],
        [Math.min(e, 180), n],
      ],
      { padding: 32, duration: 500, maxZoom: 6 },
    );
  }, [ready, bbox, selectedData]);

  /* Box drawing ------------------------------------------------------ */

  const toBbox = (a: { x: number; y: number }, b: { x: number; y: number }): Bbox | null => {
    const map = mapRef.current;
    if (!map) return null;
    const p = map.unproject([a.x, a.y]);
    const q = map.unproject([b.x, b.y]);
    const clampLat = (v: number) => Math.max(-85, Math.min(85, v));
    const clampLng = (v: number) => Math.max(-180, Math.min(180, v));
    const round = (v: number) => Math.round(v * 100) / 100;
    return [
      round(clampLng(Math.min(p.lng, q.lng))),
      round(clampLat(Math.min(p.lat, q.lat))),
      round(clampLng(Math.max(p.lng, q.lng))),
      round(clampLat(Math.max(p.lat, q.lat))),
    ];
  };

  const local = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { ...local(e), id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start || start.id !== e.pointerId) return;
    const box = toBbox(start, local(e));
    if (box) mapRef.current?.getSource<GeoJSONSource>("box")?.setData(bboxToFeature(box));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start || start.id !== e.pointerId) return;
    dragRef.current = null;
    const end = local(e);
    setDrawing(false);
    // A tap or a tiny drag is not a box; restore whatever was drawn before.
    if (Math.abs(end.x - start.x) < 6 || Math.abs(end.y - start.y) < 6) {
      mapRef.current?.getSource<GeoJSONSource>("box")?.setData(bbox ? bboxToFeature(bbox) : EMPTY);
      return;
    }
    const box = toBbox(start, end);
    if (box && box[0] < box[2] && box[1] < box[3]) {
      drawnRef.current = box.join(",");
      onDraw(box);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="relative h-72 overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] sm:h-96">
        {/* Sized with h-full/w-full, not absolute: MapLibre sets position: relative on its container. */}
        <div ref={containerRef} className="h-full w-full" data-testid="aoi-map" />

        {drawing ? (
          <div
            data-testid="draw-overlay"
            className="absolute inset-0 z-[5] cursor-crosshair"
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
          />
        ) : null}

        {failed ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-[var(--text-secondary)]">
            The map could not start in this browser. Type the box bounds below instead.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDrawing((d) => !d)}
            aria-pressed={drawing}
            disabled={!ready}
            className={`absolute left-2 top-2 z-10 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm disabled:opacity-50 ${
              drawing
                ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-1)]"
                : "border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--text-primary)]"
            }`}
          >
            {drawing ? "Drag on the map · Cancel" : "Draw box"}
          </button>
        )}
        {basemap === "unavailable" && !failed ? (
          <p className="absolute bottom-2 left-2 z-10 max-w-[60%] rounded bg-[var(--surface-1)]/90 px-2 py-1 text-[11px] text-[var(--text-secondary)]">
            Basemap unavailable — processed cells on a plain grid (30°).
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border" style={{ borderColor: COLORS[theme].accent, background: `${COLORS[theme].accent}1f` }} />
          Processed (has data)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: `${COLORS[theme].accent}88`, border: `1.5px solid ${COLORS[theme].accent}` }} />
          Selected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-dashed" style={{ borderColor: COLORS[theme].unprocessed }} />
          In box, not processed
        </span>
      </div>
    </div>
  );
}
