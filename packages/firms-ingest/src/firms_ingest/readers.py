"""Readers that normalize raw FIRMS archive CSVs into the canonical frame."""

from __future__ import annotations

import os
from collections.abc import Iterable, Sequence
from pathlib import Path

import polars as pl

from .confidence import confidence_class_expr
from .schema import (
    CANONICAL_COLUMNS,
    CANONICAL_SCHEMA,
    PLATFORM_ALIASES,
    ProductSpec,
    empty_frame,
    product,
)

__all__ = ["read_archive", "scan_archive", "normalize", "read_many"]


def _acq_timestamp_expr() -> pl.Expr:
    """Combine FIRMS `acq_date` and `acq_time` into a UTC timestamp.

    `acq_time` is HHMM with the leading zero dropped when the file stores it
    as an integer, so 525 means 05:25.  Zero-padding before parsing is what
    keeps early-morning overpasses from landing in the wrong hour.
    """
    date = pl.col("acq_date").cast(pl.Utf8).str.strip_chars().str.slice(0, 10)
    padded = (
        pl.col("acq_time")
        .cast(pl.Utf8)
        .str.strip_chars()
        .str.replace_all(":", "")
        .str.pad_start(4, "0")
    )
    return (
        pl.concat_str([date, pl.lit(" "), padded])
        .str.strptime(pl.Datetime(time_unit="us"), "%Y-%m-%d %H%M", strict=False)
        .dt.replace_time_zone("UTC")
        .alias("acq_ts")
    )


def _platform_expr(spec: ProductSpec, present: Sequence[str]) -> pl.Expr:
    """Resolve the canonical platform name.

    Single-satellite products carry the platform in the filename rather than
    a column, so the spec supplies it as a constant.
    """
    constant = spec.constants.get("platform")
    if constant is not None or "platform" not in present:
        if constant is None:
            raise ValueError(
                f"{spec.name}: no `satellite` column and no platform constant"
            )
        return pl.lit(constant, dtype=pl.Utf8).alias("platform")

    return (
        pl.col("platform")
        .cast(pl.Utf8)
        .str.strip_chars()
        .str.to_uppercase()
        .replace_strict(PLATFORM_ALIASES, default=None, return_dtype=pl.Utf8)
        .alias("platform")
    )


def _pixel_area_expr(spec: ProductSpec, present: Sequence[str]) -> pl.Expr:
    """Footprint area in km^2.

    MODIS footprints grow from ~1 km at nadir to several km at the swath
    edge, and the archive reports that growth in `scan`/`track`.  Using the
    reported dimensions rather than the nominal area is what makes FRP
    density comparable between a nadir VIIRS pixel and an off-nadir MODIS one.
    """
    if "scan_km" in present and "track_km" in present:
        scan = pl.col("scan_km").cast(pl.Float64)
        track = pl.col("track_km").cast(pl.Float64)
        area = scan * track
        return (
            pl.when(area.is_not_null() & (area > 0))
            .then(area)
            .otherwise(pl.lit(spec.nominal_pixel_area_km2))
            .alias("pixel_area_km2")
        )
    return pl.lit(spec.nominal_pixel_area_km2, dtype=pl.Float64).alias(
        "pixel_area_km2"
    )


def normalize(frame: pl.LazyFrame, spec: ProductSpec) -> pl.LazyFrame:
    """Map an already-loaded raw frame onto the canonical schema.

    Separated from the file readers so the same normalization applies to
    archive CSVs and to NRT API responses.
    """
    raw_columns = frame.collect_schema().names()
    frame = frame.rename(spec.rename_map(raw_columns))
    present = frame.collect_schema().names()

    if "acq_date" not in present or "acq_time" not in present:
        missing = {"acq_date", "acq_time"} - set(present)
        raise ValueError(f"{spec.name}: missing required column(s) {sorted(missing)}")

    derived = [
        _acq_timestamp_expr(),
        _platform_expr(spec, present),
        _pixel_area_expr(spec, present),
        pl.lit(spec.sensor, dtype=pl.Utf8).alias("sensor"),
    ]

    # Optional columns are filled with typed nulls so that concatenating
    # products with different column sets stays a cheap vertical stack.
    for name in ("brightness_k", "bright_bg_k", "scan_km", "track_km", "frp_mw"):
        if name not in present:
            derived.append(pl.lit(None, dtype=pl.Float64).alias(name))
    if "daynight" not in present:
        derived.append(pl.lit(None, dtype=pl.Utf8).alias("daynight"))
    if "source_type" not in present:
        derived.append(pl.lit(None, dtype=pl.Int8).alias("source_type"))
    if "confidence_raw" not in present:
        derived.append(pl.lit(None, dtype=pl.Utf8).alias("confidence_raw"))

    frame = frame.with_columns(derived)
    frame = frame.with_columns(
        confidence_class_expr(spec.sensor).alias("confidence_class"),
        (
            pl.col("frp_mw").cast(pl.Float64) / pl.col("pixel_area_km2")
        ).alias("frp_density_mw_km2"),
        pl.col("daynight").cast(pl.Utf8).str.strip_chars().str.to_uppercase().str.slice(0, 1),
    )

    return frame.select(
        [pl.col(name).cast(dtype) for name, dtype in CANONICAL_SCHEMA.items()]
    )


def scan_archive(path: str | os.PathLike[str], product_name: str) -> pl.LazyFrame:
    """Lazily scan one FIRMS archive CSV into the canonical schema.

    Lazy by default: the full MODIS archive is hundreds of millions of rows,
    and every useful operation on it is a filter or an aggregation that
    should be pushed down rather than materialized.
    """
    spec = product(product_name)
    frame = pl.scan_csv(
        path,
        infer_schema_length=10_000,
        try_parse_dates=False,  # acq_date/acq_time are parsed together below
        ignore_errors=False,
    )
    return normalize(frame, spec)


def read_archive(path: str | os.PathLike[str], product_name: str) -> pl.DataFrame:
    """Eagerly read one FIRMS archive CSV into the canonical schema."""
    return scan_archive(path, product_name).collect()


def read_many(
    paths: Iterable[str | os.PathLike[str]], product_name: str
) -> pl.DataFrame:
    """Read and concatenate many monthly files of the same product."""
    spec = product(product_name)
    frames = [scan_archive(Path(p), spec.name) for p in paths]
    if not frames:
        return empty_frame()
    return pl.concat(frames, how="vertical").collect().select(CANONICAL_COLUMNS)
