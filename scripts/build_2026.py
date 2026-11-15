#!/usr/bin/env python3
"""2026 on the harmonized scale: January to the latest complete day, for the countries
whose NOAA-20 bridge passed its held-out test (web/public/data/bridge.json).

Same chain as the bridge's current month (scripts/build_bridge.py):
    harmonized = r_c x kappa_c x sum_i P_c(FRP_i) over NOAA-20 detections i,
with the published logistic P_c and kappa_c (params_global.json) and the bridge ratio r_c.
Same input filters: daytime, confidence nominal or high, FRP > 0, all fire types, points
inside the Natural Earth 110 m outline.

Source: NOAA-20 VIIRS from the FIRMS area API, through the site's /api/hotspots proxy
(the key stays on the server). Standard processing (VIIRS_NOAA20_SP) where it exists,
near-real-time (VIIRS_NOAA20_NRT) for days standard processing does not cover yet; a day
is taken whole from one of them. A month is "complete" only when every request for it
succeeded and none was cut short.

Usage: python3 scripts/build_2026.py [--base https://emberline-ten.vercel.app] [--end YYYY-MM-DD]
Output: web/public/data/calendar_2026.json (responses cached in data/cache_2026/).
"""
from __future__ import annotations

import argparse
import calendar
import io
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import polars as pl
import shapely
from shapely.geometry import shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_month_to_date as mtd  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
OUT = DATA / "calendar_2026.json"
CACHE = ROOT / "data" / "cache_2026"
FIRST = ["Canada", "Australia", "Brazil", "United_States"]
CHUNK = 10


def fetch(base: str, source: str, box, d0: date, d1: date) -> str | None:
    w, s, e, n = (round(v, 3) for v in box)
    tag = CACHE / f"{source}_{w}_{s}_{e}_{n}_{d0}_{d1}.csv"
    if tag.exists():
        return tag.read_text()
    url = f"{base}/api/hotspots?source={source}&bbox={w},{s},{e},{n}&start={d0}&end={d1}"
    for attempt in range(8):
        r = subprocess.run(["curl", "-sS", "-D", "-", "-m", "280", url], capture_output=True, text=True)
        out = r.stdout
        head, _, body = out.partition("\n\n")
        while body.startswith("HTTP/"):
            head, _, body = body.partition("\n\n")
        if r.returncode == 0 and " 200" in head.split("\n")[0] and body.startswith("latitude,"):
            if "x-emberline-truncated: yes" in head.lower():
                return "TRUNCATED"
            CACHE.mkdir(parents=True, exist_ok=True)
            tag.write_text(body)
            return body
        time.sleep(min(60, 5 + attempt * 8))
    return None


