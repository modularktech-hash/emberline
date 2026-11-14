"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  MapMouseEvent,
  Map as MapLibreMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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

const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const BOX_SOURCE = "aoi-box";

export type Bbox = [number, number, number, number];

interface Props {
  bbox: Bbox | null;
  onSelect: (bbox: Bbox) => void;
  styleUrl?: string;
  className?: string;
}

function bboxToFeature(bbox: Bbox): GeoJSON.Feature<GeoJSON.Polygon> {
  const [west, south, east, north] = bbox;
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

export function AoiMap({ bbox, onSelect, styleUrl, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [failed, setFailed] = useState(false);

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
          style: styleUrl ?? DARK_STYLE,
          center: [20, 10],
          zoom: 0.9,
          attributionControl: { compact: true },
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        // Only a failure before the style loads is fatal. After that, errors
        // are individual tiles timing out, and replacing a working map with an
        // error panel because one tile 404'd would be worse than the gap.
        let loaded = false;
        map.on("error", () => {
          if (!loaded) setFailed(true);
        });
        map.on("load", () => {
          loaded = true;
          map.addSource(BOX_SOURCE, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: `${BOX_SOURCE}-fill`,
            type: "fill",
            source: BOX_SOURCE,
            paint: { "fill-color": "#ff7a1a", "fill-opacity": 0.12 },
          });
          map.addLayer({
            id: `${BOX_SOURCE}-line`,
            type: "line",
            source: BOX_SOURCE,
            paint: { "line-color": "#ff7a1a", "line-width": 2 },
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
  }, [styleUrl]);

  // Reflect the selected bbox back onto the map, including selections made
  // elsewhere (a preset AOI button, a restored URL).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource<GeoJSONSource>(BOX_SOURCE);
    if (!source) return;
    source.setData(
      bbox
        ? { type: "FeatureCollection", features: [bboxToFeature(bbox)] }
        : { type: "FeatureCollection", features: [] },
    );
    if (bbox) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 48, duration: 600, maxZoom: 8 },
      );
    }
  }, [bbox, ready]);

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

  const toggleDraw = useCallback(() => setDrawing((d) => !d), []);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[var(--hairline)] ${className ?? "h-80"}`}>
      <div ref={containerRef} className="absolute inset-0" />

      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)] px-6 text-center text-sm text-[var(--text-secondary)]">
          The basemap could not be loaded. Type coordinates below instead.
        </div>
      ) : (
        <button
          type="button"
          onClick={toggleDraw}
          aria-pressed={drawing}
          className="absolute left-3 top-3 z-10 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-sm"
        >
          {drawing ? "Drag to draw · cancel" : "Draw area"}
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
