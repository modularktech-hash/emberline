#!/usr/bin/env python3
"""Build the static Parquet tables the app reads (raw, uncorrected).

Usage:
    .venv/bin/python scripts/build_tables.py [Country ...]   # default: Portugal Chile

Inputs: FIRMS country archive CSVs staged by ``scripts/stage_data.sh`` in
``data/raw/archive/`` (``modis_YYYY_<Country>.csv``, ``viirs-snpp_YYYY_<Country>.csv``)
and the ``data/raw/MANIFEST.tsv`` that script writes.

A country is processed only if its archive set is complete per the manifest:
MODIS 2001-2025 and VIIRS Suomi-NPP 2012-2025. Incomplete countries are skipped
and reported. A staged file whose first byte is ``{`` is a FIRMS JSON 404 and
aborts the build; a header-only CSV is valid and contributes zero detections.

Normalization and filtering reuse ``firms_ingest`` unchanged: ``scan_archive``
(products MCD14ML for MODIS, VNP14IMGML for Suomi-NPP) and
``standard_pipeline`` with its defaults: vegetation fires only (type 0),
confidence nominal or high, daytime only, FRP present and > 0.

Nothing here is harmonized. Every count and FRP sum is the raw sensor record.

Outputs in ``data/public/``
--------------------------
detections_<Country>.parquet
    Canonical ``firms_ingest`` columns (lat, lon, acq_ts, sensor, platform,
    frp_mw, ..., source_type) plus ``country`` and ``lst_hours``: local solar
    time of the detection, ``(UTC decimal hour of acq_ts + lon/15) mod 24``,
    computed per detection.

cell_day.parquet  (all countries)
    One row per H3 res-5 cell x UTC acquisition date x sensor x platform.
    Platforms are kept separate (Terra, Aqua, Suomi-NPP).
    Columns: h3, h3_parent (res 2), acq_date, year, month, doy, sensor,
    platform, n_detections, frp_sum_mw, frp_mean_mw, frp_max_mw,
    mean_pixel_area_km2, mean_lst_hours.
    ``mean_lst_hours`` is the circular mean of lst_hours on the 24 h clock, so
    detections at 23:30 and 00:30 average to 00:00, not 12:00.
    Sorted by (h3_parent, acq_date, h3, sensor, platform); row groups of
    50,000 rows, so a reader filters on h3_parent via row-group statistics.

calendar_raw.parquet  (all countries; the uncorrected calendar)
    Columns: scope, key, year, month, sensor, n_detections, frp_sum_mw.
    scope = "country"   -> key is the country name (e.g. "Chile").
    scope = "h3_parent" -> key is the H3 res-2 parent cell id, summed over all
                           processed countries.
    sensor is "MODIS" (Terra + Aqua combined) or "VIIRS" (Suomi-NPP).
    Zero-filled: every (scope, key, sensor) has a row for every month of every
    year that sensor's archive covers (MODIS 2001-2025, VIIRS 2012-2025), so a
    zero is a measured "no detections", never a missing row.
    Sorted by scope, key, sensor, year, month.
"""

from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path

import h3
import polars as pl
import pyarrow.parquet as pq

from firms_ingest import add_h3_cell, scan_archive, standard_pipeline

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
ARCHIVE = RAW / "archive"
MANIFEST = RAW / "MANIFEST.tsv"
OUT = ROOT / "data" / "public"

H3_RES = 5
H3_PARENT_RES = 2
ROW_GROUP_SIZE = 50_000

# FIRMS source slug -> (firms_ingest product, years required for a complete set)
SOURCES: dict[str, tuple[str, range]] = {
    "modis": ("MCD14ML", range(2001, 2026)),
    "viirs-snpp": ("VNP14IMGML", range(2012, 2026)),
}
SENSOR_OF_SOURCE = {"modis": "MODIS", "viirs-snpp": "VIIRS"}


def read_manifest() -> dict[tuple[str, int, str], int]:
    """(source, year, country) -> raw row count, archive entries only."""
    rows: dict[tuple[str, int, str], int] = {}
    with MANIFEST.open() as fh:
        for rec in csv.DictReader(fh, delimiter="\t"):
            if rec["kind"] != "archive":
                continue
            rows[(rec["source"], int(rec["year"]), rec["country"])] = int(rec["rows"])
    return rows


def archive_files(country: str, manifest) -> tuple[list[tuple[str, int, Path]], list[str]]:
    """Every expected file for a country, plus the reasons it is incomplete."""
    files, problems = [], []
    for source, (_, years) in SOURCES.items():
        for year in years:
            path = ARCHIVE / f"{source}_{year}_{country}.csv"
            if (source, year, country) not in manifest:
                problems.append(f"{path.name}: not in MANIFEST.tsv")
            elif not path.exists():
                problems.append(f"{path.name}: missing on disk")
            else:
                files.append((source, year, path))
    return files, problems


