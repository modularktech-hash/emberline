"""Synthetic fixtures mirroring the real FIRMS archive CSV layouts."""

from __future__ import annotations

import pytest

MODIS_HEADER = (
    "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,"
    "instrument,confidence,version,bright_t31,frp,daynight,type"
)

VIIRS_HEADER = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,"
    "instrument,confidence,version,bright_ti5,frp,daynight,type"
)

MODIS_ROWS = [
    # nadir daytime vegetation fire, high confidence
    "-12.5000,133.2000,330.1,1.0,1.0,2019-08-14,525,Terra,MODIS,92,6.1NRT,295.4,45.2,D,0",
    # off-nadir: scan/track well above 1 km, so pixel area must not be nominal
    "-12.6000,133.4000,318.7,2.8,1.6,2019-08-14,1345,Aqua,MODIS,61,6.1NRT,291.0,88.0,D,0",
    # low confidence, should fall below the `nominal` cut
    "-12.7000,133.6000,305.2,1.1,1.0,2019-08-14,1346,Aqua,MODIS,12,6.1NRT,288.3,4.1,D,0",
    # night overpass
    "-12.8000,133.8000,310.0,1.0,1.0,2019-08-14,1710,Aqua,MODIS,85,6.1NRT,289.9,12.0,N,0",
    # gas flare masquerading as a fire: type 2
    "25.1000,51.4000,340.0,1.0,1.0,2019-08-14,1030,Terra,MODIS,95,6.1NRT,300.1,120.0,D,2",
    # volcano: type 1
    "19.4000,-155.2000,360.0,1.0,1.0,2019-08-14,1032,Terra,MODIS,99,6.1NRT,310.0,250.0,D,1",
]

VIIRS_ROWS = [
    "-12.5010,133.2010,340.5,0.39,0.36,2019-08-14,1330,N,VIIRS,h,2.0NRT,295.0,8.4,D,0",
    "-12.5030,133.2040,336.2,0.38,0.36,2019-08-14,1330,N,VIIRS,n,2.0NRT,294.1,3.2,D,0",
    # tiny fire MODIS could never resolve -- the censoring problem in one row
    "-12.5050,133.2070,301.0,0.38,0.36,2019-08-14,1330,N,VIIRS,l,2.0NRT,290.0,0.6,D,0",
    "45.0000,-120.0000,355.0,0.40,0.36,2019-08-14,2100,N,VIIRS,h,2.0NRT,300.0,55.0,N,0",
]


def _write(path, header, rows):
    path.write_text("\n".join([header, *rows]) + "\n", encoding="utf-8")
    return path


@pytest.fixture
def modis_csv(tmp_path):
    return _write(tmp_path / "fire_archive_M-C61.csv", MODIS_HEADER, MODIS_ROWS)


@pytest.fixture
def viirs_csv(tmp_path):
    return _write(tmp_path / "fire_archive_SV-C2.csv", VIIRS_HEADER, VIIRS_ROWS)
