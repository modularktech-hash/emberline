#!/usr/bin/env python3
"""This month so far on the drawn-area grid (R5 for a drawn area).

Re-uses the FIRMS area responses that scripts/build_month_to_date.py cached in
data/mtd_cache/ (no new requests): MODIS_NRT and VIIRS_NOAA20_NRT, current
month to date, over the bounding box of every fitted country. Applies the same
filters as that script (daytime; confidence nominal/high, MODIS >= 30; FRP > 0;
fire type is not in NRT, so it is NOT filtered), removes duplicates where boxes
overlap, and counts detections per H3 res-4 cell (the grid of
web/public/data/area/).

Output: web/public/data/month_to_date_cells.json
  {"cells": {cell: [modis, noaa20]}, "boxes": [[w,s,e,n], ...], ...}
An area is covered when it lies inside the fetched boxes; elsewhere the app says
"not recorded" rather than zero.

Usage: python3 scripts/build_month_to_date_cells.py
"""
from __future__ import annotations

import calendar
import io
import json
import sys
from datetime import date
from pathlib import Path

import h3
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_month_to_date import CACHE, OUT as MTD_JSON, keep  # noqa: E402

OUT = ROOT / "web" / "public" / "data" / "month_to_date_cells.json"
RES = json.loads((ROOT / "web" / "public" / "data" / "area" / "index.json").read_text())["resolution"]


def main() -> int:
    mtd = json.loads(MTD_JSON.read_text())
    d0, d1 = (date.fromisoformat(x) for x in mtd["window_utc"])
    frames = {"MODIS_NRT": [], "VIIRS_NOAA20_NRT": []}
    boxes = set()
    for f in CACHE.glob("*.csv"):
        src = "MODIS_NRT" if f.name.startswith("MODIS_NRT_") else "VIIRS_NOAA20_NRT" if f.name.startswith("VIIRS_NOAA20_NRT_") else None
        if src is None:
            continue
        parts = f.name.removeprefix(src + "_").removesuffix(".csv").split("_")
        w, s, e, n, days, start = float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]), int(parts[4]), date.fromisoformat(parts[5])
        if start < d0 or start > d1:
            continue
        boxes.add((w, s, e, n))
        body = f.read_text()
        if not body.startswith("latitude,"):
            continue
        df = keep(pl.read_csv(io.StringIO(body), infer_schema_length=0), src, d0, d1)
        if not df.is_empty():
            frames[src].append(df.select("latitude", "longitude", "acq_date", "acq_time"))
    counts: dict[str, list[int]] = {}
    totals = {}
    for i, (src, parts) in enumerate(frames.items()):
        if not parts:
            totals[src] = 0
            continue
        df = pl.concat(parts).unique()  # overlapping boxes return the same detection twice
        totals[src] = df.height
        lat = df["latitude"].cast(pl.Float64).to_list()
        lon = df["longitude"].cast(pl.Float64).to_list()
        for a, b in zip(lat, lon):
            c = h3.latlng_to_cell(a, b, RES)
            counts.setdefault(c, [0, 0])[i] += 1
    out = {
        "generated_utc": mtd["generated_utc"],
        "status": "provisional",
        "label": "provisional · raw · near-real-time · not harmonized",
        "month": mtd["month"], "window_utc": mtd["window_utc"],
        "days_covered": mtd["days_covered"], "days_in_month": calendar.monthrange(d1.year, d1.month)[1],
        "resolution": RES,
        "columns": ["MODIS (MODIS_NRT, Terra + Aqua)", "NOAA-20 (VIIRS_NOAA20_NRT)"],
        "filters": mtd["filters"],
        "coverage": f"bounding boxes of the {len(mtd['countries'])} fitted countries fetched for month_to_date.json; outside them nothing was fetched",
        "totals": {"MODIS": totals["MODIS_NRT"], "NOAA-20": totals["VIIRS_NOAA20_NRT"]},
        "boxes": sorted(boxes),
        "cells": counts,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(counts)} cells, MODIS {totals['MODIS_NRT']}, NOAA-20 {totals['VIIRS_NOAA20_NRT']}, {len(boxes)} boxes", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
