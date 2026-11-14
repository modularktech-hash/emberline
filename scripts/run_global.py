#!/usr/bin/env python3
"""Build per-country detection tables and raw calendars from the global archive.

Reads the gzipped country-year CSVs written by ``stage_global.sh`` in
``data/global/`` and applies exactly the same filters as ``build_tables.py``
(it calls the same functions), one file at a time so memory stays bounded.

A country is processed only when its download is complete: every year
2001-2025 for MODIS and 2012-2025 for VIIRS is present as .csv.gz or marked
.absent. Already-built countries are skipped, so this can be re-run as the
download progresses.

Outputs, in data/global_public/:
  detections_<Country>.parquet    filtered point detections (same schema as A1)
  calendar_raw_<Country>.parquet  year x month counts, country + h3_parent scope

Usage: python3 scripts/run_global.py
"""

from __future__ import annotations

import gzip
import shutil
import sys
import tempfile
from pathlib import Path

import h3
import h3.api.basic_int as H3I
import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_tables as bt  # noqa: E402  same filters as the validated A1 path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "global"
OUT = ROOT / "data" / "global_public"
YEARS = {"modis": range(2001, 2026), "viirs-snpp": range(2012, 2026)}


def complete_countries() -> list[str]:
    names = {p.name.split("_", 2)[2].removesuffix(".csv.gz").removesuffix(".csv.absent")
             for p in SRC.glob("*_*_*.csv*")}
    done = []
    for c in sorted(names):
        ok = all((SRC / f"{s}_{y}_{c}.csv.gz").exists() or (SRC / f"{s}_{y}_{c}.csv.absent").exists()
                 for s, ys in YEARS.items() for y in ys)
        has_data = any((SRC / f"{s}_{y}_{c}.csv.gz").exists() for s, ys in YEARS.items() for y in ys)
        if ok and has_data:
            done.append(c)
    return done


def build_one(country: str) -> pl.DataFrame | None:
    frames = []
    with tempfile.TemporaryDirectory() as tmp:
        for source, ys in YEARS.items():
            product = bt.SOURCES[source][0]
            for y in ys:
                gz = SRC / f"{source}_{y}_{country}.csv.gz"
                if not gz.exists():
                    continue
                csv = Path(tmp) / gz.name.removesuffix(".gz")
                with gzip.open(gz, "rb") as fi, open(csv, "wb") as fo:
                    shutil.copyfileobj(fi, fo)
                if bt.count_csv_rows(csv) > 0:
                    # Same filters; only the columns the outputs use are kept,
                    # so the largest countries fit in memory.
                    frames.append(bt.standard_pipeline(bt.scan_archive(csv, product))
                                  .with_columns(bt.lst_hours_expr())
                                  .select("lat", "lon", "acq_ts", "platform", "sensor", "frp_mw", "lst_hours")
                                  .collect())
                csv.unlink()
    if not frames:
        return None
    return pl.concat(frames, how="vertical").sort("acq_ts")


def raw_calendar(country: str, det: pl.DataFrame) -> pl.DataFrame:
    det = det.with_columns(pl.col("acq_ts").dt.year().alias("year"), pl.col("acq_ts").dt.month().alias("month"))
    # Integer cells, converted to strings once per distinct parent: a Python
    # string per detection runs the largest countries out of memory.
    lat, lon = det["lat"].to_numpy(), det["lon"].to_numpy()
    c5 = np.fromiter((H3I.latlng_to_cell(a, b, 5) for a, b in zip(lat, lon)), dtype=np.uint64, count=len(lat))
    u5, inv = np.unique(c5, return_inverse=True)
    names = np.array([h3.int_to_str(H3I.cell_to_parent(int(c), 2)) for c in u5], dtype=object)
    det = det.select("year", "month", "sensor", "frp_mw").with_columns(pl.Series("h3_parent", names[inv], dtype=pl.Utf8))
    cols = ["scope", "key", "year", "month", "sensor", "n_detections", "frp_sum_mw"]
    a = (det.group_by("year", "month", "sensor").agg(pl.len().alias("n_detections"), pl.col("frp_mw").sum().alias("frp_sum_mw"))
         .with_columns(pl.lit("country").alias("scope"), pl.lit(country).alias("key")))
    b = (det.group_by("h3_parent", "year", "month", "sensor").agg(pl.len().alias("n_detections"), pl.col("frp_mw").sum().alias("frp_sum_mw"))
         .with_columns(pl.lit("h3_parent").alias("scope")).rename({"h3_parent": "key"}))
    return pl.concat([a.select(cols), b.select(cols)], how="vertical_relaxed")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [c for c in complete_countries() if not (OUT / f"detections_{c}.parquet").exists()]
    print(f"{len(complete_countries())} complete countries, {len(todo)} to build", flush=True)
    for c in todo:
        det = build_one(c)
        if det is None:
            print(f"  {c}: no detections", flush=True)
            continue
        # Only the columns the fit reads: the full schema costs ~3x the disk and
        # the whole world does not fit next to the archive otherwise.
        det.select("lat", "lon", "acq_ts", "platform", "frp_mw", "lst_hours").write_parquet(
            OUT / f"detections_{c}.parquet", compression="zstd")
        raw_calendar(c, det).write_parquet(OUT / f"calendar_raw_{c}.parquet", compression="zstd")
        print(f"  {c}: {det.height:,} detections", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
