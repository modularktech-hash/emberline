"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  MapMouseEvent,
  Map as MapLibreMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cellToBoundary } from "h3-js";

/**
 * Area-of-interest picker.
 *
 * MapLibre with CARTO's open basemaps rather than Mapbox: no access token, no
 * account, no billing state that can expire between building this and demoing
 * it. The basemap URL is overridable so an offline or self-hosted style can be
 * swapped in without touching the component.
 *
 * maplibre-gl is imported inside the effect because it touches `window` at
 * module scope, which would break the server render of this route.
 */

const DARK_STYLE = "https://tiles.openfreemap.org/styles/positron";
/** NASA GIBS true colour (NOAA-20 VIIRS corrected reflectance), WMTS z/y/x, max zoom 9. Optional layer, off by default. */
const GIBS_SOURCE = "gibs-truecolor";
const gibsDate = () => new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
const gibsTiles = (date: string) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;

const BOX_SOURCE = "aoi-box";
const CELL_SOURCE = "aoi-cells";
/**
 * Fallback when the tile server does not answer: country outlines from this
 * site's own /geo/countries.geojson, no external requests, so drawing an area
 * still works offline or behind a blocking network.
 */
const OUTLINE_STYLE = {
  version: 8 as const,
  sources: { countries: { type: "geojson" as const, data: "/geo/countries.geojson" } },
  layers: [
    { id: "bg", type: "background" as const, paint: { "background-color": "#eef2f3" } },
    { id: "land", type: "fill" as const, source: "countries", paint: { "fill-color": "#f7f5ef" } },
    { id: "borders", type: "line" as const, source: "countries", paint: { "line-color": "#9a9a92", "line-width": 0.6 } },
  ],
};

/** A basemap that has not loaded by then is treated as failed (with a retry). */
const LOAD_TIMEOUT_MS = 15000;

export type Bbox = [number, number, number, number];

interface Props {
  bbox: Bbox | null;
  /** A drawn polygon ([lon, lat] corners, open ring), shown instead of the box. */
  ring?: Array<[number, number]> | null;
  onPolygon?: (ring: Array<[number, number]>) => void;
  /** H3 cells actually summed for the box (effective coverage), drawn as outlines. */
  cells?: string[];
  onSelect: (bbox: Bbox) => void;
  styleUrl?: string;
  className?: string;
}

function bboxToFeature(bbox: Bbox): GeoJSON.Feature<GeoJSON.Polygon> {
  const [west, south, eastIn, north] = bbox;
  // A box that crosses the antimeridian (west > east, see lib/aoi.ts) is drawn
  // with its east edge past 180 so it spans the Pacific, not the other 340°.
  const east = eastIn < west ? eastIn + 360 : eastIn;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

function cellsToFeatures(cells: string[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => {
      const ring = cellToBoundary(c, true) as Array<[number, number]>;
      // Cells crossing the antimeridian: shift negative longitudes so the ring does not wrap the globe.
      const crosses = Math.max(...ring.map((p) => p[0])) - Math.min(...ring.map((p) => p[0])) > 180;
      const fixed = crosses ? ring.map(([x, y]) => [x < 0 ? x + 360 : x, y] as [number, number]) : ring;
      return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...fixed, fixed[0]]] } };
    }),
  };
}

function ringFeature(ring: Array<[number, number]>, closed: boolean): GeoJSON.Feature {
  return closed && ring.length >= 3
    ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } }
    : { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } };
}

