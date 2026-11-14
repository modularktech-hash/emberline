"""Filters that remove detections which are not vegetation fires.

Both MODIS and VIIRS detect *anything hot*.  Gas flares at oil fields,
volcanoes, steel furnaces and offshore platforms all trigger the fire
algorithms, and because they burn continuously they show up as permanent
fires -- a cell that is on fire every single day for 25 years.  Left in,
they dominate any long-run time series of the areas that contain them.

FIRMS labels them in the `type` field, so removing them is cheap.  It is
also the difference between a plot a fire scientist trusts and one they
do not.
"""

from __future__ import annotations

from collections.abc import Iterable

import polars as pl

from .confidence import at_least
from .schema import SOURCE_TYPES, VEGETATION_FIRE


def vegetation_fires_only(frame: pl.DataFrame | pl.LazyFrame):
    """Keep only `type == 0`, dropping volcanoes, static land sources, offshore.

    Rows with a null `source_type` are kept: some NRT feeds omit the field,
    and dropping them would silently discard the most recent data.
    """
    source_type = pl.col("source_type")
    return frame.filter(source_type.is_null() | (source_type == VEGETATION_FIRE))


def exclude_source_types(frame: pl.DataFrame | pl.LazyFrame, types: Iterable[int]):
    """Drop specific FIRMS source types, keeping nulls."""
    unknown = [t for t in types if t not in SOURCE_TYPES]
    if unknown:
        raise ValueError(
            f"unknown FIRMS source type(s) {unknown}; "
            f"known types: {sorted(SOURCE_TYPES)}"
        )
    source_type = pl.col("source_type")
    return frame.filter(source_type.is_null() | ~source_type.is_in(list(types)))


def min_confidence(frame: pl.DataFrame | pl.LazyFrame, minimum: str = "nominal"):
    """Keep detections at or above a confidence class."""
    return frame.filter(at_least(minimum))


def daytime_only(frame: pl.DataFrame | pl.LazyFrame):
    """Keep daytime overpasses.

    The overpass-time argument for harmonizing Aqua against Suomi-NPP rests
    on their shared ~13:30 daytime crossing.  Night detections come from a
    different point in the fire diurnal cycle and from a different orbit
    geometry, so a strict cross-sensor fit should exclude them.
    """
    return frame.filter(pl.col("daynight") == "D")


def bounding_box(
    frame: pl.DataFrame | pl.LazyFrame,
    west: float,
    south: float,
    east: float,
    north: float,
):
    """Clip to a lon/lat bounding box.

    Boxes that cross the antimeridian (west > east) are handled as the union
    of the two halves rather than silently returning nothing.
    """
    if not -90 <= south <= north <= 90:
        raise ValueError(f"invalid latitude range: south={south}, north={north}")

    lat = pl.col("lat")
    lon = pl.col("lon")
    in_lat = lat.is_between(south, north)
    in_lon = (
        (lon >= west) | (lon <= east)
        if west > east
        else lon.is_between(west, east)
    )
    return frame.filter(in_lat & in_lon)


def drop_zero_frp(frame: pl.DataFrame | pl.LazyFrame):
    """Drop detections with missing or non-positive FRP.

    FRP is the harmonization currency, so a detection without it cannot
    participate in the energy comparison even though it is a real fire.
    """
    frp = pl.col("frp_mw")
    return frame.filter(frp.is_not_null() & (frp > 0))


def standard_pipeline(
    frame: pl.DataFrame | pl.LazyFrame,
    *,
    minimum_confidence: str | None = "nominal",
    daytime: bool = True,
    require_frp: bool = True,
):
    """The filter stack used to build the harmonization training set.

    Each step is individually optional so that the effect of every one can
    be reported, rather than presenting a single opaque "cleaned" number.
    """
    frame = vegetation_fires_only(frame)
    if minimum_confidence is not None:
        frame = min_confidence(frame, minimum_confidence)
    if daytime:
        frame = daytime_only(frame)
    if require_frp:
        frame = drop_zero_frp(frame)
    return frame
