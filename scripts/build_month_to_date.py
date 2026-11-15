#!/usr/bin/env python3
"""G2: this month so far (raw, provisional) against the historical raw median.

Writes web/public/data/month_to_date.json. (web/public/data/current_month.json is a
different, earlier product, E07, and is left untouched.)

Current month to date, complete UTC days only, from the FIRMS area API
(keyed; the key is read from the environment variable FIRMS_MAP_KEY and is
never written anywhere):
  * MODIS_NRT         (Terra + Aqua; both are drifting since 2022)
  * VIIRS_NOAA20_NRT  (NOAA-20: a different platform from the Suomi-NPP history)
Requests are bounding boxes of each country's Natural Earth 110 m outline in
chunks of 5 days or fewer (the API's limit), at most 3 at a time, with retries. A detection
counts for the country when it lies inside that outline (point in polygon).
Filters, as close to the historical record as NRT allows: daytime, confidence
nominal or high (MODIS >= 30), FRP > 0. NRT carries no fire `type`, so static
sources and volcanoes are NOT removed here (the history is type 0 only).

History, from web/public/data/calendar_raw_global.parquet (FIRMS archive,
country rows, the same calendar month):
  * MODIS rows (Terra + Aqua) 2003-2025 for the MODIS comparison;
  * VIIRS rows (Suomi-NPP) 2012-2025 for the NOAA-20 comparison.
pace = month-to-date count x days in month / days covered (a straight-line
extrapolation). percentile = 100 x (years below pace + 0.5 x ties) / years.

Usage:
  FIRMS_MAP_KEY=... python3 scripts/build_month_to_date.py [--countries N] [--end YYYY-MM-DD]
  --countries N : only the N fitted countries with the most filtered detections.
"""
from __future__ import annotations

import argparse
import calendar
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import polars as pl
import shapely
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
GEO = ROOT / "web" / "public" / "geo" / "countries.geojson"
OUT = DATA / "month_to_date.json"
API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SOURCES = {"MODIS_NRT": "MODIS", "VIIRS_NOAA20_NRT": "NOAA-20"}
HISTORY = {"MODIS_NRT": ("MODIS", 2003, 2025), "VIIRS_NOAA20_NRT": ("VIIRS", 2012, 2025)}

# FIRMS country names whose Natural Earth 110 m NAME differs (same map as web/src/lib/hotspots.ts).
NE_NAME = {
    "Democratic_Republic_of_the_Congo": "Dem. Rep. Congo", "Russian_Federation": "Russia", "South_Sudan": "S. Sudan",
    "Central_African_Republic": "Central African Rep.", "United_States": "United States of America", "Lao_PDR": "Laos",
    "Cote_d_Ivoire": "Côte d'Ivoire", "Republic_of_Congo": "Congo", "Dominican_Republic": "Dominican Rep.", "Dem_Rep_Korea": "North Korea",
    "The_Gambia": "Gambia", "Bosnia_and_Herzegovina": "Bosnia and Herz.", "Macedonia_Former_Yugoslav_Republic_of": "Macedonia",
    "Republic_of_Korea": "South Korea", "Equatorial_Guinea": "Eq. Guinea", "Czech_Republic": "Czechia", "Solomon_Islands": "Solomon Is.",
    "Brunei_Darussalam": "Brunei", "Falkland_Islands": "Falkland Is.", "Western_Sahara": "W. Sahara", "Eswatini": "Swaziland",
}


def ne_name(c: str) -> str:
    return NE_NAME.get(c, c.replace("_", " "))


def boxes(geom) -> list[tuple[float, float, float, float]]:
    """One bbox, or two when the outline straddles the antimeridian."""
    w, s, e, n = geom.bounds
    if e - w <= 180:
        return [(w, s, e, n)]
    parts = list(getattr(geom, "geoms", [geom]))
    out = []
    for side in (lambda p: p.centroid.x < 0, lambda p: p.centroid.x >= 0):
        sel = [p for p in parts if side(p)]
        if sel:
            out.append(shapely.union_all(sel).bounds)
    return out


CACHE = ROOT / "data" / "mtd_cache"