def is_json_error(path: Path) -> bool:
    with path.open("rb") as fh:
        return fh.read(1) == b"{"


def count_csv_rows(path: Path) -> int:
    """Data rows in a CSV (header excluded); header-only -> 0."""
    with path.open("rb") as fh:
        lines = sum(1 for line in fh if line.strip())
    return max(lines - 1, 0)


def lst_hours_expr() -> pl.Expr:
    """Local solar time per detection: (UTC decimal hour + lon/15) mod 24."""
    ts = pl.col("acq_ts")
    utc_hours = (
        ts.dt.hour().cast(pl.Float64)
        + ts.dt.minute().cast(pl.Float64) / 60.0
        + ts.dt.second().cast(pl.Float64) / 3600.0
    )
    raw = utc_hours + pl.col("lon") / 15.0
    # Double mod keeps the result in [0, 24) whatever sign convention % uses.
    return (((raw % 24.0) + 24.0) % 24.0).alias("lst_hours")


def build_country(country: str, files: list[tuple[str, int, Path]], manifest) -> tuple[pl.DataFrame, list[dict]]:
    frames, stats = [], []
    for source, year, path in files:
        product_name = SOURCES[source][0]
        raw_rows = count_csv_rows(path)
        if raw_rows == 0:
            # Header-only CSV: valid, zero detections. Polars cannot infer
            # dtypes from a header alone, so skip the scan rather than guess.
            kept = 0
        else:
            lf = standard_pipeline(scan_archive(path, product_name))
            df = lf.collect()
            kept = df.height
            frames.append(df)
        stats.append(
            {
                "country": country,
                "source": source,
                "year": year,
                "manifest_rows": manifest[(source, year, country)],
                "csv_rows": raw_rows,
                "filtered_rows": kept,
            }
        )
    det = pl.concat(frames, how="vertical")
    det = det.with_columns(pl.lit(country).alias("country"), lst_hours_expr()).sort("acq_ts")
    return det, stats


def build_cell_day(det: pl.DataFrame) -> pl.DataFrame:
    det = add_h3_cell(det, resolution=H3_RES, column="h3")
    parents = {c: h3.cell_to_parent(c, H3_PARENT_RES) for c in det["h3"].unique().to_list()}
    det = det.with_columns(
        pl.col("h3").replace_strict(parents, return_dtype=pl.Utf8).alias("h3_parent"),
        pl.col("acq_ts").dt.date().alias("acq_date"),
        (pl.col("lst_hours") * (2 * math.pi / 24.0)).alias("__theta"),
    )
    keys = ["h3", "h3_parent", "acq_date", "sensor", "platform"]
    cell_day = (
        det.group_by(keys)
        .agg(
            pl.len().cast(pl.Int32).alias("n_detections"),
            pl.col("frp_mw").sum().alias("frp_sum_mw"),
            pl.col("frp_mw").mean().alias("frp_mean_mw"),
            pl.col("frp_mw").max().alias("frp_max_mw"),
            pl.col("pixel_area_km2").mean().alias("mean_pixel_area_km2"),
            pl.col("__theta").sin().mean().alias("__s"),
            pl.col("__theta").cos().mean().alias("__c"),
        )
        .with_columns(
            (
                ((pl.arctan2(pl.col("__s"), pl.col("__c")) * (24.0 / (2 * math.pi)) % 24.0) + 24.0)
                % 24.0
            ).alias("mean_lst_hours"),
            pl.col("acq_date").dt.year().cast(pl.Int16).alias("year"),
            pl.col("acq_date").dt.month().cast(pl.Int8).alias("month"),
            pl.col("acq_date").dt.ordinal_day().cast(pl.Int16).alias("doy"),
        )
        .sort(["h3_parent", "acq_date", "h3", "sensor", "platform"])
        .select(
            "h3", "h3_parent", "acq_date", "year", "month", "doy", "sensor", "platform",
            "n_detections", "frp_sum_mw", "frp_mean_mw", "frp_max_mw",
            "mean_pixel_area_km2", "mean_lst_hours",
        )
    )
    return cell_day


