#!/usr/bin/env python3
"""G7: numbers for the /data "Data journey" -> web/public/data/pipeline.json.

Every value is computed here from committed files under web/public/data/. Two
values come from the build machine's download folder data/global/ when it is
present (file counts by source); without it they are written as null ("not
recorded"). Values nothing on disk can give (raw rows before filtering, the
per-filter funnel) are written as null with a reason.

Usage: python3 scripts/build_pipeline_stats.py   (then scripts/build_manifest.py)
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path
from statistics import median

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
GLOBAL = ROOT / "data" / "global"
OUT = DATA / "pipeline.json"
NOT_RECORDED = "not recorded"


def gz(path: Path) -> int:
    return len(gzip.compress(path.read_bytes(), 6))


def main() -> None:
    params = json.loads((DATA / "params_global.json").read_text())
    countries = params["countries"]
    card = json.loads((DATA / "dataset.json").read_text())
    proof = json.loads((DATA / "proof.json").read_text())
    manifest = {f["name"]: f for f in json.loads((DATA / "manifest.json").read_text())["files"]}

    # 1. archive files (build machine only)
    files = None
    if GLOBAL.is_dir():
        names = [p.name for p in GLOBAL.iterdir() if p.name.endswith(".csv.gz")]
        files = {"total": len(names), "modis": sum(n.startswith("modis_") for n in names), "viirs_snpp": sum(n.startswith("viirs-snpp_") for n in names)}

    # 3. matches
    n_viirs = sum(c["n_train_viirs_detections"] for c in countries.values())
    matched = sum(c["n_train_viirs_detections"] * c["train_match_rate"] for c in countries.values())

    # 5. test
    own = [c for c in countries.values() if c.get("fit_source") == "own"]
    r2_own = median(c["validation_test"]["model"]["r2"] for c in own)
    heldout_cells = sum(c["validation_test"]["model"]["n_cell_months"] for c in countries.values())

    # 6. calendars
    cal = {n: {"rows": manifest[n].get("rows"), "bytes": manifest[n]["bytes"]} for n in ("calendar_raw_global.parquet", "calendar_harmonized_global.parquet")}

    # 7. a country view's first data requests (queries.ts countryViewFiles): manifest, calendar index, fit slice, one calendar slice
    base = [DATA / "manifest.json", DATA / "slices" / "calendar_index.json", DATA / "slices" / "params_core.json"]
    per_country = sorted((DATA / "slices" / "calendar").glob("*.json"))
    base_raw, base_gz = sum(p.stat().st_size for p in base), sum(gz(p) for p in base)
    c_raw = [p.stat().st_size for p in per_country]
    canada = DATA / "slices" / "calendar" / "Canada.json"

    # samples
    harm = pl.read_parquet(DATA / "calendar_harmonized_global.parquet").filter((pl.col("scope") == "country") & (pl.col("key") == "Canada") & (pl.col("year") == 2023)).sort("month").head(4)
    raw = pl.read_parquet(DATA / "calendar_raw_global.parquet").filter((pl.col("scope") == "country") & (pl.col("key") == "Canada") & (pl.col("year") == 2023)).sort("month", "sensor").head(4)
    ca = countries["Canada"]

    out = {
        "fit_version": params["fit_version"],
        "generated_by": "scripts/build_pipeline_stats.py",
        "archive": {
            "files": files,
            "files_note": "country-source-year .csv.gz files in data/global/ on the build machine (years with no FIRMS file are absent)" if files else NOT_RECORDED,
            "raw_rows": None, "raw_rows_note": "not recorded: rows before filtering were not counted",
        },
        "filters": {
            "output_detections": card["filtered_detections"],
            "by_sensor": card["filtered_detections_by_sensor"],
            "funnel": None, "funnel_note": "not recorded: per-filter counts were not kept, only the filtered total",
        },
        "match": {
            "train_viirs_detections": n_viirs,
            "matched_viirs_detections": round(matched),
            "match_rate": round(matched / n_viirs, 4),
            "rule": params["match_rule"],
            "definition": "sum over fitted countries of n_train_viirs_detections and n_train_viirs_detections x train_match_rate (2012-2018)",
        },
        "learn": {"fitted": len(countries), "own": len(own), "pooled": len(countries) - len(own), "train_years": params["train_years"]},
        "test": {"test_years": params["test_years"], "median_r2_own": round(r2_own, 4), "heldout_cell_months": heldout_cells,
                 "beats_ratio_r2": proof["benchmark"]["all"]["beats_ratio_r2"], "n": proof["benchmark"]["all"]["n"],
                 "within_1_25_harm": proof["step_collapse"]["all"]["within_1_25_harm"]},
        "rebuild": {"calendars": cal, "csv_rows": card["harmonized_country_month_rows"]},
        "serve": {
            "country_view_first_files": ["manifest.json", "slices/calendar_index.json", "slices/params_core.json", "slices/calendar/<country>.json"],
            "canada_bytes": base_raw + canada.stat().st_size, "canada_gzip_bytes": base_gz + gz(canada),
            "median_country_bytes": base_raw + int(median(c_raw)),
            "note": "bytes of the first data files a country view requests (uncompressed; gzip level 6 estimate for transfer); later sections fetch more",
        },
        "samples": {
            "harmonized": {"columns": harm.columns, "rows": [list(r[:-1]) + [round(r[-1], 3)] for r in harm.rows()]},
            "raw": {"columns": raw.columns, "rows": raw.rows()},
            "fit_canada": {"b0": round(ca["logistic"]["b0"], 4), "b1": round(ca["logistic"]["b1"], 4), "kappa": round(ca["kappa"], 4),
                           "frp_at_p50_mw": round(ca["frp_at_p50_mw"], 2), "heldout_r2": round(ca["validation_test"]["model"]["r2"], 4)},
        },
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(json.dumps({k: out[k] for k in ("archive", "match", "test", "serve")}, indent=1)[:1500])


if __name__ == "__main__":
    main()