def get(base, source, box, d0, d1) -> pl.DataFrame | None:
    body = fetch(base, source, box, d0, d1)
    if body == "TRUNCATED":
        if d0 == d1:
            return None
        mid = d0 + (d1 - d0) // 2
        a, b = get(base, source, box, d0, mid), get(base, source, box, mid + timedelta(days=1), d1)
        return None if a is None or b is None else pl.concat([a, b], how="diagonal_relaxed")
    if body is None:
        return None
    df = pl.read_csv(io.StringIO(body), infer_schema_length=0)
    return df if not df.is_empty() else pl.DataFrame({"acq_date": []}, schema={"acq_date": pl.Utf8})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://emberline-ten.vercel.app")
    ap.add_argument("--end", default=None)
    ap.add_argument("--only", default=None, help="comma-separated countries")
    a = ap.parse_args()
    end = date.fromisoformat(a.end) if a.end else datetime.now(timezone.utc).date() - timedelta(days=1)
    start = date(2026, 1, 1)
    bridge = json.loads((DATA / "bridge.json").read_text())
    params = json.loads((DATA / "params_global.json").read_text())
    geo = {f["properties"]["NAME"]: shape(f["geometry"]) for f in json.loads(mtd.GEO.read_text())["features"]}
    passing = [c for c, v in bridge["countries"].items() if v.get("pass")]
    order = [c for c in FIRST if c in passing] + sorted(c for c in passing if c not in FIRST)
    if a.only:
        order = [c for c in a.only.split(",") if c in passing]
    store = json.loads(OUT.read_text()) if OUT.exists() else {}
    countries = store.get("countries", {}) if store.get("window_utc", [None, None])[1] == end.isoformat() else {}

    chunks = []
    d = start
    while d <= end:
        e = min(end, d + timedelta(days=CHUNK - 1))
        chunks.append((d, e))
        d = e + timedelta(days=1)

    def one(c: str):
        g = geo.get(mtd.ne_name(c))
        if g is None:
            return c, None
        shapely.prepare(g)
        lg, kappa, r = params["countries"][c]["logistic"], params["countries"][c]["kappa"], bridge["countries"][c]["ratio"]
        frames, bad_months = [], set()
        for box in mtd.boxes(g):
            for d0, d1 in chunks:
                sp = get(a.base, "VIIRS_NOAA20_SP", box, d0, d1)
                nrt = get(a.base, "VIIRS_NOAA20_NRT", box, d0, d1) if d1 >= date(2026, 6, 1) else pl.DataFrame({"acq_date": []}, schema={"acq_date": pl.Utf8})
                if sp is None or nrt is None:
                    for k in range((d1 - d0).days + 1):
                        bad_months.add((d0 + timedelta(days=k)).strftime("%Y-%m"))
                    continue
                sp_days = set(sp["acq_date"].to_list()) if sp.height else set()
                if nrt.height:
                    nrt = nrt.filter(~pl.col("acq_date").is_in(list(sp_days)))
                for part, src in ((sp, "SP"), (nrt, "NRT")):
                    if part.height:
                        frames.append(part.select("latitude", "longitude", "acq_date", "acq_time", "confidence", "daynight", "frp").with_columns(pl.lit(src).alias("src")))
        if not frames:
            df = None
        else:
            df = pl.concat(frames).unique(subset=["latitude", "longitude", "acq_date", "acq_time"])
            df = df.filter((pl.col("daynight") == "D") & pl.col("confidence").str.to_lowercase().is_in(["n", "h", "nominal", "high"]))
            df = df.with_columns(pl.col("frp").cast(pl.Float64, strict=False)).filter(pl.col("frp") > 0)
            df = df.filter(pl.Series(shapely.contains_xy(g, df["longitude"].cast(pl.Float64).to_numpy(), df["latitude"].cast(pl.Float64).to_numpy())))
        months = {}
        for m in range(1, end.month + 1):
            key = f"2026-{m:02d}"
            days_in = calendar.monthrange(2026, m)[1]
            covered = days_in if m < end.month else end.day
            if key in bad_months:
                months[key] = None
                continue
            sub = df.filter(pl.col("acq_date").str.slice(0, 7) == key) if df is not None else None
            n = sub.height if sub is not None else 0
            h = float(sub.select((1.0 / (1.0 + (-(lg["b0"] + lg["b1"] * pl.col("frp").log())).exp())).sum()).item() or 0.0) * kappa * r if n else 0.0
            srcs = sorted(set(sub["src"].to_list())) if n else []
            months[key] = {"harmonized": round(h, 1), "n_raw": n, "days_covered": covered, "days_in_month": days_in, "source": "+".join(srcs) or "none"}
        return c, months

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, (c, months) in enumerate(ex.map(one, [c for c in order if c not in countries]), 1):
            if months is not None:
                countries[c] = months
            out = {
                "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
                "status": "provisional",
                "label": "harmonized 2026, bridged from NOAA-20 (bridge validated on held-out 2022-2023)",
                "window_utc": [start.isoformat(), end.isoformat()],
                "method": "harmonized = r x kappa x sum P(FRP) over NOAA-20 detections; published fit (params_global.json) and bridge ratio r (bridge.json) unchanged",
                "filters": "daytime; confidence nominal or high; FRP > 0; all fire types; inside the Natural Earth 110 m outline",
                "sources": "NOAA-20 VIIRS 375 m from the FIRMS area API: standard processing (VIIRS_NOAA20_SP) where available, near-real-time (VIIRS_NOAA20_NRT) for the remaining days; one source per day",
                "null_month": "a month with a failed or truncated request is null (not recorded)",
                "fit_version": params.get("fit_version"),
                "countries": countries,
            }
            OUT.write_text(json.dumps(out, separators=(",", ":")))
            print(f"  {c} done ({len(countries)} countries, {time.time() - t0:.0f}s)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
