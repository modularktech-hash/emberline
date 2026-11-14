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
                    frames.append(bt.standard_pipeline(bt.scan_archive(csv, product)).collect())
                csv.unlink()
    if not frames:
        return None
    det = pl.concat(frames, how="vertical")
    return det.with_columns(pl.lit(country).alias("country"), bt.lst_hours_expr()).sort("acq_ts")


def raw_calendar(country: str, det: pl.DataFrame) -> pl.DataFrame:
    det = det.with_columns(pl.col("acq_ts").dt.year().alias("year"), pl.col("acq_ts").dt.month().alias("month"))
    parents = [h3.cell_to_parent(h3.latlng_to_cell(a, b, 5), 2)
               for a, b in zip(det["lat"].to_numpy(), det["lon"].to_numpy())]
    det = det.with_columns(pl.Series("h3_parent", parents))
    cols = ["scope", "key", "year", "month", "sensor", "n_detections", "frp_sum_mw"]
    a = (det.group_by("year", "month", "sensor").agg(pl.len().alias("n_detections"), pl.col("frp_mw").sum().alias("frp_sum_mw"))
         .with_columns(pl.lit("country").alias("scope"), pl.lit(country).alias("key")))
    b = (det.group_by("h3_parent", "year", "month", "sensor").agg(pl.len().alias("n_detections"), pl.col("frp_mw").sum().alias("frp_sum_mw"))
         .with_columns(pl.lit("h3_parent").alias("scope")).rename({"h3_parent": "key"}))
    observed = pl.concat([a.select(cols), b.select(cols)], how="vertical_relaxed")
    # A valid archive with no detections means zero; an absent archive means
    # unknown. The original global builder dropped all zero months, unlike A1.
    coverage = pl.DataFrame(
        [(bt.SENSOR_OF_SOURCE[s], y) for s, ys in YEARS.items() for y in ys
         if (SRC / f"{s}_{y}_{country}.csv.gz").exists()],
        schema={"sensor": pl.String, "year": observed.schema["year"]}, orient="row",
    )
    months = pl.DataFrame({"month": range(1, 13)}, schema={"month": observed.schema["month"]})
    grid = observed.select("scope", "key").unique().join(coverage, how="cross").join(months, how="cross")
    result = (grid.join(observed, on=["scope", "key", "sensor", "year", "month"], how="left")
              .with_columns(pl.col("n_detections").fill_null(0), pl.col("frp_sum_mw").fill_null(0.0))
              .select(cols).sort("scope", "key", "sensor", "year", "month"))
    assert result["n_detections"].sum() == observed["n_detections"].sum(), "calendar lost detections"
    return result


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [c for c in complete_countries() if not all(
        (OUT / f"{kind}_{c}.parquet").exists()
        for kind in ("detections", "calendar_raw")
    )]
    print(f"{len(complete_countries())} complete countries, {len(todo)} to build", flush=True)
    for c in todo:
        det = build_one(c)
        if det is None:
            print(f"  {c}: no detections", flush=True)
            continue
        # Only the columns the fit reads: the full schema costs ~3x the disk and
        # the whole world does not fit next to the archive otherwise.
        detections_path = OUT / f"detections_{c}.parquet"
        calendar_path = OUT / f"calendar_raw_{c}.parquet"
        det.select("lat", "lon", "acq_ts", "platform", "frp_mw", "lst_hours").write_parquet(
            detections_path.with_suffix(".parquet.tmp"), compression="zstd")
        raw_calendar(c, det).write_parquet(calendar_path.with_suffix(".parquet.tmp"), compression="zstd")
        detections_path.with_suffix(".parquet.tmp").replace(detections_path)
        calendar_path.with_suffix(".parquet.tmp").replace(calendar_path)
        print(f"  {c}: {det.height:,} detections", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
