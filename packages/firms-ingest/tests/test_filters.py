import polars as pl
import pytest

from firms_ingest import (
    bounding_box,
    daytime_only,
    drop_zero_frp,
    exclude_source_types,
    read_archive,
    standard_pipeline,
    vegetation_fires_only,
)


def test_vegetation_filter_removes_flares_and_volcanoes(modis_csv):
    frame = read_archive(modis_csv, "MCD14ML")
    assert frame.height == 6
    kept = vegetation_fires_only(frame)
    assert kept.height == 4
    assert set(kept["source_type"].to_list()) == {0}


def test_vegetation_filter_keeps_null_source_type():
    """NRT feeds omit `type`; dropping those rows would discard live data."""
    frame = pl.DataFrame({"source_type": [None, 0, 2]}, schema={"source_type": pl.Int8})
    assert vegetation_fires_only(frame).height == 2


def test_exclude_source_types_rejects_unknown_code():
    frame = pl.DataFrame({"source_type": [0]}, schema={"source_type": pl.Int8})
    with pytest.raises(ValueError, match="unknown FIRMS source type"):
        exclude_source_types(frame, [7])


def test_daytime_filter(modis_csv):
    frame = read_archive(modis_csv, "MCD14ML")
    assert daytime_only(frame).height == 5


def test_drop_zero_frp():
    frame = pl.DataFrame({"frp_mw": [0.0, None, 3.4]})
    assert drop_zero_frp(frame)["frp_mw"].to_list() == [3.4]


def test_bounding_box_clips():
    frame = pl.DataFrame({"lat": [-12.5, 45.0], "lon": [133.2, -120.0]})
    kept = bounding_box(frame, west=130.0, south=-20.0, east=140.0, north=-5.0)
    assert kept.height == 1
    assert kept["lat"][0] == -12.5


def test_bounding_box_handles_antimeridian():
    """A box from 170E to 170W must keep both sides, not return nothing."""
    frame = pl.DataFrame({"lat": [60.0, 60.0, 60.0], "lon": [175.0, -175.0, 0.0]})
    kept = bounding_box(frame, west=170.0, south=50.0, east=-170.0, north=70.0)
    assert sorted(kept["lon"].to_list()) == [-175.0, 175.0]


def test_bounding_box_rejects_inverted_latitudes():
    frame = pl.DataFrame({"lat": [0.0], "lon": [0.0]})
    with pytest.raises(ValueError, match="invalid latitude range"):
        bounding_box(frame, west=0.0, south=10.0, east=1.0, north=-10.0)


def test_standard_pipeline_composes(modis_csv):
    frame = read_archive(modis_csv, "MCD14ML")
    kept = standard_pipeline(frame)
    # 6 rows -> drop flare + volcano -> drop low confidence -> drop night
    assert kept.height == 2
    assert set(kept["confidence_class"].to_list()) <= {"nominal", "high"}
    assert set(kept["daynight"].to_list()) == {"D"}


def test_standard_pipeline_steps_are_individually_optional(modis_csv):
    frame = read_archive(modis_csv, "MCD14ML")
    assert standard_pipeline(frame, daytime=False).height == 3
    assert standard_pipeline(frame, minimum_confidence=None).height == 3
