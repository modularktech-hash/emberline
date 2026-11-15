"use client";

/** G1: "Download recent hotspots in this area" (live.json cells inside the country or box), plus the FIRMS link. */
import { useState } from "react";
import { getLive } from "@/lib/data";
import { downloadCsv } from "@/lib/ember";
import { areaFilter, type HotspotArea } from "@/lib/hotspots";
import { formatBbox } from "@/lib/aoi";
import { prettyName } from "@/lib/names";

export function HotspotDownload({ area }: { area: HotspotArea }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = area.kind === "country" ? prettyName(area.name) : `box ${formatBbox(area.bbox)}`;

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const [live, keep] = await Promise.all([getLive(), areaFilter(area)]);
      if (!keep) { setMsg(`${label} has no outline in the 110 m country map used here; draw a box around it instead.`); return; }
      const w = live.windows["7d"];
      const rows = w.cells.filter(([lat, lon]) => keep(lat, lon));
      const plats = (w as { platforms?: string[] }).platforms ?? Object.keys(w.totals);
      downloadCsv(
        `emberline_hotspots_7d_${label.replace(/[^a-z0-9]+/gi, "_")}.csv`,
        {
          product: "Emberline recent hotspots (raw NASA FIRMS near-real-time, uncorrected, not harmonized)",
          area: area.kind === "country" ? `${label}: 0.5° cells whose centre lies inside the Natural Earth 110 m outline` : `${label}: 0.5° cells whose centre lies inside the box`,
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
          {busy ? "Preparing…" : "Download recent hotspots (7 days)"}
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