def build_calendar(cell_day: pl.DataFrame, det_country: pl.DataFrame) -> pl.DataFrame:
    """Raw year x month counts and FRP by sensor, per country and per h3_parent."""
    by_country = (
        det_country.with_columns(
            pl.col("acq_ts").dt.year().cast(pl.Int16).alias("year"),
            pl.col("acq_ts").dt.month().cast(pl.Int8).alias("month"),
        )
        .group_by("country", "year", "month", "sensor")
        .agg(pl.len().cast(pl.Int64).alias("n_detections"), pl.col("frp_mw").sum().alias("frp_sum_mw"))
        .rename({"country": "key"})
        .with_columns(pl.lit("country").alias("scope"))
    )
    by_parent = (
        cell_day.group_by("h3_parent", "year", "month", "sensor")
        .agg(pl.col("n_detections").sum().cast(pl.Int64), pl.col("frp_sum_mw").sum())
        .rename({"h3_parent": "key"})
        .with_columns(pl.lit("h3_parent").alias("scope"))
    )
    cols = ["scope", "key", "year", "month", "sensor", "n_detections", "frp_sum_mw"]
    observed = pl.concat([by_country.select(cols), by_parent.select(cols)])

    # Zero-fill each (scope, key, sensor) over its sensor's archive years.
    sensor_years = pl.concat(
        [
            pl.DataFrame({"sensor": SENSOR_OF_SOURCE[s], "year": list(yrs)}, schema={"sensor": pl.Utf8, "year": pl.Int16})
            for s, (_, yrs) in SOURCES.items()
        ]
    )
    months = pl.DataFrame({"month": list(range(1, 13))}, schema={"month": pl.Int8})
    keys = pl.concat(
        [
            observed.select("scope", "key").unique(),
        ]
    ).join(pl.DataFrame({"sensor": list(SENSOR_OF_SOURCE.values())}), how="cross")
    grid = keys.join(sensor_years, on="sensor").join(months, how="cross")
    out = (
        grid.join(observed, on=["scope", "key", "sensor", "year", "month"], how="left")
        .with_columns(pl.col("n_detections").fill_null(0), pl.col("frp_sum_mw").fill_null(0.0))
        .sort("scope", "key", "sensor", "year", "month")
        .select(cols)
    )
    # Zero-fill must not drop observed rows (e.g. a year outside the grid).
    assert out["n_detections"].sum() == observed["n_detections"].sum(), "calendar zero-fill lost rows"
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("countries", nargs="*", default=["Portugal", "Chile"])
    args = ap.parse_args(argv)

    manifest = read_manifest()
    OUT.mkdir(parents=True, exist_ok=True)

    plan, skipped = {}, {}
    for country in args.countries:
        files, problems = archive_files(country, manifest)
        if problems:
            skipped[country] = problems
        else:
            plan[country] = files
    for country, problems in skipped.items():
        print(f"SKIP {country}: incomplete archive ({len(problems)} problems), e.g. {problems[:3]}")
    if not plan:
        print("nothing to build", file=sys.stderr)
        return 1

    json_errors = [p for files in plan.values() for _, _, p in files if is_json_error(p)]
    if json_errors:
        for p in json_errors:
            print(f"ERROR FIRMS JSON 404 staged as CSV: {p}", file=sys.stderr)
        return 2

    all_det, all_stats = [], []
    for country, files in plan.items():
        det, stats = build_country(country, files, manifest)
        path = OUT / f"detections_{country}.parquet"
        det.write_parquet(path, compression="zstd")
        print(f"wrote {path.relative_to(ROOT)}: {det.height:,} detections")
        all_det.append(det)
        all_stats.extend(stats)

    det = pl.concat(all_det, how="vertical")
    cell_day = build_cell_day(det)
    cd_path = OUT / "cell_day.parquet"
    cell_day.write_parquet(cd_path, compression="zstd", row_group_size=ROW_GROUP_SIZE, statistics=True)
    print(f"wrote {cd_path.relative_to(ROOT)}: {cell_day.height:,} rows, "
          f"{pq.ParquetFile(cd_path).num_row_groups} row groups")

    calendar = build_calendar(cell_day, det)
    cal_path = OUT / "calendar_raw.parquet"
    calendar.write_parquet(cal_path, compression="zstd", statistics=True)
    print(f"wrote {cal_path.relative_to(ROOT)}: {calendar.height:,} rows")

    stats = pl.DataFrame(all_stats)
    summary = (
        stats.group_by("country", "source")
        .agg(pl.col("manifest_rows").sum(), pl.col("csv_rows").sum(), pl.col("filtered_rows").sum())
        .sort("country", "source")
    )
    print("\nraw vs filtered, per country x source:")
    with pl.Config(tbl_rows=50, tbl_width_chars=200):
        print(summary)
    bad = stats.filter(
        (pl.col("filtered_rows") > pl.col("csv_rows")) | (pl.col("csv_rows") != pl.col("manifest_rows"))
    )
    if bad.height:
        print("FAIL: per-file count mismatch:\n", bad, file=sys.stderr)
        return 3
    stats.write_csv(OUT / "build_counts.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
