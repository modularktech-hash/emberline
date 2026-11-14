from datetime import datetime, timezone

import polars as pl
import pytest

from firms_ingest import (
    add_h3_cell,
    aggregate_cell_day,
    cells_for_bbox,
    day_of_year_climatology,
)
from firms_ingest.grid import H3_MEAN_AREA_KM2


def _detections(rows):
    """rows: (lat, lon, iso_datetime, sensor, platform, frp)"""
    return pl.DataFrame(
        {
            "lat": [r[0] for r in rows],
            "lon": [r[1] for r in rows],
            "acq_ts": [datetime.fromisoformat(r[2]).replace(tzinfo=timezone.utc) for r in rows],
            "sensor": [r[3] for r in rows],
            "platform": [r[4] for r in rows],
            "frp_mw": [r[5] for r in rows],
            "pixel_area_km2": [1.0] * len(rows),
        },
        schema_overrides={"acq_ts": pl.Datetime("us", "UTC")},
    )


def test_nearby_points_share_a_cell_at_r4():
    frame = _detections(
        [
            (-12.50, 133.20, "2019-08-14T05:25", "MODIS", "Terra", 45.0),
            (-12.51, 133.21, "2019-08-14T13:45", "MODIS", "Aqua", 88.0),
        ]
    )
    cells = add_h3_cell(frame, resolution=4)["h3"].to_list()
    assert cells[0] == cells[1]


def test_far_apart_points_get_different_cells():
    frame = _detections(
        [
            (-12.50, 133.20, "2019-08-14T05:25", "MODIS", "Terra", 45.0),
            (45.00, -120.00, "2019-08-14T05:25", "MODIS", "Terra", 45.0),
        ]
    )
    assert add_h3_cell(frame, resolution=4)["h3"].n_unique() == 2


def test_resolution_out_of_range_raises():
    frame = _detections([(0.0, 0.0, "2019-01-01T00:00", "MODIS", "Terra", 1.0)])
    with pytest.raises(ValueError, match="resolution must be 0-15"):
        add_h3_cell(frame, resolution=42)


def test_aggregate_splits_by_sensor_not_just_by_cell():
    """The whole point of the project: MODIS and VIIRS must stay separable."""
    frame = _detections(
        [
            (-12.50, 133.20, "2019-08-14T05:25", "MODIS", "Terra", 45.0),
            (-12.51, 133.21, "2019-08-14T13:45", "MODIS", "Aqua", 55.0),
            (-12.505, 133.205, "2019-08-14T13:30", "VIIRS", "Suomi-NPP", 8.0),
        ]
    )
    cells = aggregate_cell_day(frame, resolution=4)
    assert cells.height == 2

    modis = cells.filter(pl.col("sensor") == "MODIS").row(0, named=True)
    assert modis["n_detections"] == 2
    assert modis["frp_sum_mw"] == pytest.approx(100.0)
    assert modis["frp_max_mw"] == pytest.approx(55.0)
    assert modis["n_platforms"] == 2

    viirs = cells.filter(pl.col("sensor") == "VIIRS").row(0, named=True)
    assert viirs["n_detections"] == 1
    assert viirs["frp_sum_mw"] == pytest.approx(8.0)


def test_aggregate_adds_calendar_keys():
    frame = _detections([(-12.5, 133.2, "2019-08-14T05:25", "MODIS", "Terra", 45.0)])
    row = aggregate_cell_day(frame, resolution=4).row(0, named=True)
    assert row["year"] == 2019
    assert row["doy"] == 226  # 14 August 2019
    assert row["h3_resolution"] == 4


def test_separate_days_do_not_merge():
    frame = _detections(
        [
            (-12.5, 133.2, "2019-08-14T05:25", "MODIS", "Terra", 45.0),
            (-12.5, 133.2, "2019-08-15T05:25", "MODIS", "Terra", 45.0),
        ]
    )
    assert aggregate_cell_day(frame, resolution=4).height == 2


def test_cells_for_bbox_covers_the_box():
    cells = cells_for_bbox(133.0, -13.0, 134.0, -12.0, resolution=4)
    assert len(cells) > 0
    assert all(isinstance(cell, str) for cell in cells)


def test_cells_for_bbox_rejects_antimeridian_crossing():
    with pytest.raises(ValueError, match="antimeridian"):
        cells_for_bbox(170.0, 50.0, -170.0, 70.0, resolution=4)


def test_h3_area_table_decreases_with_resolution():
    areas = [H3_MEAN_AREA_KM2[r] for r in sorted(H3_MEAN_AREA_KM2)]
    assert areas == sorted(areas, reverse=True)


def _cell_day(doy_values, value=10.0, cell="abc"):
    return pl.DataFrame(
        {
            "h3": [cell] * len(doy_values),
            "doy": doy_values,
            "frp_sum_mw": [value] * len(doy_values),
        },
        schema_overrides={"doy": pl.Int16},
    )


def test_climatology_window_wraps_around_new_year():
    """A late-December fire must inform the early-January baseline.

    In the Southern Hemisphere that window is the middle of the fire season,
    so a non-wrapping climatology understates exactly the wrong days.
    """
    clim = day_of_year_climatology(_cell_day([365]), smoothing_days=15)
    doys = set(clim["doy"].to_list())
    assert 1 in doys and 2 in doys
    assert 365 in doys


def test_climatology_percentiles_are_ordered():
    frame = _cell_day([200] * 5).with_columns(
        pl.Series("frp_sum_mw", [1.0, 5.0, 10.0, 50.0, 100.0])
    )
    row = day_of_year_climatology(frame, smoothing_days=1).filter(
        pl.col("doy") == 200
    ).row(0, named=True)
    assert row["p50"] <= row["p75"] <= row["p90"] <= row["p95"]
    assert row["n_samples"] == 5


def test_climatology_rejects_even_smoothing_window():
    with pytest.raises(ValueError, match="positive odd number"):
        day_of_year_climatology(_cell_day([1]), smoothing_days=14)


def test_climatology_rejects_out_of_range_percentiles():
    with pytest.raises(ValueError, match="between 0 and 1"):
        day_of_year_climatology(_cell_day([1]), percentiles=(50.0,))


def test_climatology_keeps_cells_independent():
    frame = pl.concat([_cell_day([200], cell="a"), _cell_day([200], cell="b")])
    clim = day_of_year_climatology(frame, smoothing_days=1)
    assert set(clim["h3"].to_list()) == {"a", "b"}
