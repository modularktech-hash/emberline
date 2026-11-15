#!/usr/bin/env python3
"""G4: dataset card numbers and the country-level CSV export.

Writes, from the published files only:
  web/public/data/dataset.json                     coverage and scale for the /data "Dataset card"
  web/public/data/calendar_harmonized_countries.csv country x year x month harmonized counts
                                                   (country rows of calendar_harmonized_global.parquet)

Run after any data change, then scripts/build_manifest.py (which records sizes and hashes
of every file, these two included). Published sizes are read from manifest.json at runtime
by the page, so this file does not depend on them.

Usage: python3 scripts/build_dataset_card.py
"""
from __future__ import annotations

import json
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
CSV = DATA / "calendar_harmonized_countries.csv"


def main() -> None:
    params = json.loads((DATA / "params_global.json").read_text())
    cov = json.loads((DATA / "coverage_status.json").read_text())
    raw = pl.read_parquet(DATA / "calendar_raw_global.parquet").filter(pl.col("scope") == "country")
    harm = pl.read_parquet(DATA / "calendar_harmonized_global.parquet").filter(pl.col("scope") == "country")

    by_sensor = raw.group_by("sensor").agg(pl.col("n_detections").sum(), pl.col("year").min().alias("y0"), pl.col("year").max().alias("y1"))
    sensors = {r["sensor"]: {"detections": int(r["n_detections"]), "years": [int(r["y0"]), int(r["y1"])]} for r in by_sensor.to_dicts()}
    csy = raw.filter(pl.col("n_detections") > 0).select("key", "sensor", "year").unique().height

    out = harm.select(pl.col("key").alias("country"), "year", "month", pl.col("n_harmonized").round(3)).sort("country", "year", "month")
    with CSV.open("w") as f:
        f.write(f"# Emberline harmonized monthly calendar, country level. Fit {params['fit_version']}. Unit: {params['unit']}.\n")
        f.write("# Aqua MODIS counts to 2011; kappa x sum of P(FRP) over Suomi-NPP VIIRS detections from 2012. Countries with a published fit only.\n")
        f.write("# Source: NASA FIRMS (MODIS C6.1, VIIRS 375 m Suomi-NPP); derived by Emberline. Credit: NASA FIRMS / LANCE.\n")
        out.write_csv(f)

    fs = [v.get("fit_source") for v in params["countries"].values()]
    card = {
        "name": f"Emberline harmonized fire record, fit {params['fit_version']}",
        "fit_version": params["fit_version"],
        "generated_by": "scripts/build_dataset_card.py",
        "unit": params["unit"],
        "countries_with_raw_record": int(raw["key"].n_unique()),
        "countries_in_archive_list": cov.get("n_countries"),
        "countries_fitted": len(fs),
        "countries_own_fit": fs.count("own"),
        "countries_pooled_fit": fs.count("pooled"),
        "raw_years": [int(raw["year"].min()), int(raw["year"].max())],
        "harmonized_years": [2003, int(harm["year"].max())],
        "harmonized_years_note": "rows exist from 2002 (Aqua from July 2002); the comparable record is 2003 onward",
        "train_years": params["train_years"],
        "test_years": params["test_years"],
        "filtered_detections": int(raw["n_detections"].sum()),
        "filtered_detections_by_sensor": sensors,
        "filtered_detections_definition": "sum of n_detections over country rows of calendar_raw_global.parquet: daytime vegetation fires (type 0), confidence nominal or high, FRP > 0",
        "country_sensor_years_with_detections": csy,
        "harmonized_country_month_rows": out.height,
        "csv_export": CSV.name,
        "licence": {"code": "MIT (LICENSE)", "data": "derived from NASA FIRMS; credit NASA FIRMS / LANCE"},
        "cite": "Team Modulark (2026). Emberline harmonized fire record (fit "
                + params["fit_version"] + "). https://github.com/modularktech-hash/emberline. Data derived from NASA FIRMS (LANCE).",
    }
    (DATA / "dataset.json").write_text(json.dumps(card, indent=1))
    print(json.dumps({k: card[k] for k in ("countries_with_raw_record", "countries_fitted", "raw_years", "harmonized_years", "filtered_detections", "country_sensor_years_with_detections", "harmonized_country_month_rows")}))
    print(f"{CSV.name}: {CSV.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
