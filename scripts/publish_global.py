#!/usr/bin/env python3
"""Assemble the global calendars for the app from the per-country outputs.

Inputs:
  data/global_public/calendar_raw_<Country>.parquet     (run_global.py)
  web/public/data/calendar_harmonized_global.parquet     (fit_harmonization.py,
      EMBERLINE_CAL=calendar_harmonized_global.parquet; one block per country)

Outputs, in web/public/data/ (same schemas as calendar_raw.parquet and
calendar_harmonized.parquet):
  calendar_raw_global.parquet         zero-filled like build_tables.py
  calendar_harmonized_global.parquet  rewritten in place

An H3 res-2 parent cell straddling a border gets rows from every country it
touches, so h3_parent rows are summed across countries here. Country rows are
unique already. Both files sorted by scope, key, year, month.

Usage: python3 scripts/publish_global.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "global_public"
WEB = ROOT / "web" / "public" / "data"
SENSOR_YEARS = {"MODIS": range(2001, 2026), "VIIRS": range(2012, 2026)}
LIMIT = 50 * 1024 * 1024


def raw() -> pl.DataFrame:
    parts = [pl.read_parquet(p) for p in sorted(SRC.glob("calendar_raw_*.parquet"))]
    obs = (pl.concat(parts, how="vertical_relaxed")
           .group_by("scope", "key", "year", "month", "sensor")
           .agg(pl.col("n_detections").sum(), pl.col("frp_sum_mw").sum())
           .with_columns(pl.col("year").cast(pl.Int16), pl.col("month").cast(pl.Int8)))
    # Zero-fill every (scope, key, sensor) over that sensor's archive years.
    keys = obs.select("scope", "key").unique()
    sy = pl.concat([pl.DataFrame({"sensor": s, "year": list(y)}, schema={"sensor": pl.Utf8, "year": pl.Int16})
                    for s, y in SENSOR_YEARS.items()])
    months = pl.DataFrame({"month": list(range(1, 13))}, schema={"month": pl.Int8})
    grid = keys.join(sy, how="cross").join(months, how="cross")
    out = (grid.join(obs, on=["scope", "key", "year", "month", "sensor"], how="left")
           .with_columns(pl.col("n_detections").fill_null(0), pl.col("frp_sum_mw").fill_null(0.0)))
    unexpected = obs.join(grid, on=["scope", "key", "year", "month", "sensor"], how="anti")
    if unexpected.height:
        raise SystemExit(f"{unexpected.height} observed rows fall outside the archive years:\n{unexpected.head()}")
    return out.select("scope", "key", "year", "month", "sensor", "n_detections", "frp_sum_mw").sort(
        "scope", "key", "year", "month", "sensor")


def harmonized() -> pl.DataFrame:
    h = pl.read_parquet(WEB / "calendar_harmonized_global.parquet")
    return (h.group_by("scope", "key", "year", "month").agg(pl.col("n_harmonized").sum())
            .select("scope", "key", "year", "month", "n_harmonized").sort("scope", "key", "year", "month"))


def main() -> int:
    r = raw()
    h = harmonized()
    for name, df in (("calendar_raw_global.parquet", r), ("calendar_harmonized_global.parquet", h)):
        path = WEB / name
        # Small row groups, sorted by scope/key/year/month: the browser range-reads
        # one country or a few h3_parent keys via row-group min/max statistics.
        df.write_parquet(path, compression="zstd", statistics=True, row_group_size=20_000)
        size = path.stat().st_size
        print(f"{name}: {df.height:,} rows, {df['key'].n_unique():,} keys, {size / 1e6:.1f} MB")
        if size >= LIMIT:
            print(f"  ERROR: {name} is over 50 MB", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