def fetch(key: str, source: str, box, start: date, days: int) -> str | None:
    """One area request. Responses for complete past days are cached under
    data/mtd_cache/ (gitignored), so a re-run after a network failure resumes.
    Returns None when the request still fails after every retry; the caller
    then marks that country as incomplete instead of guessing."""
    w, s, e, n = (round(v, 3) for v in box)
    tag = f"{source}_{w}_{s}_{e}_{n}_{days}_{start.isoformat()}.csv"
    hit = CACHE / tag
    if hit.exists():
        return hit.read_text()
    url = f"{API}/{key}/{source}/{w},{s},{e},{n}/{days}/{start.isoformat()}"
    import subprocess
    for attempt in range(12):
        r = subprocess.run(["curl", "-sS", "--connect-timeout", "20", "-m", "300", url], capture_output=True, text=True)
        body = r.stdout
        if r.returncode == 0 and (body.startswith("latitude,") or body.strip() == ""):
            CACHE.mkdir(parents=True, exist_ok=True)
            hit.write_text(body)
            return body
        if r.returncode == 0 and body.startswith("Invalid"):
            raise RuntimeError(f"FIRMS rejected the request: {body[:120]!r}")
        time.sleep(min(60, 5 + attempt * 5))
    print(f"  giving up: {source} {box} {start} ({(r.stdout or r.stderr)[:100]!r})", file=sys.stderr)
    return None


def chunks(d0: date, d1: date):
    d = d0
    while d <= d1:
        n = min(5, (d1 - d).days + 1)  # the area API accepts a day range of 1..5
        yield d, n
        d += timedelta(days=n)


