from datetime import datetime, timedelta, timezone

import numpy as np
import polars as pl
import pytest

from firms_ingest import assign_events, summarize_events
from firms_ingest.cluster import EARTH_RADIUS_KM, to_cartesian_km

BASE = datetime(2019, 8, 14, 12, 0, tzinfo=timezone.utc)


def _detections(rows):
    """rows: (lat, lon, minutes_after_base, frp, platform, sensor)"""
    return pl.DataFrame(
        {
            "lat": [r[0] for r in rows],
            "lon": [r[1] for r in rows],
            "acq_ts": [BASE + timedelta(minutes=r[2]) for r in rows],
            "frp_mw": [r[3] for r in rows],
            "platform": [r[4] for r in rows],
            "sensor": [r[5] for r in rows],
            "pixel_area_km2": [1.0] * len(rows),
        },
        schema_overrides={"acq_ts": pl.Datetime("us", "UTC")},
    )


def test_cartesian_projection_preserves_distance():
    """Chord distance must track great-circle distance at fire scales."""
    pts = to_cartesian_km(np.array([0.0, 0.0]), np.array([0.0, 0.01]))
    chord = float(np.linalg.norm(pts[0] - pts[1]))
    great_circle = np.radians(0.01) * EARTH_RADIUS_KM
    assert chord == pytest.approx(great_circle, rel=1e-6)


def test_four_platforms_seeing_one_fire_collapse_to_one_event():
    """The core overcounting problem: one fire, four satellites, one event."""
    frame = _detections(
        [
            (-12.500, 133.200, 0, 40.0, "Terra", "MODIS"),
            (-12.502, 133.201, 180, 55.0, "Aqua", "MODIS"),
            (-12.501, 133.2005, 181, 9.0, "Suomi-NPP", "VIIRS"),
            (-12.5015, 133.2015, 182, 7.5, "NOAA-20", "VIIRS"),
        ]
    )
    labelled = assign_events(frame)
    assert labelled["event_id"].n_unique() == 1

    events = summarize_events(labelled)
    assert events.height == 1
    row = events.row(0, named=True)
    assert row["n_detections"] == 4
    assert row["n_platforms"] == 4
    assert row["sensors"] == "MODIS+VIIRS"
    assert row["frp_sum_mw"] == pytest.approx(111.5)
    assert row["frp_max_mw"] == pytest.approx(55.0)


def test_distant_fires_stay_separate():
    frame = _detections(
        [
            (-12.500, 133.200, 0, 40.0, "Terra", "MODIS"),
            (-12.900, 133.900, 5, 40.0, "Terra", "MODIS"),
        ]
    )
    assert assign_events(frame)["event_id"].n_unique() == 2


def test_same_place_different_week_is_a_different_event():
    frame = _detections(
        [
            (-12.500, 133.200, 0, 40.0, "Terra", "MODIS"),
            (-12.500, 133.200, 60 * 24 * 7, 40.0, "Terra", "MODIS"),
        ]
    )
    assert assign_events(frame)["event_id"].n_unique() == 2


def test_clustering_joins_across_the_antimeridian():
    """179.99E and 179.99W are ~1 km apart, not 360 degrees apart."""
    frame = _detections(
        [
            (65.0, 179.995, 0, 10.0, "Terra", "MODIS"),
            (65.0, -179.995, 10, 10.0, "Aqua", "MODIS"),
        ]
    )
    assert assign_events(frame)["event_id"].n_unique() == 1


def test_frp_weighted_centroid_leans_toward_the_hot_detection():
    frame = _detections(
        [
            (0.0, 0.0, 0, 1.0, "Terra", "MODIS"),
            (0.01, 0.0, 10, 99.0, "Aqua", "MODIS"),
        ]
    )
    events = summarize_events(assign_events(frame))
    assert events["lat"][0] == pytest.approx(0.0099)


def test_event_ids_are_unique_across_partitions():
    frame = _detections(
        [
            (-12.500, 133.200, 0, 40.0, "Terra", "MODIS"),
            (-12.501, 133.201, 10, 40.0, "Aqua", "MODIS"),
            (45.000, -120.000, 0, 40.0, "Terra", "MODIS"),
            (45.001, -120.001, 10, 40.0, "Aqua", "MODIS"),
        ]
    ).with_columns(pl.Series("region", ["au", "au", "us", "us"]))

    labelled = assign_events(frame, partition_by=["region"])
    assert labelled["event_id"].n_unique() == 2
    per_region = labelled.group_by("region").agg(pl.col("event_id").n_unique())
    assert per_region["event_id"].to_list() == [1, 1]


def test_partition_by_unknown_column_raises():
    frame = _detections([(0.0, 0.0, 0, 1.0, "Terra", "MODIS")])
    with pytest.raises(ValueError, match="partition_by column"):
        assign_events(frame, partition_by=["nope"])


def test_empty_frame_gets_an_event_column():
    frame = _detections([]).clear()
    assert "event_id" in assign_events(frame).columns


def test_summarize_requires_clustering_first():
    frame = _detections([(0.0, 0.0, 0, 1.0, "Terra", "MODIS")])
    with pytest.raises(ValueError, match="run assign_events"):
        summarize_events(frame)


def test_invalid_eps_raises():
    frame = _detections([(0.0, 0.0, 0, 1.0, "Terra", "MODIS")])
    with pytest.raises(ValueError, match="must be positive"):
        assign_events(frame, eps_km=0)
