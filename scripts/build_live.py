#!/usr/bin/env python3
"""Snapshot of the last 24 h and 7 days of active fires, worldwide, for the globe.

Reads the keyless FIRMS near-real-time feeds, keeps daytime and night
detections, and bins them onto a 0.5 degree grid (count, summed and peak FRP,
which satellites saw them). Suomi-NPP's NRT feed has been empty since
13 Nov 2026, so the live layer is NOAA-20/21 VIIRS plus MODIS -- a different
platform mix from the harmonized history, and labelled as such in the app.

NRT files carry no `type` column, so volcanoes and gas flares cannot be
filtered here the way the archive is; the app says so.

Output: web/public/data/live.json
"""

from __future__ import annotations

import csv
import io
import json
import subprocess
import time
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "live.json"
BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire"
FEEDS = {
    "24h": [("noaa-20-viirs-c2", "J1_VIIRS_C2_Global_24h", "NOAA-20"),
            ("noaa-21-viirs-c2", "J2_VIIRS_C2_Global_24h", "NOAA-21"),
            ("modis-c6.1", "MODIS_C6_1_Global_24h", "MODIS")],
    "7d": [("noaa-20-viirs-c2", "J1_VIIRS_C2_Global_7d", "NOAA-20"),
           ("modis-c6.1", "MODIS_C6_1_Global_7d", "MODIS")],
}
CELL = 0.5


def fetch(slug: str, name: str) -> str:
    for attempt in range(8):
        r = subprocess.run(["curl", "-sS", "--connect-timeout", "8", "-m", "300",
                            f"{BASE}/{slug}/csv/{name}.csv"], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.startswith("latitude,"):
            return r.stdout
        time.sleep(2 + attempt * 2)
    raise RuntimeError(f"could not fetch {name}")


def main() -> int:
    out = {"fetched_utc": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()), "cell_deg": CELL, "windows": {}}
    for window, feeds in FEEDS.items():
        bins: dict = defaultdict(lambda: [0, 0.0, 0.0, set()])
        totals, dates = {}, set()
        for slug, name, label in feeds:
            n = 0
            for row in csv.DictReader(io.StringIO(fetch(slug, name))):
                try:
                    lat, lon, frp = float(row["latitude"]), float(row["longitude"]), float(row["frp"] or 0)
                except (KeyError, ValueError):
                    continue
                key = (round((lat // CELL) * CELL + CELL / 2, 2), round((lon // CELL) * CELL + CELL / 2, 2))
                b = bins[key]
                b[0] += 1; b[1] += frp; b[2] = max(b[2], frp); b[3].add(label)
                dates.add(row.get("acq_date", ""))
                n += 1
            totals[label] = n
            print(f"{window} {label}: {n:,} detections", flush=True)
        cells = sorted(([k[0], k[1], v[0], round(v[1], 1), round(v[2], 1), "+".join(sorted(v[3]))]
                        for k, v in bins.items()), key=lambda c: -c[3])
        out["windows"][window] = {"totals": totals, "dates": sorted(d for d in dates if d),
                                  "columns": ["lat", "lon", "detections", "frp_sum_mw", "frp_max_mw", "satellites"],
                                  "cells": cells}
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
