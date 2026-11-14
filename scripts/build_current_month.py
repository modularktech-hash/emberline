#!/usr/bin/env python3
"""Prototype: recent NOAA-20 activity vs NOAA-20's own history, same calendar window.

Plan Combat E07. Decision and evidence: docs/current-month.md.

What it compares (same platform, same filters on both sides, no cross-sensor
bridge, NOT harmonized, NOT Aqua-equivalent):

* current: NOAA-20 VIIRS NRT (keyless 7-day feed J1_VIIRS_C2_Global_7d), the
  complete UTC days it covers;
* history: NOAA-20 VIIRS standard archive (country slug `viirs-jpss1`), the same
  calendar days in each year 2018-2025 (NOAA-20 archive starts 2018-04-01).

Filters, identical on both sides: daytime (daynight == D), confidence nominal or
high, FRP > 0. The NRT file has no `type` column, so static sources and
volcanoes cannot be removed from the current count; the history is therefore
NOT type-filtered either, and the type != 0 share of the history window is
reported as context. Country membership on BOTH sides is the same point-in-
polygon test against web/public/geo/countries.geojson (Natural Earth 110 m),
because the NRT file has no country column; the agreement with FIRMS's own
country assignment on the archive is reported.

The keyless NRT feed only reaches back 7 days, so a true month-to-date window
(day 1 to today) is not reachable without a FIRMS MAP_KEY; the output says so.

Usage:
  build_current_month.py --archive DIR --nrt J1_VIIRS_C2_Global_7d.csv
Output: web/public/data/current_month.json
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import polars as pl
import shapely
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data" / "current_month.json"
GEO = ROOT / "web" / "public" / "geo" / "countries.geojson"
COUNTRIES = ["Canada", "Portugal", "Chile", "Australia"]
YEARS = list(range(2018, 2026))
CONF_OK = {"n", "h", "nominal", "high"}


def filt(df: pl.DataFrame) -> pl.DataFrame:
    return df.filter(
        (pl.col("daynight") == "D")
        & pl.col("confidence").cast(pl.Utf8).str.to_lowercase().is_in(list(CONF_OK))
        & (pl.col("frp").cast(pl.Float64) > 0)
    )


def inside(geom, df: pl.DataFrame) -> np.ndarray:
    return shapely.contains_xy(geom, df["longitude"].to_numpy(), df["latitude"].to_numpy())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", type=Path, required=True)
    ap.add_argument("--nrt", type=Path, required=True)
    a = ap.parse_args()

    geo = {f["properties"]["NAME"]: shape(f["geometry"]) for f in json.loads(GEO.read_text())["features"]}
    for g in geo.values():
        shapely.prepare(g)

    nrt = pl.read_csv(a.nrt, infer_schema_length=0)
    if not nrt.columns or nrt.columns[0] != "latitude":
        raise SystemExit("NRT file is not a FIRMS CSV")
    nrt = nrt.with_columns(pl.col("latitude").cast(pl.Float64), pl.col("longitude").cast(pl.Float64))
    days = sorted(set(nrt["acq_date"].to_list()))
    first_ts = nrt.filter(pl.col("acq_date") == days[0])["acq_time"].min()
    last_ts = nrt.filter(pl.col("acq_date") == days[-1])["acq_time"].max()
    # The rolling 7-day feed starts and ends mid-day: keep only interior (complete) UTC days.
    win = days[1:-1]
    d0, d1 = date.fromisoformat(win[0]), date.fromisoformat(win[-1])
    n_days = (d1 - d0).days + 1
    assert n_days == len(win), "gap in NRT days"
    cutoff = f"{days[-1]}T{last_ts[:2]}:{last_ts[2:]}Z"
    nrt_w = filt(nrt.filter(pl.col("acq_date").is_in(win)))

    out = {
        "generated_utc": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()),
        "status": "prototype",
        "comparison": "same-platform NOAA-20 window vs NOAA-20 history; not harmonized, not Aqua-equivalent",
        "platform": "NOAA-20 VIIRS 375 m (current: NRT 2.0NRT; history: standard archive v2)",
        "filters": "daytime only; confidence nominal or high; FRP > 0; thermal-source type NOT filtered (absent from NRT)",
        "membership": "point in Natural Earth 110 m country polygon, both sides",
        "nrt_feed": "J1_VIIRS_C2_Global_7d",
        "nrt_feed_span_utc": [f"{days[0]}T{first_ts[:2]}:{first_ts[2:]}Z", cutoff],
        "acquisition_cutoff_utc": f"{win[-1]}T23:59Z",
        "window_utc": [win[0], win[-1]],
        "elapsed_days": n_days,
        "month_to_date": False,
        "month_to_date_note": f"Keyless NRT reaches back 7 days only; {d0.strftime('%B')} 1 to {win[0]} needs a FIRMS MAP_KEY.",
        "provisional_nrt": True,
        "reference_years": YEARS,
        "countries": {},
    }

    md0, md1 = (d0.month, d0.day), (d1.month, d1.day)
    for c in COUNTRIES:
        g = geo[c]
        cur = int(inside(g, nrt_w).sum())
        per_year, type_share, agree = {}, [], []
        for y in YEARS:
            f = a.archive / f"viirs-jpss1_{y}_{c}.csv"
            df = pl.read_csv(f, infer_schema_length=0, columns=["latitude", "longitude", "acq_date", "confidence", "frp", "daynight", "type"])
            lo, hi = date(y, *md0).isoformat(), date(y, *md1).isoformat()
            w = filt(df.filter((pl.col("acq_date") >= lo) & (pl.col("acq_date") <= hi)))
            w = w.with_columns(pl.col("latitude").cast(pl.Float64), pl.col("longitude").cast(pl.Float64))
            ins = inside(g, w)
            per_year[y] = int(ins.sum())
            if len(w):
                agree.append(float(ins.mean()))
                type_share.append(float((w.filter(pl.Series(ins))["type"] != "0").mean() or 0.0))
        # FIRMS country file only has that country's detections; points outside the polygon
        # are coastal/border misses of the 110 m outline. Points from neighbours inside the
        # polygon are not counted on the history side -- see docs.
        vals = np.array([per_year[y] for y in YEARS], dtype=float)
        med = float(np.median(vals))
        q1, q3 = (float(v) for v in np.percentile(vals, [25, 75]))
        pct = float(100 * (np.sum(vals < cur) + 0.5 * np.sum(vals == cur)) / len(vals))
        out["countries"][c] = {
            "count_to_date": cur,
            "history_by_year": {str(y): per_year[y] for y in YEARS},
            "history_median": med,
            "history_iqr": [q1, q3],
            "n_years": len(YEARS),
            "abs_deviation": cur - med,
            "ratio": (cur / med) if med > 0 else None,
            "percentile_vs_history": round(pct, 1),
            "history_polygon_capture_mean": round(float(np.mean(agree)), 3) if agree else None,
            "history_nonveg_type_share_mean": round(float(np.mean(type_share)), 3) if type_share else None,
            "completeness": f"{n_days} complete UTC days of NRT; NRT may still receive late granules",
        }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps({k: {kk: v[kk] for kk in ("count_to_date", "history_median", "history_iqr", "ratio", "percentile_vs_history", "history_polygon_capture_mean", "history_nonveg_type_share_mean")} for k, v in out["countries"].items()}, indent=1))
    print("window", out["window_utc"], "cutoff", out["acquisition_cutoff_utc"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
