#!/usr/bin/env python3
"""Reproduce one known output from the committed fixture (E40).

Steps:
 1. firms-ingest test suite (pytest).
 2. Build tables from tests/fixtures/portugal_feb_dec/ (every FIRMS archive row for
    Portugal, Feb and Dec 2019-2021) with the SAME functions as scripts/build_tables.py:
    firms_ingest filters -> detections -> H3 cell-day -> raw calendar.
 3. Compute the known output: Portugal country-scope raw calendar for those months
    (detections and FRP sum per year, month, sensor), plus cell-day row / H3 parent counts.
 4. Compare with tests/fixtures/portugal_feb_dec_expected.json (committed), and with the
    published web/public/data/calendar_raw_global.parquet (the file the website reads).

Usage: python scripts/repro_fixture.py [--write-expected]    (run by scripts/repro_fixture.sh)
Exit 0 only if every step passes.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests" / "fixtures" / "portugal_feb_dec"
EXPECTED = ROOT / "tests" / "fixtures" / "portugal_feb_dec_expected.json"
PUBLISHED = ROOT / "web" / "public" / "data" / "calendar_raw_global.parquet"
YEARS, MONTHS = (2019, 2020, 2021), (2, 12)


def step(msg: str) -> None:
    print(f"\n== {msg}", flush=True)


def main() -> int:
    step("1/4 firms-ingest pytest")
    r = subprocess.run([sys.executable, "-m", "pytest", "-q"], cwd=ROOT / "packages" / "firms-ingest")
    if r.returncode:
        print("FAIL: pytest"); return 1

    step("2/4 build tables from the fixture (scripts/build_tables.py functions)")
    spec = importlib.util.spec_from_file_location("build_tables", ROOT / "scripts" / "build_tables.py")
    bt = importlib.util.module_from_spec(spec); spec.loader.exec_module(bt)
    files, manifest = [], {}
    for source in ("modis", "viirs-snpp"):
        for year in YEARS:
            path = FIX / f"{source}_{year}_Portugal.csv"
            files.append((source, year, path))
            manifest[(source, year, "Portugal")] = bt.count_csv_rows(path)
    det, stats = bt.build_country("Portugal", files, manifest)
    cell_day = bt.build_cell_day(det)
    cal = bt.build_calendar(cell_day, det)
    raw_rows = sum(s["csv_rows"] for s in stats)
    print(f"raw rows {raw_rows}, filtered detections {det.height}, cell-day rows {cell_day.height}")

    step("3/4 known output: Portugal raw calendar, Feb + Dec 2019-2021")
    sel = (cal.filter((pl.col("scope") == "country") & pl.col("year").is_in(YEARS) & pl.col("month").is_in(MONTHS))
           .sort("year", "month", "sensor"))
    got = {
        "fixture": "tests/fixtures/portugal_feb_dec (FIRMS archive, Portugal, Feb+Dec 2019-2021)",
        "raw_rows": raw_rows,
        "filtered_detections": det.height,
        "cell_day_rows": cell_day.height,
        "h3_parents": cell_day["h3_parent"].n_unique(),
        "calendar": [{"year": int(x["year"]), "month": int(x["month"]), "sensor": x["sensor"],
                      "n_detections": int(x["n_detections"]), "frp_sum_mw": round(float(x["frp_sum_mw"]), 2)}
                     for x in sel.iter_rows(named=True)],
    }
    for row in got["calendar"]:
        print(row)
    if "--write-expected" in sys.argv:
        EXPECTED.write_text(json.dumps(got, indent=1) + "\n")
        print(f"wrote {EXPECTED.relative_to(ROOT)}")
    want = json.loads(EXPECTED.read_text())
    if got != want:
        print("FAIL: output differs from", EXPECTED.relative_to(ROOT))
        print("got:", json.dumps(got)); return 2
    print("matches", EXPECTED.relative_to(ROOT))

    step("4/4 cross-check against the published calendar the website reads")
    pub = (pl.read_parquet(PUBLISHED)
           .filter((pl.col("scope") == "country") & (pl.col("key") == "Portugal")
                   & pl.col("year").is_in(YEARS) & pl.col("month").is_in(MONTHS)).sort("year", "month", "sensor"))
    pub_counts = [(int(x["year"]), int(x["month"]), x["sensor"], int(x["n_detections"])) for x in pub.iter_rows(named=True)]
    fix_counts = [(c["year"], c["month"], c["sensor"], c["n_detections"]) for c in got["calendar"]]
    if pub_counts != fix_counts:
        print("FAIL: published calendar_raw_global.parquet differs:", pub_counts); return 3
    print(f"all {len(fix_counts)} year-month-sensor counts equal {PUBLISHED.relative_to(ROOT)}")
    print("\nREPRO OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
