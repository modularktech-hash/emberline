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

import json
import math
import sys
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "global_public"
WEB = ROOT / "web" / "public" / "data"
SENSOR_YEARS = {"MODIS": range(2001, 2026), "VIIRS": range(2012, 2026)}
LIMIT = 50 * 1024 * 1024


ARCHIVE = ROOT / "data" / "global"
SOURCE_SENSOR = {"modis": "MODIS", "viirs-snpp": "VIIRS"}
COLS = ["scope", "key", "year", "month", "sensor", "n_detections", "frp_sum_mw"]


def country_raw(path: Path) -> pl.DataFrame:
    """One country's raw calendar, zero-filled over the sensor-years whose
    archive file exists (a valid file with no detections in a month is zero;
    a year FIRMS has no file for stays missing, i.e. unknown)."""
    country = path.stem.removeprefix("calendar_raw_")
    obs = pl.read_parquet(path).with_columns(pl.col("year").cast(pl.Int16), pl.col("month").cast(pl.Int8),
                                             pl.col("n_detections").cast(pl.Int64))
    cov = [(SOURCE_SENSOR[s], y) for s, ys in (("modis", SENSOR_YEARS["MODIS"]), ("viirs-snpp", SENSOR_YEARS["VIIRS"]))
           for y in ys if (ARCHIVE / f"{s}_{y}_{country}.csv.gz").exists()]
    coverage = pl.DataFrame(cov, schema={"sensor": pl.Utf8, "year": pl.Int16}, orient="row")
    months = pl.DataFrame({"month": list(range(1, 13))}, schema={"month": pl.Int8})
    grid = obs.select("scope", "key").unique().join(coverage, how="cross").join(months, how="cross")
    on = ["scope", "key", "sensor", "year", "month"]
    lost = obs.join(grid, on=on, how="anti")
    if lost.height:
        raise SystemExit(f"{country}: {lost.height} observed rows outside the archive coverage")
    return (grid.join(obs, on=on, how="left")
            .with_columns(pl.col("n_detections").fill_null(0), pl.col("frp_sum_mw").fill_null(0.0)).select(COLS))


def raw() -> pl.DataFrame:
    parts = [country_raw(p) for p in sorted(SRC.glob("calendar_raw_*.parquet"))]
    before = sum(int(p["n_detections"].sum()) for p in parts)
    out = (pl.concat(parts, how="vertical_relaxed")
           .group_by("scope", "key", "year", "month", "sensor")
           .agg(pl.col("n_detections").sum(), pl.col("frp_sum_mw").sum())
           .select(COLS).sort("scope", "key", "year", "month", "sensor"))
    assert int(out["n_detections"].sum()) == before, "merge lost detections"
    return out


def harmonized() -> pl.DataFrame:
    h = pl.read_parquet(WEB / "calendar_harmonized_global.parquet")
    return (h.group_by("scope", "key", "year", "month").agg(pl.col("n_harmonized").sum())
            .select("scope", "key", "year", "month", "n_harmonized").sort("scope", "key", "year", "month"))


def clean(o):
    """Non-finite floats (e.g. obs/pred with a zero prediction) become null:
    JSON has no NaN/Infinity and browsers reject them."""
    if isinstance(o, float) and not math.isfinite(o):
        return None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o


def main() -> int:
    pj = WEB / "params_global.json"
    pj.write_text(json.dumps(clean(json.loads(pj.read_text())), indent=2, allow_nan=False))
    print(f"params_global.json: {len(json.loads(pj.read_text())['countries'])} countries, {pj.stat().st_size / 1e6:.1f} MB")
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
