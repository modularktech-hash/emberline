/**
 * R9: individual FIRMS hotspots for a search area and dates.
 *
 * A thin proxy to the FIRMS area API
 * (https://firms.modaps.eosdis.nasa.gov/api/area/), so the map key stays on the
 * server: it is read from the FIRMS_MAP_KEY environment variable and never sent
 * to the browser or echoed in a response. Without the variable the route answers
 * 503 with a plain message and the page still offers the aggregated cell CSV.
 *
 * GET /api/hotspots?source=VIIRS_SNPP_SP&bbox=w,s,e,n&start=YYYY-MM-DD&end=YYYY-MM-DD
 * FIRMS accepts 1 to 5 days per request, so the range is split into 5-day
 * chunks (at most MAX_DAYS days, requested one after another to respect the
 * key's transaction limit) and the CSV bodies are joined under one header.
 * Rows stop at MAX_ROWS; the response says when it was cut.
 */
export const maxDuration = 60;

const API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SOURCES = new Set(["MODIS_SP", "MODIS_NRT", "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_NOAA20_SP"]);
const MAX_DAYS = 31;
const MAX_ROWS = 200_000;

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const bad = (message: string, status = 400) => Response.json({ error: "bad_request", message }, { status });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const source = q.get("source") ?? "";
  if (!SOURCES.has(source)) return bad(`source must be one of ${[...SOURCES].join(", ")}`);
  const box = (q.get("bbox") ?? "").split(",").map(Number);
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v))) return bad("bbox must be west,south,east,north in degrees");
  const [w, s, e, n] = box;
  if (Math.abs(s) > 90 || Math.abs(n) > 90 || s >= n || Math.abs(w) > 180 || Math.abs(e) > 180 || w >= e) {
    return bad("bbox must have south < north and west < east (split a box that crosses 180° into two requests)");
  }
  const t0 = Date.parse(`${q.get("start")}T00:00:00Z`), t1 = Date.parse(`${q.get("end")}T00:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return bad("start and end must be dates (YYYY-MM-DD) with start <= end");
  const days = Math.round((t1 - t0) / DAY) + 1;
  if (days > MAX_DAYS) return bad(`at most ${MAX_DAYS} days per download (asked for ${days}); FIRMS serves 5 days per request`);

  const key = (process.env.FIRMS_MAP_KEY ?? "").trim();
  if (!key) {
    return Response.json({
      error: "no_key",
      message: "Individual detections are not available on this deployment: the server has no FIRMS map key configured. The aggregated cell CSV is still available, and FIRMS serves every detection at firms.modaps.eosdis.nasa.gov/download.",
    }, { status: 503 });
  }

  let header = "";
  const lines: string[] = [];
  const chunks: Array<{ start: string; days: number; rows: number }> = [];
  let truncated = false;
  for (let t = t0; t <= t1 && !truncated; t += 5 * DAY) {
    const d = Math.min(5, Math.round((t1 - t) / DAY) + 1);
    const url = `${API}/${key}/${source}/${w},${s},${e},${n}/${d}/${iso(t)}`;
    let body = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
        body = await r.text();
        if (r.ok) break;
      } catch { body = ""; }
    }
    // A header-only CSV is valid (no detections). Anything else that is not a CSV is a failure.
    if (body.trim() !== "" && !body.startsWith("latitude,")) {
      const msg = body.replaceAll(key, "[key]").slice(0, 160).trim();
      return Response.json({ error: "firms_error", message: `FIRMS did not return a CSV for ${iso(t)} (+${d} days): ${msg || "no answer"}`, chunks }, { status: 502 });
    }
    const rows = body.trim() === "" ? [] : body.trim().split("\n");
    if (rows.length) header ||= rows[0];
    const data = rows.slice(1);
    chunks.push({ start: iso(t), days: d, rows: data.length });
    for (const l of data) {
      if (lines.length >= MAX_ROWS) { truncated = true; break; }
      lines.push(l);
    }
  }
  return new Response([header || "latitude,longitude", ...lines].join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "x-emberline-chunks": JSON.stringify(chunks),
      "x-emberline-truncated": truncated ? `yes: stopped at ${MAX_ROWS} rows` : "no",
      "cache-control": "no-store",
    },
  });
}
