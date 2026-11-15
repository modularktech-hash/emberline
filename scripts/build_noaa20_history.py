#!/usr/bin/env python3
"""Same-platform history for the "this month so far" card: NOAA-20 against NOAA-20.

The month-to-date card counts NOAA-20 VIIRS NRT detections. Comparing those with the
Suomi-NPP archive mixes two platforms. This script builds the matching history from
NOAA-20's own standard archive (FIRMS country files, slug `viirs-jpss1`, which starts
2018-04-01), with the same filters and the same membership rule as the current count:

  * daytime, confidence nominal or high, FRP > 0, fire type not filtered (NRT has none);
  * a detection counts when it lies inside the country's Natural Earth 110 m outline.

For each country and year 2018..2025 it stores the count for days 1..D of the month
(the same calendar window as the current count) and for the whole month. Files are
streamed and filtered on the fly; nothing large is written to disk. No key needed.

Usage:
  python3 scripts/build_noaa20_history.py --month 11 --days 14
Output: web/public/data/noaa20_history.json (merged per month; resumable).
"""
from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import polars as pl
import shapely
from shapely.geometry import shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_month_to_date import GEO, ne_name  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
OUT = DATA / "noaa20_history.json"
BASE = "https://firms.modaps.eosdis.nasa.gov/data/country/csv/viirs-jpss1"
YEARS = range(2018, 2026)


def fetch_month(country: str, year: int, month: int) -> str | None:
    """Stream one archive file and keep only the header and rows of the month."""
    url = f"{BASE}/{year}/viirs-jpss1_{year}_{country}.csv"
    tag = f",{year}-{month:02d}-"
    for attempt in range(15):
        p = subprocess.Popen(["curl", "-sS", "--fail", "--connect-timeout", "20", "-m", "900", url], stdout=subprocess.PIPE, text=True)
        assert p.stdout
        first = p.stdout.readline()
        if not first.startswith("latitude,"):
            p.stdout.read(); p.wait()
            if p.returncode == 22:  # 404: no file for that country and year
                return ""
            time.sleep(min(60, 5 + attempt * 5))
            continue
        lines = [first] + [ln for ln in p.stdout if tag in ln]
        p.wait()
        if p.returncode == 0:
            return "".join(lines)
        time.sleep(min(60, 5 + attempt * 5))
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", type=int, required=True)
    ap.add_argument("--days", type=int, required=True, help="window is days 1..DAYS of the month")
    ap.add_argument("--countries", type=str, default=str(DATA / "month_to_date.json"), help="month_to_date.json whose countries to cover")
    a = ap.parse_args()

    countries = sorted(json.loads(Path(a.countries).read_text())["countries"])
    geo = {f["properties"]["NAME"]: shape(f["geometry"]) for f in json.loads(GEO.read_text())["features"]}
    store = json.loads(OUT.read_text()) if OUT.exists() else {}
    key = f"{a.month:02d}"
    month = store.setdefault(key, {"window_days": a.days, "countries": {}})
    if month.get("window_days") != a.days:
        month.update(window_days=a.days, countries={})
    done = month["countries"]

    jobs = [(c, y) for c in countries if c not in done for y in YEARS]
    print(f"{len(countries) - len(done)} countries to fetch, {len(jobs)} files", file=sys.stderr)
    acc: dict[str, dict[str, list[int]]] = {}
    failed: set[str] = set()

    def run(job):
        return job, fetch_month(job[0], job[1], a.month)

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=2) as ex:
        for i, ((c, y), body) in enumerate(ex.map(run, jobs), 1):
            if body is None:
                failed.add(c)
            else:
                window = full = 0
                if body.count("\n") > 1:
                    df = pl.read_csv(io.StringIO(body), infer_schema_length=0)
                    df = df.filter((pl.col("daynight") == "D") & pl.col("confidence").str.to_lowercase().is_in(["n", "h", "nominal", "high"])
                                   & (pl.col("frp").cast(pl.Float64, strict=False) > 0))
                    g = geo[ne_name(c)]
                    df = df.filter(pl.Series(shapely.contains_xy(g, df["longitude"].cast(pl.Float64).to_numpy(), df["latitude"].cast(pl.Float64).to_numpy())))
                    full = df.height
                    window = df.filter(pl.col("acq_date").str.slice(8, 2).cast(pl.Int32) <= a.days).height
                acc.setdefault(c, {})[str(y)] = [window, full]
            if len(acc.get(c, {})) == len(YEARS) and c not in failed:
                done[c] = {"window": {y: v[0] for y, v in acc[c].items()}, "full_month": {y: v[1] for y, v in acc[c].items()}}
                OUT.write_text(json.dumps(store, separators=(",", ":")))
            if i % 40 == 0:
                print(f"  {i}/{len(jobs)} files, {time.time() - t0:.0f}s", file=sys.stderr)
    OUT.write_text(json.dumps(store, separators=(",", ":")))
    print(f"done; {len(done)} countries stored, failed: {sorted(failed)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
