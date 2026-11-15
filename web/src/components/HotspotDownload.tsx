"use client";

/** G1: "Download recent hotspots in this area" (live.json cells inside the country or box), plus the FIRMS link. */
import { useState } from "react";
import { getLive } from "@/lib/data";
import { downloadCsv } from "@/lib/ember";
import { areaBoxes, areaFilter, type HotspotArea } from "@/lib/hotspots";
import { formatBbox, geomBbox } from "@/lib/aoi";
import { prettyName } from "@/lib/names";

export function HotspotDownload({ area }: { area: HotspotArea }) {
  return (<><RecentCells area={area} /><PointDownload area={area} /></>);
}

function RecentCells({ area }: { area: HotspotArea }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = area.kind === "country" ? prettyName(area.name) : area.kind === "box" ? `box ${formatBbox(area.bbox)}` : area.geom.kind === "box" ? `box ${formatBbox(area.geom.bbox)}` : `polygon in ${formatBbox(geomBbox(area.geom))}`;

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const [live, keep] = await Promise.all([getLive(), areaFilter(area)]);
      if (!keep) { setMsg(`${label} has no outline in the 110 m country map used here; draw a box around it instead.`); return; }
      const w = live.windows["7d"];
      const rows = w.cells.filter(([lat, lon]) => keep(lat, lon));
      const plats = (w as { platforms?: string[] }).platforms ?? Object.keys(w.totals);
      downloadCsv(
        `emberline_cells_7d_raw_${label.replace(/[^a-z0-9]+/gi, "_")}.csv`,
        {
          product: "Emberline recent hotspots, AGGREGATED to 0.5° cells (not individual detections); RAW NASA FIRMS near-real-time, uncorrected, not harmonized",
          area: area.kind === "country" ? `${label}: 0.5° cells whose centre lies inside the Natural Earth 110 m outline` : `${label}: 0.5° cells whose centre lies inside the area`,
          window: `last 7 days: ${w.dates[0]} to ${w.dates[w.dates.length - 1]} (UTC dates in the feed)`,
          fetched_utc: live.fetched_utc,
          platforms: `${plats.join(" + ")} (NRT; NOAA-20/21 are not the Suomi-NPP platform of the historical record)`,
          cell_deg: String(live.cell_deg),
          frp_sum_mw: "sum of reported FRP (MW) across detections in the cell and window, not instantaneous power or energy",
          cells_in_area: String(rows.length),
          full_point_history: "https://firms.modaps.eosdis.nasa.gov/download/",
        },
        ["lat", "lon", "detections", "frp_sum_mw", "frp_max_mw", "satellites"],
        rows.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5]]),
      );
      setMsg(rows.length ? `Downloaded ${rows.length} cells.` : "No hotspot cells in this area in the last 7 days; the file has the header only.");
    } catch (e) {
      setMsg(`Could not build the file: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="card mt-6 p-5 sm:p-6" data-testid="hotspot-download">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display text-xl">Recent hotspots in this area</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Raw near-real-time detections from the last 7 days (NOAA-20, NOAA-21 and MODIS), gridded to 0.5° cells: centre, count, summed and peak FRP, satellites.
            Provisional and uncorrected; not on the harmonized scale.
          </p>
        </div>
        <button type="button" onClick={run} disabled={busy} className="pill-dark min-h-[40px] px-4 text-sm font-medium disabled:opacity-40">
          {busy ? "Preparing…" : "Download 7-day cells CSV (raw)"}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-[var(--text-secondary)]" role="status">{msg}</p>}
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
        Need every individual detection, for any period? NASA FIRMS serves the full point-level archive (MODIS from 2000, VIIRS from 2012) at{" "}
        <a className="link-ul" href="https://firms.modaps.eosdis.nasa.gov/download/" target="_blank" rel="noreferrer">firms.modaps.eosdis.nasa.gov/download</a>.
      </p>
    </div>
  );
}

const POINT_SOURCES = [
  { v: "VIIRS_SNPP_SP", label: "VIIRS Suomi-NPP, archive (2012 to a few months ago)", group: "archive" },
  { v: "MODIS_SP", label: "MODIS Terra + Aqua, archive (2000 to a few months ago)", group: "archive" },
  { v: "VIIRS_NOAA20_NRT", label: "VIIRS NOAA-20, near-real-time (last ~2 months)", group: "nrt" },
  { v: "VIIRS_NOAA21_NRT", label: "VIIRS NOAA-21, near-real-time (last ~2 months)", group: "nrt" },
  { v: "MODIS_NRT", label: "MODIS Terra + Aqua, near-real-time (last ~2 months)", group: "nrt" },
] as const;
const MAX_POINT_DAYS = 31;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * R9: every individual detection for the area and dates, through the
 * /api/hotspots proxy (the FIRMS key stays on the server). Points are filtered
 * to the area here (country outline, box or polygon). Raw FIRMS records as
 * served, uncorrected and not harmonized.
 */
function PointDownload({ area }: { area: HotspotArea }) {
  const [today] = useState(() => { const n = Date.now(); return n - (n % 86_400_000); });
  const [source, setSource] = useState<string>("VIIRS_NOAA20_NRT");
  const [start, setStart] = useState(isoDay(today - 7 * 86_400_000));
  const [end, setEnd] = useState(isoDay(today - 86_400_000));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = area.kind === "country" ? prettyName(area.name) : area.kind === "box" ? `box ${formatBbox(area.bbox)}` : area.geom.kind === "box" ? `box ${formatBbox(area.geom.bbox)}` : `polygon in ${formatBbox(geomBbox(area.geom))}`;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  const invalid = !Number.isFinite(days) || days < 1 ? "The end date must be on or after the start date." : days > MAX_POINT_DAYS ? `At most ${MAX_POINT_DAYS} days per download (this range is ${days}).` : null;

  const run = async () => {
    if (invalid) { setMsg(invalid); return; }
    setBusy(true); setMsg(null);
    try {
      const [boxes, keep] = await Promise.all([areaBoxes(area), areaFilter(area)]);
      if (!boxes || !keep) { setMsg(`${label} has no outline in the 110 m country map used here; draw a box or polygon around it instead.`); return; }
      let header: string[] | null = null;
      const rows: string[][] = [];
      const chunks: string[] = [];
      let truncated = "no";
      for (const b of boxes) {
        const r = await fetch(`/api/hotspots?source=${source}&bbox=${b.map((v) => v.toFixed(4)).join(",")}&start=${start}&end=${end}`, { signal: AbortSignal.timeout(75_000) });
        if (!r.ok) {
          const j = await r.json().catch(() => ({ message: `HTTP ${r.status}` }));
          setMsg(`${j.message ?? `HTTP ${r.status}`} The cell-level CSVs on this page are still available.`);
          return;
        }
        const text = await r.text();
        const [h, ...ls] = text.trim().split("\n");
        const cols = h.split(",");
        header ??= cols;
        const la = cols.indexOf("latitude"), lo = cols.indexOf("longitude");
        for (const l of ls) { const v = l.split(","); if (keep(Number(v[la]), Number(v[lo]))) rows.push(v); }
        chunks.push(r.headers.get("x-emberline-chunks") ?? "");
        if (r.headers.get("x-emberline-truncated")?.startsWith("yes")) truncated = r.headers.get("x-emberline-truncated")!;
      }
      const src = POINT_SOURCES.find((p) => p.v === source)!;
      downloadCsv(
        `emberline_points_${source}_raw_${label.replace(/[^a-z0-9]+/gi, "_")}_${start}_${end}.csv`,
        {
          product: "Emberline hotspot search: INDIVIDUAL DETECTIONS (points), RAW NASA FIRMS records as served, uncorrected, not harmonized",
          area: area.kind === "country" ? `${label}: detections inside the Natural Earth 110 m outline` : `${label}: detections inside the area`,
          dates_utc: `${start} to ${end} inclusive (${days} days, FIRMS acquisition dates)`,
          source: `FIRMS area API ${source}: ${src.label}`,
          ...(src.group === "nrt" ? { platform_note: "near-real-time; NOAA-20/21 are not the Suomi-NPP platform of the historical record; no fire-type column, so non-vegetation sources may be included" } : {}),
          filters: "none applied here (all confidence levels, day and night, every fire type FIRMS serves); the calendars use daytime, nominal+ confidence vegetation fires",
          requests: chunks.join(" "),
          truncated,
          retrieved_utc: new Date().toISOString(),
        },
        header ?? ["latitude", "longitude"],
        rows,
      );
      setMsg(rows.length ? `Downloaded ${rows.length.toLocaleString("en")} detections.` : "No detections in this area and period; the file has the header only (a valid empty result).");
    } catch (e) {
      setMsg(`${(e as Error).name === "TimeoutError" ? "NASA FIRMS did not answer in time; try a shorter date range or again in a minute" : `Could not build the file: ${(e as Error).message}`}. The cell-level CSVs on this page are still available.`);
    } finally { setBusy(false); }
  };

  return (
    <div className="card mt-4 p-5 sm:p-6" data-testid="point-download">
      <h2 className="display text-xl">Individual hotspots for any dates</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
        Every detection FIRMS holds for {label}, up to {MAX_POINT_DAYS} days per file, as served: points, raw, uncorrected, not harmonized. Fetched through this site&apos;s server, which holds the FIRMS key.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex min-w-0 max-w-full flex-col text-xs text-[var(--text-muted)]">Source
          <select value={source} onChange={(e) => setSource(e.target.value)} className="field mt-1 min-h-[36px] w-full max-w-full rounded-xl px-2 py-1 text-sm text-[var(--text-primary)]">
            {POINT_SOURCES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs text-[var(--text-muted)]">Start (UTC)
          <input type="date" value={start} min="2000-11-01" max={isoDay(today)} onChange={(e) => setStart(e.target.value)} className="field mt-1 min-h-[36px] rounded-xl px-2 py-1 text-sm text-[var(--text-primary)]" />
        </label>
        <label className="flex flex-col text-xs text-[var(--text-muted)]">End (UTC)
          <input type="date" value={end} min="2000-11-01" max={isoDay(today)} onChange={(e) => setEnd(e.target.value)} className="field mt-1 min-h-[36px] rounded-xl px-2 py-1 text-sm text-[var(--text-primary)]" />
        </label>
        <button type="button" onClick={run} disabled={busy || !!invalid} className="pill-dark min-h-[40px] px-4 text-sm font-medium disabled:opacity-40">
          {busy ? "Fetching…" : "Download points CSV (raw)"}
        </button>
      </div>
      {invalid && <p className="mt-2 text-xs text-[var(--ember)]" role="alert">{invalid}</p>}
      {msg && <p className="mt-2 text-sm text-[var(--text-secondary)]" role="status">{msg}</p>}
    </div>
  );
}