def keep(df: pl.DataFrame, source: str, d0: date, d1: date) -> pl.DataFrame:
    if df.is_empty():
        return df
    conf = pl.col("confidence").cast(pl.Utf8)
    ok_conf = (conf.cast(pl.Int64, strict=False) >= 30) if source == "MODIS_NRT" else conf.str.to_lowercase().is_in(["n", "h", "nominal", "high"])
    return df.filter(
        (pl.col("daynight") == "D") & ok_conf & (pl.col("frp").cast(pl.Float64, strict=False) > 0)
        & pl.col("acq_date").is_between(pl.lit(d0.isoformat()), pl.lit(d1.isoformat()))
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries", type=int, default=None, help="only the N fitted countries with the most filtered detections")
    ap.add_argument("--end", type=str, default=None, help="last complete UTC day (default: yesterday UTC)")
    a = ap.parse_args()
    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if not key:
        print("FIRMS_MAP_KEY is not set; nothing fetched, nothing written.", file=sys.stderr)
        return 2

    now = datetime.now(timezone.utc)
    d1 = date.fromisoformat(a.end) if a.end else (now.date() - timedelta(days=1))
    d0 = d1.replace(day=1)
    days_covered = (d1 - d0).days + 1
    days_in_month = calendar.monthrange(d1.year, d1.month)[1]

    params = json.loads((DATA / "params_global.json").read_text())
    table = {r["country"]: r for r in json.loads((DATA / "countries.json").read_text())["countries"]}
    fitted = sorted(params["countries"], key=lambda c: -(table.get(c, {}).get("detections_filtered") or 0))
    selected = fitted[: a.countries] if a.countries else fitted
    geo = {f["properties"]["NAME"]: shape(f["geometry"]) for f in json.loads(GEO.read_text())["features"]}

    cal = pl.read_parquet(DATA / "calendar_raw_global.parquet").filter(
        (pl.col("scope") == "country") & (pl.col("month") == d1.month))

    jobs, no_outline = [], []
    for c in selected:
        g = geo.get(ne_name(c))
        if g is None:
            no_outline.append(c)
            continue
        shapely.prepare(g)
        for src in SOURCES:
            for b in boxes(g):
                for s, n in chunks(d0, d1):
                    jobs.append((c, src, b, s, n))
    print(f"{len(selected)} countries ({len(no_outline)} without outline), {len(jobs)} requests, window {d0}..{d1}", file=sys.stderr)

    def run(job):
        c, src, b, s, n = job
        return job, fetch(key, src, b, s, n)

    frames: dict[tuple[str, str], list[pl.DataFrame]] = {}
    incomplete: set[str] = set()
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=3) as ex:
        for i, (job, body) in enumerate(ex.map(run, jobs), 1):
            c, src = job[0], job[1]
            if body is None:
                incomplete.add(c)
                continue
            if body:
                df = pl.read_csv(io.StringIO(body), infer_schema_length=0)
                df = keep(df, src, d0, d1)
                if not df.is_empty():
                    g = geo[ne_name(c)]
                    mask = shapely.contains_xy(g, df["longitude"].cast(pl.Float64).to_numpy(), df["latitude"].cast(pl.Float64).to_numpy())
                    df = df.filter(pl.Series(mask))
                frames.setdefault((c, src), []).append(df.select("latitude", "longitude", "acq_date", "acq_time") if not df.is_empty() else df)
            if i % 50 == 0:
                print(f"  {i}/{len(jobs)} requests, {time.time() - t0:.0f}s", file=sys.stderr)

    out_countries = {}
    for c in selected:
        if c in no_outline or c in incomplete:
            continue
        row = {}
        for src, label in SOURCES.items():
            parts = [f for f in frames.get((c, src), []) if not f.is_empty()]
            n = int(pl.concat(parts).unique().height) if parts else 0
            sensor, y0, y1 = HISTORY[src]
            hist = cal.filter((pl.col("key") == c) & (pl.col("sensor") == sensor) & pl.col("year").is_between(y0, y1))
            by_year = {int(y): int(v) for y, v in hist.group_by("year").agg(pl.col("n_detections").sum()).iter_rows()}
            vals = [by_year.get(y, 0) for y in range(y0, y1 + 1)]
            pace = n * days_in_month / days_covered
            below = sum(v < pace for v in vals)
            ties = sum(v == pace for v in vals)
            srt = sorted(vals)
            m = len(srt)
            med = (srt[m // 2] if m % 2 else (srt[m // 2 - 1] + srt[m // 2]) / 2) if m else None
            row[label] = {
                "month_to_date": n,
                "pace_full_month": round(pace, 1),
                "history_platform": "MODIS Terra+Aqua (archive)" if sensor == "MODIS" else "Suomi-NPP VIIRS (archive)",
                "history_years": [y0, y1],
                "history_median": med,
                "history_max": max(vals) if vals else None,
                "percentile_of_pace": round(100 * (below + 0.5 * ties) / m, 1) if m else None,
                "years_below_pace": below,
            }
        out_countries[c] = row

    out = {
        "generated_utc": now.strftime("%Y-%m-%dT%H:%MZ"),
        "status": "provisional",
        "label": "provisional · raw · not harmonized",
        "month": f"{d1.year}-{d1.month:02d}",
        "window_utc": [d0.isoformat(), d1.isoformat()],
        "days_covered": days_covered,
        "days_in_month": days_in_month,
        "sources": {"MODIS": "FIRMS MODIS_NRT (Terra + Aqua; both drifting from their original overpass times since 2022)",
                    "NOAA-20": "FIRMS VIIRS_NOAA20_NRT (NOAA-20; a different platform from the Suomi-NPP history)"},
        "filters": "daytime; confidence nominal or high (MODIS >= 30); FRP > 0; fire type NOT filtered (absent from NRT), so static sources and volcanoes are included; history is vegetation fires (type 0) only",
        "membership": "current: point inside the Natural Earth 110 m outline (web/public/geo/countries.geojson); history: FIRMS archive country files",
        "pace_definition": "month-to-date count x days in month / days covered (straight-line; fire seasons are not straight lines)",
        "percentile_definition": "100 x (history years below pace + 0.5 x ties) / history years",
        "selection": (f"top {a.countries} fitted countries by filtered detections (countries.json)" if a.countries else f"all {len(fitted)} fitted countries"),
        "no_outline": no_outline,
        "incomplete": sorted(incomplete),
        "countries": out_countries,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out_countries)} countries in {time.time() - t0:.0f}s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
