import polars as pl
import pytest

from firms_ingest.cli import main


def test_normalize_writes_parquet(modis_csv, tmp_path):
    out = tmp_path / "out" / "detections.parquet"
    assert main(["normalize", str(modis_csv), "--product", "MCD14ML", "-o", str(out)]) == 0
    frame = pl.read_parquet(out)
    assert frame.height == 2  # standard filters applied by default
    assert "frp_density_mw_km2" in frame.columns


def test_normalize_no_filter_keeps_everything(modis_csv, tmp_path):
    out = tmp_path / "raw.parquet"
    main(["normalize", str(modis_csv), "--product", "MCD14ML", "--no-filter", "-o", str(out)])
    assert pl.read_parquet(out).height == 6


def test_normalize_respects_bbox(modis_csv, tmp_path):
    out = tmp_path / "au.parquet"
    main(
        [
            "normalize", str(modis_csv), "--product", "MCD14ML", "--no-filter",
            "--bbox", "130", "-20", "140", "-5", "-o", str(out),
        ]
    )
    frame = pl.read_parquet(out)
    assert frame.height == 4
    assert frame["lon"].min() > 130


def test_aggregate_produces_cell_day_table(modis_csv, tmp_path):
    out = tmp_path / "cells.parquet"
    assert main(
        ["aggregate", str(modis_csv), "--product", "MCD14ML", "-r", "4", "-o", str(out)]
    ) == 0
    frame = pl.read_parquet(out)
    assert {"h3", "acq_date", "sensor", "n_detections", "frp_sum_mw", "doy"} <= set(frame.columns)
    assert frame["h3_resolution"].unique().to_list() == [4]


def test_climatology_round_trips_from_aggregate(modis_csv, tmp_path):
    cells = tmp_path / "cells.parquet"
    clim = tmp_path / "clim.parquet"
    main(["aggregate", str(modis_csv), "--product", "MCD14ML", "-o", str(cells)])
    assert main(["climatology", str(cells), "-o", str(clim)]) == 0
    frame = pl.read_parquet(clim)
    assert {"h3", "doy", "p50", "p90", "n_samples"} <= set(frame.columns)


def test_unsupported_output_extension_is_rejected(modis_csv, tmp_path):
    with pytest.raises(SystemExit, match="unsupported output format"):
        main(["normalize", str(modis_csv), "--product", "MCD14ML", "-o", str(tmp_path / "x.txt")])


def test_csv_output_is_supported(modis_csv, tmp_path):
    out = tmp_path / "out.csv"
    main(["normalize", str(modis_csv), "--product", "MCD14ML", "-o", str(out)])
    assert pl.read_csv(out).height == 2


def test_unknown_product_is_rejected_by_argparse(modis_csv, tmp_path):
    with pytest.raises(SystemExit):
        main(["normalize", str(modis_csv), "--product", "NOPE", "-o", str(tmp_path / "o.parquet")])
