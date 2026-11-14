from datetime import datetime, timezone

import polars as pl
import pytest

from firms_ingest import CANONICAL_COLUMNS, read_archive, scan_archive
from firms_ingest.readers import normalize
from firms_ingest.schema import product


def test_modis_normalizes_to_canonical_schema(modis_csv):
    frame = read_archive(modis_csv, "MCD14ML")
    assert frame.columns == list(CANONICAL_COLUMNS)
    assert frame.height == 6
    assert set(frame["sensor"].to_list()) == {"MODIS"}


def test_acq_time_without_leading_zero_parses_as_early_morning(modis_csv):
    """acq_time 525 means 05:25, not 52:5 and not 5:25pm."""
    frame = read_archive(modis_csv, "MCD14ML").sort("acq_ts")
    first = frame["acq_ts"][0]
    assert first == datetime(2019, 8, 14, 5, 25, tzinfo=timezone.utc)


def test_platform_codes_normalize(modis_csv, viirs_csv):
    modis = read_archive(modis_csv, "MCD14ML")
    assert set(modis["platform"].to_list()) == {"Terra", "Aqua"}
    # The VIIRS fixture writes the satellite as "N"; the product constant
    # should still resolve it to the full platform name.
    viirs = read_archive(viirs_csv, "VNP14IMGML")
    assert set(viirs["platform"].to_list()) == {"Suomi-NPP"}


def test_off_nadir_pixel_area_uses_reported_footprint(modis_csv):
    frame = read_archive(modis_csv, "MCD14ML").sort("acq_ts")
    nadir = frame.filter(pl.col("scan_km") == 1.0)
    off_nadir = frame.filter(pl.col("scan_km") == 2.8)
    assert nadir["pixel_area_km2"][0] == pytest.approx(1.0)
    assert off_nadir["pixel_area_km2"][0] == pytest.approx(2.8 * 1.6)


def test_frp_density_divides_by_footprint_area(modis_csv):
    """The off-nadir pixel has higher FRP but covers 4.5x the ground."""
    frame = read_archive(modis_csv, "MCD14ML")
    row = frame.filter(pl.col("scan_km") == 2.8).row(0, named=True)
    assert row["frp_density_mw_km2"] == pytest.approx(88.0 / (2.8 * 1.6))


def test_confidence_class_derived_per_sensor(modis_csv, viirs_csv):
    modis = read_archive(modis_csv, "MCD14ML")
    assert modis.filter(pl.col("confidence_raw") == "92")["confidence_class"][0] == "high"
    assert modis.filter(pl.col("confidence_raw") == "61")["confidence_class"][0] == "nominal"
    assert modis.filter(pl.col("confidence_raw") == "12")["confidence_class"][0] == "low"

    viirs = read_archive(viirs_csv, "VNP14IMGML")
    assert sorted(set(viirs["confidence_class"].to_list())) == ["high", "low", "nominal"]


def test_viirs_nominal_pixel_area_is_375m_squared(viirs_csv):
    frame = read_archive(viirs_csv, "VNP14IMGML")
    # scan/track are present in the fixture, so the reported footprint wins.
    assert frame["pixel_area_km2"][0] == pytest.approx(0.39 * 0.36)


def test_scan_archive_is_lazy(modis_csv):
    assert isinstance(scan_archive(modis_csv, "MCD14ML"), pl.LazyFrame)


def test_unknown_product_raises():
    with pytest.raises(KeyError, match="unknown FIRMS product"):
        product("MCD99XX")


def test_missing_time_columns_raise():
    raw = pl.DataFrame({"latitude": [1.0], "longitude": [2.0]}).lazy()
    with pytest.raises(ValueError, match="missing required column"):
        normalize(raw, product("MCD14ML")).collect()


def test_both_sensors_concatenate_without_schema_conflict(modis_csv, viirs_csv):
    modis = read_archive(modis_csv, "MCD14ML")
    viirs = read_archive(viirs_csv, "VNP14IMGML")
    combined = pl.concat([modis, viirs], how="vertical")
    assert combined.height == modis.height + viirs.height
    assert set(combined["sensor"].to_list()) == {"MODIS", "VIIRS"}
