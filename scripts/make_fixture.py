#!/usr/bin/env python3
"""Cut the committed reproducibility fixture from the staged FIRMS archive (run once; the output is committed).

Every row of Portugal's FIRMS archive country files for February and December
2019, 2020 and 2021 (UTC acquisition date), MODIS C6.1 and VIIRS 375 m
Suomi-NPP, unfiltered and unmodified. Because whole months are kept, the
filtered counts must equal the published calendar_raw_global.parquet for those
months; scripts/repro_fixture.py checks that.

Source: NASA FIRMS archive (https://firms.modaps.eosdis.nasa.gov/download/), NASA open data.
Usage: python3 scripts/make_fixture.py [ARCHIVE_DIR]   (default data/global, *.csv.gz)
"""
import gzip
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "global"
OUT = ROOT / "tests" / "fixtures" / "portugal_feb_dec"
MONTHS = ("-02-", "-12-")

OUT.mkdir(parents=True, exist_ok=True)
for source in ("modis", "viirs-snpp"):
    for year in (2019, 2020, 2021):
        name = f"{source}_{year}_Portugal.csv"
        with gzip.open(SRC / f"{name}.gz", "rt") as fh:
            header, *rows = fh.read().splitlines()
        col = header.split(",").index("acq_date")
        keep = [r for r in rows if r.split(",")[col][4:8] in MONTHS]
        (OUT / name).write_text("\n".join([header, *keep]) + "\n")
        print(f"{name}: {len(keep)} of {len(rows)} rows")