export function AoiMap({ bbox, ring, onPolygon, cells, onSelect, styleUrl, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [poly, setPoly] = useState(false);
  const [corners, setCorners] = useState(0);
  const onPolygonRef = useRef(onPolygon);
  useEffect(() => { onPolygonRef.current = onPolygon; }, [onPolygon]);
  const [failed, setFailed] = useState(false);
  // After the tile basemap fails once, the outline map is used (and drawing keeps working).
  const [outline, setOutline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [satView, setSatView] = useState(false);
  const [satDate, setSatDate] = useState<string | null>(null);

  // Keep the latest callback without re-initializing the map on every render.
  // Assigned in an effect, not during render: a render can be discarded, and a
  // discarded render must not leave a stale callback behind.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: outline ? OUTLINE_STYLE : styleUrl ?? DARK_STYLE,
          center: [20, 10],
          zoom: 0.9,
          attributionControl: { compact: true },
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        // Only a failure before the style loads is fatal. After that, errors
        // are individual tiles timing out, and replacing a working map with an
        // error panel because one tile 404'd would be worse than the gap.
        let loaded = false;
        const fail = () => {
          if (loaded || cancelled) return;
          if (!outline) { cancelled = true; setReady(false); setOutline(true); return; }
          setFailed(true);
        };
        const slow = window.setTimeout(fail, LOAD_TIMEOUT_MS);
        map.on("error", () => {
          if (!loaded) fail();
        });
        map.on("load", () => {
          loaded = true;
          clearTimeout(slow);
          map.addSource(CELL_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({ id: `${CELL_SOURCE}-fill`, type: "fill", source: CELL_SOURCE, paint: { "fill-color": "#3f7f96", "fill-opacity": 0.1 } });
          map.addLayer({ id: `${CELL_SOURCE}-line`, type: "line", source: CELL_SOURCE, paint: { "line-color": "#3f7f96", "line-width": 1.2, "line-dasharray": [2, 2] } });
          map.addSource(BOX_SOURCE, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: `${BOX_SOURCE}-fill`,
            type: "fill",
            source: BOX_SOURCE,
            paint: { "fill-color": "#d9431a", "fill-opacity": 0.12 },
          });
          map.addLayer({
            id: `${BOX_SOURCE}-line`,
            type: "line",
            source: BOX_SOURCE,
            paint: { "line-color": "#d9431a", "line-width": 2 },
          });
          if (!cancelled) setReady(true);
        });

        mapRef.current = map;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [styleUrl, attempt, outline]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getSource<GeoJSONSource>(CELL_SOURCE)?.setData(cellsToFeatures(cells ?? []));
  }, [cells, ready]);

  // Reflect the selected bbox back onto the map, including selections made
  // elsewhere (a preset AOI button, a restored URL).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource<GeoJSONSource>(BOX_SOURCE);
    if (!source) return;
    source.setData(
      ring && ring.length >= 3
        ? { type: "FeatureCollection", features: [ringFeature(ring, true)] }
        : bbox
        ? { type: "FeatureCollection", features: [bboxToFeature(bbox)] }
        : { type: "FeatureCollection", features: [] },
    );
    if (ring && ring.length >= 3) {
      const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
      map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 48, duration: 600, maxZoom: 8 });
    } else if (bbox) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2] < bbox[0] ? bbox[2] + 360 : bbox[2], bbox[3]],
        ],
        { padding: 48, duration: 600, maxZoom: 8 },
      );
    }
  }, [bbox, ring, ready]);

  // Polygon drawing: click to add corners, double-click or Enter to finish,
  // Backspace removes the last corner, Escape cancels.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !poly) return;
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = "crosshair";
    const pts: Array<[number, number]> = [];
    const show = (extra?: [number, number]) => {
      const r = extra ? [...pts, extra] : pts;
      map.getSource<GeoJSONSource>(BOX_SOURCE)?.setData({ type: "FeatureCollection", features: r.length >= 2 ? [ringFeature(r, r.length >= 3)] : [] });
    };
    const finish = () => {
      setPoly(false);
      if (pts.length >= 3) onPolygonRef.current?.(pts.slice());
    };
    const onClick = (e: MapMouseEvent) => { pts.push([e.lngLat.lng, e.lngLat.lat]); setCorners(pts.length); show(); };
    const onMove = (e: MapMouseEvent) => { if (pts.length) show([e.lngLat.lng, e.lngLat.lat]); };
    const onDbl = (e: MapMouseEvent) => { e.preventDefault(); finish(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); finish(); }
      else if (e.key === "Escape") { setPoly(false); }
      else if (e.key === "Backspace" && pts.length) { e.preventDefault(); pts.pop(); setCorners(pts.length); show(); }
    };
    map.on("click", onClick);
    map.on("mousemove", onMove);
    map.on("dblclick", onDbl);
    window.addEventListener("keydown", onKey);
    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
      map.off("dblclick", onDbl);
      window.removeEventListener("keydown", onKey);
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
      setCorners(0);
    };
  }, [poly, ready]);

  // Drag to draw. Pan is disabled only while drawing, so the map still behaves
  // normally the rest of the time.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !drawing) return;

    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";

    let start: [number, number] | null = null;

    const onDown = (event: MapMouseEvent) => {
      start = [event.lngLat.lng, event.lngLat.lat];
    };
    const onMove = (event: MapMouseEvent) => {
      if (!start) return;
      map.getSource<GeoJSONSource>(BOX_SOURCE)?.setData({
        type: "FeatureCollection",
        features: [bboxToFeature(normalize(start, [event.lngLat.lng, event.lngLat.lat]))],
      });
    };
    const onUp = (event: MapMouseEvent) => {
      if (!start) return;
      const next = normalize(start, [event.lngLat.lng, event.lngLat.lat]);
      start = null;
      setDrawing(false);
      // A stray click is a zero-area box, not a selection.
      if (next[2] - next[0] > 0.01 && next[3] - next[1] > 0.01) {
        onSelectRef.current(next);
      }
    };

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);

    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };
  }, [drawing, ready]);

  const toggleDraw = useCallback(() => { setPoly(false); setDrawing((d) => !d); }, []);
  const togglePoly = useCallback(() => { setDrawing(false); setPoly((d) => !d); }, []);

  // Satellite view: the GIBS raster is added on first use (no tile requests until then) and kept under the area layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (satView && !map.getSource(GIBS_SOURCE)) {
      const date = gibsDate();
      map.addSource(GIBS_SOURCE, { type: "raster", tiles: [gibsTiles(date)], tileSize: 256, maxzoom: 9, attribution: `Imagery: NASA GIBS / EOSDIS (NOAA-20 VIIRS true colour, ${date})` });
      map.addLayer({ id: GIBS_SOURCE, type: "raster", source: GIBS_SOURCE }, `${CELL_SOURCE}-fill`);
      setSatDate(date);
    }
    if (map.getLayer(GIBS_SOURCE)) map.setLayoutProperty(GIBS_SOURCE, "visibility", satView ? "visible" : "none");
  }, [satView, ready]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[var(--hairline)] ${className ?? "h-80"}`}>
      <div ref={containerRef} className="absolute inset-0" />

      {!ready && !failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-2)] text-sm text-[var(--text-secondary)]" role="status">Loading the map…</div>
      )}
      {failed ? (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--surface-1)] px-6 text-center text-sm text-[var(--text-secondary)]">
          <p>The basemap could not be loaded (the map tile server did not answer).</p>
          <p>The calendar still works: type bounds in degrees in <span className="text-[var(--text-primary)]">Choose your own area</span>.</p>
          <button type="button" onClick={() => { setFailed(false); setReady(false); setAttempt((a) => a + 1); }} className="glass-thin px-3.5 py-1.5 text-sm font-medium text-[var(--text-primary)]">Retry the map</button>
        </div>
      ) : (
        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
          <button type="button" onClick={toggleDraw} aria-pressed={drawing} data-testid="draw-box"
            className="glass-thin px-3.5 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-sm">
            {drawing ? "Drag to draw · cancel" : "Draw box"}
          </button>
          {onPolygon && (
            <button type="button" onClick={togglePoly} aria-pressed={poly} data-testid="draw-polygon"
              className="glass-thin px-3.5 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-sm">
              {poly ? `Click corners (${corners}) · double-click or Enter to finish · Esc cancels` : "Draw polygon"}
            </button>
          )}
        </div>
      )}
      {ready && !failed && (
        <button type="button" onClick={() => setSatView((v) => !v)} aria-pressed={satView}
          title={satDate ? `NASA GIBS, NOAA-20 VIIRS true colour, ${satDate}` : "NASA GIBS true-colour imagery"}
          className="absolute bottom-3 left-3 z-10 glass-thin px-3 py-1 text-xs font-medium text-[var(--text-primary)] shadow-sm">
          {satView ? `Satellite view · ${satDate ?? ""}` : "Satellite view (NASA GIBS)"}
        </button>
      )}
    </div>
  );
}

function normalize(a: [number, number], b: [number, number]): Bbox {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
  ];
}
