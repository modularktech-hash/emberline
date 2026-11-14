import polars as pl
import pytest

from firms_ingest import confidence as c


@pytest.mark.parametrize(
    "value,expected",
    [(0, "low"), (29, "low"), (30, "nominal"), (79, "nominal"), (80, "high"), (100, "high")],
)
def test_modis_confidence_bin_boundaries(value, expected):
    assert c.modis_confidence_to_class(value) == expected


def test_modis_confidence_none_passes_through():
    assert c.modis_confidence_to_class(None) is None


@pytest.mark.parametrize(
    "value,expected",
    [("l", "low"), ("N", "nominal"), (" h ", "high"), ("nominal", "nominal")],
)
def test_viirs_confidence_codes(value, expected):
    assert c.viirs_confidence_to_class(value) == expected


def test_viirs_confidence_rejects_unknown_code():
    assert c.viirs_confidence_to_class("banana") is None


def test_confidence_expr_matches_scalar_function_for_modis():
    raw = ["0", "29", "30", "79", "80", "100", "not-a-number"]
    frame = pl.DataFrame({"confidence_raw": raw})
    got = frame.select(c.confidence_class_expr("MODIS").alias("cls"))["cls"].to_list()
    assert got == ["low", "low", "nominal", "nominal", "high", "high", None]


def test_confidence_expr_for_viirs():
    frame = pl.DataFrame({"confidence_raw": ["l", "n", "h", "?"]})
    got = frame.select(c.confidence_class_expr("VIIRS").alias("cls"))["cls"].to_list()
    assert got == ["low", "nominal", "high", None]


def test_at_least_is_inclusive_and_ordered():
    frame = pl.DataFrame({"confidence_class": ["low", "nominal", "high"]})
    assert frame.filter(c.at_least("nominal")).height == 2
    assert frame.filter(c.at_least("high")).height == 1
    assert frame.filter(c.at_least("low")).height == 3


def test_at_least_rejects_unknown_class():
    with pytest.raises(ValueError, match="unknown confidence class"):
        c.at_least("very high")
