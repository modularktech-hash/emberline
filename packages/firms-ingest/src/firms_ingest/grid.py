"""Aggregate detections onto Uber's H3 hexagonal grid.

The web app never queries raw detections.  It queries a cell-day-sensor
table small enough to sit in Postgres and answer an AOI query in
milliseconds.  This module builds that table.

Hexagons rather than a lat/lon square grid because square cells shrink
toward the poles -- a 1-degree cell is ~12,300 km^2 at the equator and
~2,100 km^2 at 80 degrees north.  Comparing fire activity per cell across
latitudes on such a grid compares cells of wildly different size, which
matters a great deal for a record dominated by boreal and tropical
burning.  H3 cells stay within a few percent of each other in area.

Resolution guide (approximate mean cell area):
    r3   12,393 km^2      continental overview
    r4    1,770 km^2      default for the 25-year record
    r5      253 km^2      regional detail
    r6       36 km^2      near the MODIS footprint; mostly empty cells
"""

from __future__ import annotations

import polars as pl

__all__ = [
    "H3_MEAN_AREA_KM2",
    "add_h3_cell",
    "aggregate_cell_day",
    "cells_for_bbox",
    "day_of_year_climatology",
]

#: Mean cell area in km^2 by H3 resolution, for normalizing to a density.
H3_MEAN_AREA_KM2: dict[int, float] = {
    0: 4_357_449.416,
    1: 609_788.442,
    2: 86_801.780,
    3: 12_393.435,
    4: 1_770.348,
    5: 252.904,
    6: 36.129,
    7: 5.161,
    8: 0.737,
}


def _require_h3():
    try:
        import h3
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise ImportError(
            "H3 gridding requires the `h3` package: pip install 'firms-ingest[grid]'"
        ) from exc
    return h3


def add_h3_cell(
    frame: pl.DataFrame, resolution: int = 4, column: str = "h3"
) -> pl.DataFrame:
    """Attach the H3 cell index for each detection's centroid."""
    if not 0 <= resolution <= 15:
        raise ValueError(f"H3 resolution must be 0-15, got {resolution}")
    h3 = _require_h3()

    if frame.is_empty():
        return frame.with_columns(pl.lit(None, dtype=pl.Utf8).alias(column))

    lats = frame["lat"].to_list()
    lons = frame["lon"].to_list()
    cells = [
        None if lat is None or lon is None else h3.latlng_to_cell(lat, lon, resolution)
        for lat, lon in zip(lats, lons)
    ]
    return frame.with_columns(pl.Series(column, cells, dtype=pl.Utf8))


def aggregate_cell_day(
    frame: pl.DataFrame,
    *,
    resolution: int = 4,
    cell_column: str = "h3",
    by_platform: bool = False,
) -> pl.DataFrame:
    """Reduce detections to one row per cell x day x sensor.

    This is the table the application reads.  It keeps both a count and the
    FRP aggregates, because the whole argument of the project is that the
    count is not comparable across the sensor boundary while the energy is.
    Keeping both lets the UI show the raw/harmonized toggle honestly rather
    than hiding the uncorrected series.
    """
    if cell_column not in frame.columns:
        frame = add_h3_cell(frame, resolution=resolution, column=cell_column)

    keys = [cell_column, "acq_date", "sensor"]
    if by_platform:
        keys.append("platform")

    return (
        frame.with_columns(
            pl.col("acq_ts").dt.date().alias("acq_date"),
        )
        .group_by(keys)
        .agg(
            pl.len().alias("n_detections"),
            pl.col("frp_mw").sum().alias("frp_sum_mw"),
            pl.col("frp_mw").mean().alias("frp_mean_mw"),
            pl.col("frp_mw").max().alias("frp_max_mw"),
            pl.col("pixel_area_km2").sum().alias("observed_area_km2"),
            pl.col("platform").n_unique().alias("n_platforms"),
        )
        .with_columns(
            pl.col("acq_date").dt.ordinal_day().cast(pl.Int16).alias("doy"),
            pl.col("acq_date").dt.year().cast(pl.Int16).alias("year"),
            pl.lit(resolution, dtype=pl.Int8).alias("h3_resolution"),
        )
        .sort(keys)
    )


def cells_for_bbox(
    west: float, south: float, east: float, north: float, resolution: int = 4
) -> list[str]:
    """Every H3 cell intersecting a lon/lat bounding box.

    Used to turn a user-drawn AOI into the cell list the query filters on.
    """
    h3 = _require_h3()
    if west > east:
        raise ValueError(
            "antimeridian-crossing boxes must be split into two before gridding"
        )
    outline = h3.LatLngPoly(
        [(south, west), (south, east), (north, east), (north, west)]
    )
    return list(h3.h3shape_to_cells(outline, resolution))


def day_of_year_climatology(
    cell_day: pl.DataFrame,
    *,
    value_column: str = "frp_sum_mw",
    percentiles: tuple[float, ...] = (0.5, 0.75, 0.9, 0.95),
    smoothing_days: int = 15,
) -> pl.DataFrame:
    """Per-cell, per-day-of-year percentile bands -- the anomaly baseline.

    A raw day-of-year climatology from 25 samples is extremely noisy, so
    each day borrows from a centred window of neighbouring days.  The window
    wraps around the new year, otherwise January and December get a
    systematically thinner sample than the rest of the calendar -- which in
    the Southern Hemisphere is the middle of the fire season.
    """
    if smoothing_days < 1 or smoothing_days % 2 == 0:
        raise ValueError("smoothing_days must be a positive odd number")
    if not all(0 < p < 1 for p in percentiles):
        raise ValueError("percentiles must lie strictly between 0 and 1")

    half = smoothing_days // 2
    # Replicate each observation onto every day-of-year whose window covers
    # it, so a plain group_by then computes the windowed percentile.
    offsets = pl.int_range(-half, half + 1, dtype=pl.Int16)
    widened = (
        cell_day.select("h3", "doy", value_column)
        .with_columns(offsets.implode().alias("__offset"))
        # The offset list is never empty, so the null-vs-empty distinction is
        # moot here; set it explicitly to stay stable across the Polars 2.0 change.
        .explode("__offset", empty_as_null=False)
        .with_columns(
            (((pl.col("doy") + pl.col("__offset") - 1) % 366) + 1)
            .cast(pl.Int16)
            .alias("window_doy")
        )
    )

    aggregations = [
        pl.col(value_column).quantile(p).alias(f"p{int(p * 100)}") for p in percentiles
    ]
    aggregations += [
        pl.col(value_column).mean().alias("mean"),
        pl.len().alias("n_samples"),
    ]

    return (
        widened.group_by("h3", "window_doy")
        .agg(aggregations)
        .rename({"window_doy": "doy"})
        .sort("h3", "doy")
    )
