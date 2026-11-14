"""Collapse raw detections into fire events with space-time DBSCAN.

One real fire burning for an afternoon is observed separately by Terra,
Aqua, Suomi-NPP and NOAA-20, and by several adjacent pixels within each
overpass.  Counting raw detections therefore counts satellites and pixels,
not fires -- and it counts them *differently* before and after 2012, which
is exactly the artifact the harmonization exists to remove.

Clustering in space and time collapses those observations into single
events, which is also the unit a land manager actually thinks in.

Geometry
--------
Latitude/longitude are projected to 3D Cartesian coordinates on a sphere
(kilometres) rather than treated as a flat plane.  Chord distance matches
great-circle distance to better than 0.1% at the scales that matter here,
and unlike an equirectangular projection it does not distort near the
poles or tear at the antimeridian -- both of which contain real fire
activity (boreal Siberia, Russian Far East).

Time becomes a fourth axis, rescaled so that `eps_hours` of separation
costs the same as `eps_km` of separation.  The clustering is then a plain
Euclidean DBSCAN in 4D.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import polars as pl

EARTH_RADIUS_KM = 6371.0088

__all__ = ["assign_events", "summarize_events", "to_cartesian_km"]


def to_cartesian_km(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Project WGS84 degrees onto 3D Cartesian kilometres on a sphere."""
    lat_rad = np.radians(lat)
    lon_rad = np.radians(lon)
    cos_lat = np.cos(lat_rad)
    return np.column_stack(
        (
            EARTH_RADIUS_KM * cos_lat * np.cos(lon_rad),
            EARTH_RADIUS_KM * cos_lat * np.sin(lon_rad),
            EARTH_RADIUS_KM * np.sin(lat_rad),
        )
    )


def _cluster_block(
    lat: np.ndarray, lon: np.ndarray, epoch_hours: np.ndarray, eps_km: float, eps_hours: float, min_samples: int
) -> np.ndarray:
    from sklearn.cluster import DBSCAN  # imported lazily: optional dependency

    space = to_cartesian_km(lat, lon)
    # Rescale time so eps_hours of separation is worth eps_km of distance.
    time_axis = (epoch_hours * (eps_km / eps_hours)).reshape(-1, 1)
    features = np.hstack((space, time_axis))

    labels = DBSCAN(eps=eps_km, min_samples=min_samples, metric="euclidean").fit_predict(
        features
    )
    return labels


def assign_events(
    frame: pl.DataFrame,
    *,
    eps_km: float = 1.5,
    eps_hours: float = 12.0,
    min_samples: int = 1,
    partition_by: Sequence[str] | None = None,
    event_column: str = "event_id",
) -> pl.DataFrame:
    """Attach an event id to every detection.

    Parameters
    ----------
    eps_km:
        Neighbourhood radius in kilometres.  The default of 1.5 km is just
        over one MODIS nadir footprint, so adjacent MODIS pixels and the
        cluster of VIIRS pixels inside them join the same event.
    eps_hours:
        Neighbourhood radius in time.  The default of 12 hours joins the
        morning and afternoon overpasses of the same day without chaining
        a fire across a week.
    min_samples:
        DBSCAN's density threshold.  Defaults to 1 so that a genuine
        single-detection fire becomes its own event rather than noise;
        raise it to suppress isolated detections.
    partition_by:
        Optional columns to cluster within independently.  DBSCAN scales
        poorly on tens of millions of points at once, so partitioning by a
        coarse spatial cell makes continental runs tractable.  The cost is
        that an event straddling a partition boundary is split in two, so
        partition on a scale far larger than `eps_km`.

    Event ids are globally unique across partitions.
    """
    if eps_km <= 0 or eps_hours <= 0:
        raise ValueError("eps_km and eps_hours must be positive")
    if frame.is_empty():
        return frame.with_columns(pl.lit(None, dtype=pl.Int64).alias(event_column))

    partition_by = list(partition_by or [])
    missing = [c for c in partition_by if c not in frame.columns]
    if missing:
        raise ValueError(f"partition_by column(s) not in frame: {missing}")

    # A stable row index lets us scatter labels back in the original order.
    indexed = frame.with_row_index("__row")
    epoch = (
        indexed.select(
            pl.col("acq_ts").dt.timestamp("ms").cast(pl.Float64) / 3_600_000.0
        )
        .to_series()
        .to_numpy()
    )
    indexed = indexed.with_columns(pl.Series("__epoch_hours", epoch))

    blocks = (
        indexed.partition_by(partition_by, maintain_order=True)
        if partition_by
        else [indexed]
    )

    labels_out = np.empty(indexed.height, dtype=np.int64)
    next_id = 0
    for block in blocks:
        rows = block["__row"].to_numpy()
        labels = _cluster_block(
            block["lat"].to_numpy(),
            block["lon"].to_numpy(),
            block["__epoch_hours"].to_numpy(),
            eps_km,
            eps_hours,
            min_samples,
        )
        # DBSCAN marks noise as -1; keep it as -1 rather than folding it into
        # a real event, but offset everything else to stay globally unique.
        shifted = np.where(labels < 0, -1, labels + next_id)
        labels_out[rows] = shifted
        if labels.max(initial=-1) >= 0:
            next_id += int(labels.max()) + 1

    return (
        indexed.with_columns(pl.Series(event_column, labels_out))
        .drop("__row", "__epoch_hours")
    )


def summarize_events(
    frame: pl.DataFrame, event_column: str = "event_id"
) -> pl.DataFrame:
    """Reduce clustered detections to one row per fire event.

    The centroid is FRP-weighted, so it sits at the energetic centre of the
    fire rather than at the centre of wherever the satellites happened to
    get clear views.
    """
    if event_column not in frame.columns:
        raise ValueError(
            f"{event_column!r} not found; run assign_events() first"
        )

    weight = pl.col("frp_mw").fill_null(0.0)
    total_weight = weight.sum()

    return (
        frame.filter(pl.col(event_column) >= 0)
        .group_by(event_column)
        .agg(
            pl.len().alias("n_detections"),
            pl.col("platform").n_unique().alias("n_platforms"),
            pl.col("sensor").unique().sort().str.join("+").alias("sensors"),
            pl.col("acq_ts").min().alias("first_seen"),
            pl.col("acq_ts").max().alias("last_seen"),
            # Fall back to an unweighted mean when every FRP is null or zero.
            pl.when(total_weight > 0)
            .then((pl.col("lat") * weight).sum() / total_weight)
            .otherwise(pl.col("lat").mean())
            .alias("lat"),
            pl.when(total_weight > 0)
            .then((pl.col("lon") * weight).sum() / total_weight)
            .otherwise(pl.col("lon").mean())
            .alias("lon"),
            pl.col("frp_mw").sum().alias("frp_sum_mw"),
            pl.col("frp_mw").max().alias("frp_max_mw"),
            pl.col("frp_mw").mean().alias("frp_mean_mw"),
            pl.col("pixel_area_km2").sum().alias("observed_area_km2"),
        )
        .sort("first_seen", event_column)
    )
