#!/usr/bin/env python3
"""Measure Terra/Aqua overpass drift from FIRMS country-archive CSVs.

Terra and Aqua left their frozen orbits around 2022. Terra's overpass is
drifting earlier and Aqua's later. Because the fire diurnal cycle peaks near
13:00 local solar time with a narrow width, that drift changes how much fire
each sensor sees -- independently of how much is actually burning.

This script measures the drift directly, by computing the mean local solar
time of daytime vegetation-fire detections per satellite per year.

Local solar time is approximated as UTC + longitude/15, computed per detection
so that a country's longitude spread is handled correctly. Do not compute it
from a country-mean UTC time: for a country spanning many time zones the mean
wraps around midnight and the answer is garbage.

Usage:
    ./measure_overpass_drift.py Chile 2015 2021 2023 2025
    ./measure_overpass_drift.py Chile              # defaults to 2003..2025

Reads CSVs from ./firms-probe (as written by probe_firms_archive.sh) and
downloads any that are missing. No API key required.
"""

from __future__ import annotations

import csv
import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

BASE = "https://firms.modaps.eosdis.nasa.gov/data/country/csv"
CACHE = Path("firms-probe")

# Column positions are not relied on: the archive header is used by name.
# MODIS archive: latitude,longitude,brightness,scan,track,acq_date,acq_time,
#                satellite,instrument,confidence,version,bright_t31,frp,
#                daynight,type


def fetch(source: str, year: int, country: str) -> Path | None:
    """Download one country-year CSV, caching it. Returns None if absent."""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f"{source}_{year}_{country}.csv"
    if not path.exists() or path.stat().st_size == 0:
        url = f"{BASE}/{source}/{year}/{source}_{year}_{country}.csv"
        try:
            urllib.request.urlretrieve(url, path)
        except OSError:
            return None
    # A 404 is served as a JSON error document, not a CSV. Detect it.
    with path.open("rb") as fh:
        if fh.read(1) == b"{":
            return None
    return path


def local_solar_time(acq_time: str, longitude: float) -> float:
    """Approximate local solar time in hours, from UTC HHMM and longitude."""
    t = int(acq_time)
    utc = t // 100 + (t % 100) / 60.0
    return (utc + longitude / 15.0) % 24.0


def summarize(path: Path) -> dict[str, dict[str, float]]:
    """Mean local solar time, count and mean FRP per satellite."""
    acc: dict[str, list[float]] = defaultdict(lambda: [0.0, 0, 0.0])
    with path.open(newline="") as fh:
        for row in csv.DictReader(fh):
            # Vegetation fires only, daytime only. Night detections sample a
            # different part of the diurnal cycle and would blur the signal.
            if row.get("type") != "0" or row.get("daynight") != "D":
                continue
            try:
                lst = local_solar_time(row["acq_time"], float(row["longitude"]))
                frp = float(row["frp"])
            except (KeyError, TypeError, ValueError):
                continue
            a = acc[row["satellite"]]
            a[0] += lst
            a[1] += 1
            a[2] += frp
    return {
        sat: {"lst": s / n, "n": n, "mean_frp": f / n}
        for sat, (s, n, f) in acc.items()
        if n
    }


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    country = args[0]
    years = [int(y) for y in args[1:]] or list(range(2003, 2026))

    print(f"Overpass drift, {country} -- mean LOCAL SOLAR TIME of daytime")
    print("vegetation-fire detections. Terra nominal 10:30, Aqua nominal 13:30.")
    print()
    header = f"{'year':<6} {'Terra LST':>10} {'Terra n':>9} {'Aqua LST':>10} {'Aqua n':>9} {'T/A count':>10}"
    print(header)
    print("-" * len(header))

    rows = []
    for year in years:
        path = fetch("modis", year, country)
        if path is None:
            continue
        s = summarize(path)
        terra, aqua = s.get("Terra"), s.get("Aqua")
        if not terra or not aqua:
            continue
        ratio = terra["n"] / aqua["n"]
        rows.append((year, terra["lst"], aqua["lst"], ratio))
        print(
            f"{year:<6} {terra['lst']:>9.2f}h {terra['n']:>9d}"
            f" {aqua['lst']:>9.2f}h {aqua['n']:>9d} {ratio:>10.3f}"
        )

    if len(rows) >= 2:
        base = [r for r in rows if r[0] <= 2021]
        late = [r for r in rows if r[0] >= 2024]
        if base and late:
            bt = sum(r[1] for r in base) / len(base)
            ba = sum(r[2] for r in base) / len(base)
            lt = sum(r[1] for r in late) / len(late)
            la = sum(r[2] for r in late) / len(late)
            print()
            print(f"Pre-2022 mean:  Terra {bt:.2f}h   Aqua {ba:.2f}h"
                  f"   separation {ba - bt:.2f}h")
            print(f"2024+ mean:     Terra {lt:.2f}h   Aqua {la:.2f}h"
                  f"   separation {la - lt:.2f}h")
            print(f"Drift:          Terra {lt - bt:+.2f}h  Aqua {la - ba:+.2f}h")
            print()
            print("Both sensors are moving AWAY from the ~13:00 diurnal peak, so")
            print("both see progressively less of each fire's energy over time.")
            print("Any correction fitted on the frozen-orbit era and applied")
            print("naively to 2022+ will mistake this for a change in fire.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
