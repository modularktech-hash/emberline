"""Recovery regressions: never treat half a country as a finished build."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_global as rg
import polars as pl
import os
import subprocess
import pytest
import fit_harmonization as fit
from datetime import datetime


def test_interrupted_build_regenerates_missing_calendar(tmp_path, monkeypatch):
    monkeypatch.setattr(rg, "OUT", tmp_path)
    monkeypatch.setattr(rg, "complete_countries", lambda: ["Example"])
    # External archive parsing is replaced; the real persistence path runs.
    det = pl.DataFrame({"lat": [1.0], "lon": [2.0], "acq_ts": [1],
                        "platform": ["Aqua"], "frp_mw": [10.0], "lst_hours": [13.5]})
    det.write_parquet(tmp_path / "detections_Example.parquet")
    monkeypatch.setattr(rg, "build_one", lambda country: det)
    monkeypatch.setattr(rg, "raw_calendar", lambda country, data: pl.DataFrame({"n_detections": [1]}))
    rg.main()
    assert pl.read_parquet(tmp_path / "calendar_raw_Example.parquet")["n_detections"].sum() == 1


def test_complete_pair_is_not_rebuilt(tmp_path, monkeypatch):
    monkeypatch.setattr(rg, "OUT", tmp_path)
    monkeypatch.setattr(rg, "complete_countries", lambda: ["Example"])
    for name in ("detections", "calendar_raw"):
        pl.DataFrame({"value": [7]}).write_parquet(tmp_path / f"{name}_Example.parquet")
    def unexpected(country):
        raise AssertionError("finished country was rebuilt")
    monkeypatch.setattr(rg, "build_one", unexpected)
    rg.main()
    assert pl.read_parquet(tmp_path / "detections_Example.parquet")["value"].to_list() == [7]


def test_download_failure_is_nonzero_for_service_retry(tmp_path):
    tools = tmp_path / "bin"
    tools.mkdir()
    for name, body in {"curl": "exit 7", "sleep": "exit 0"}.items():
        script = tools / name
        script.write_text("#!/bin/sh\n" + body + "\n")
        script.chmod(0o755)
    countries = tmp_path / "countries.txt"
    countries.write_text("Example\n")
    env = {**os.environ, "PATH": str(tools) + ":" + os.environ["PATH"],
           "OUT": str(tmp_path / "out"), "FIRST_YEAR": "2025", "LAST_YEAR": "2025", "JOBS": "1"}
    result = subprocess.run(["bash", str(Path(__file__).with_name("stage_global.sh")), str(countries)],
                            env=env, capture_output=True, text=True)
    assert "FAIL" in result.stdout
    assert result.returncode != 0


def test_fit_keeps_finished_country_if_next_fit_is_interrupted(tmp_path, monkeypatch):
    monkeypatch.setattr(fit, "DATA", tmp_path)
    monkeypatch.setattr(fit, "WEB", tmp_path / "published")
    monkeypatch.setattr(sys, "argv", ["fit", "First", "Second"])
    (tmp_path / "detections_First.parquet").write_bytes(b"12")
    (tmp_path / "detections_Second.parquet").write_bytes(b"1")
    def country(name):
        if name == "Second":
            raise KeyboardInterrupt()
        p = {"fit_source": "own", "frp_at_p50_mw": 3.0, "kappa": 0.5,
             "validation_test": {"model": {"r2": 0.7, "bias_pct": 2.0}, "raw_viirs": {"r2": -1.0}}}
        return p, pl.DataFrame({"year": [2019]}), None, None
    monkeypatch.setattr(fit, "fit_country", country)
    monkeypatch.setattr(fit, "calendar", lambda *args: pl.DataFrame({"n_harmonized": [12.5]}))
    with pytest.raises(KeyboardInterrupt):
        fit.main()
    assert pl.read_parquet(tmp_path / "fit_checkpoints" / "First" / "calendar.parquet")["n_harmonized"].to_list() == [12.5]


def test_calendar_zero_fills_only_available_archive_years(tmp_path, monkeypatch):
    monkeypatch.setattr(rg, "SRC", tmp_path)
    (tmp_path / "modis_2001_Example.csv.gz").touch()
    (tmp_path / "modis_2002_Example.csv.absent").touch()
    det = pl.DataFrame({"lat": [1.0], "lon": [2.0], "acq_ts": [datetime(2001, 7, 1)],
                        "sensor": ["MODIS"], "frp_mw": [10.0]})
    cal = rg.raw_calendar("Example", det).filter(pl.col("scope") == "country")
    assert cal.height == 12
    assert cal["n_detections"].sum() == 1
    assert cal.filter(pl.col("month") == 1)["n_detections"].item() == 0
    assert cal["year"].unique().to_list() == [2001]
