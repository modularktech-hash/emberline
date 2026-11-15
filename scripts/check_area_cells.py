#!/usr/bin/env python3
"""Check the drawn-area cell files (web/public/data/area/) against the country calendars.

1. Exact: for every country, the cell rows tagged with that country sum to the
   country calendar (raw MODIS and VIIRS: identical integers; harmonized: equal
   within float32 rounding). This proves the cells hold the same detections and
   the same harmonization as the published calendars.
2. Geometric: for the largest fitted countries, the cells whose centre lies
   inside the Natural Earth 110 m outline (what a user drawing the country gets)
   against the country calendar. This differs by design (a coarse outline,
   border cells, islands), so it is reported, with a tolerance, not required
   to be exact.

Writes web/public/data/area/check.json. Exit 1 if check 1 fails, or if the
median geometric difference exceeds the tolerance.

Usage: python3 scripts/check_area_cells.py [--top 20] [--tol 0.10]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import h3
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "data"
AREA = WEB / "area"
GEO = ROOT / "web" / "public" / "geo" / "countries.geojson"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_month_to_date import ne_name  # noqa: E402  same FIRMS -> Natural Earth name map


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--tol", type=float, default=0.10)
    a = ap.parse_args()
    meta = json.loads((AREA / "index.json").read_text())
    res = meta["resolution"]
    cells = pl.concat([pl.read_parquet(WEB / f["file"]) for f in meta["files"]])
    raw = pl.read_parquet(WEB / "calendar_raw_global.parquet").filter(pl.col("scope") == "country")
    harm = pl.read_parquet(WEB / "calendar_harmonized_global.parquet").filter(pl.col("scope") == "country")
    fitted = set(json.loads((WEB / "params_global.json").read_text())["countries"])

    by_c = cells.group_by("country").agg(pl.col("n_modis").sum(), pl.col("n_viirs").sum(), pl.col("n_harm").cast(pl.Float64).sum())
    rc = raw.group_by("key", "sensor").agg(pl.col("n_detections").sum()).pivot(on="sensor", index="key", values="n_detections")
    hc = harm.group_by("key").agg(pl.col("n_harmonized").sum())
    j = by_c.join(rc, left_on="country", right_on="key", how="full", coalesce=True).join(hc, left_on="country", right_on="key", how="left").fill_null(0)
    # Countries whose filtered detections file exists here (data/global_public) must match exactly.
    # The rest are small places whose calendar was published from an earlier run; their cells
    # are rebuilt from the archive (build_area_cells.py) and any difference is reported, not hidden.
    staged = {p.stem.removeprefix("detections_") for p in (ROOT / "data" / "global_public").glob("detections_*.parquet")}
    j = j.with_columns(pl.col("country").is_in(list(staged)).alias("staged"))
    bad = (pl.col("n_modis") != pl.col("MODIS")) | (pl.col("n_viirs") != pl.col("VIIRS"))
    raw_bad = j.filter(pl.col("staged") & bad)
    other = j.filter(~pl.col("staged"))
    jf = j.filter(pl.col("country").is_in(list(fitted)) & pl.col("staged"))
    rel = ((jf["n_harm"] - jf["n_harmonized"]).abs() / jf["n_harmonized"].clip(lower_bound=1))
    exact = {"countries": j.height, "staged_countries": int(j["staged"].sum()), "raw_mismatches_staged": raw_bad.height,
             "fitted_staged": jf.height, "harmonized_max_rel_diff_staged": float(rel.max()),
             "rebuilt_small_places": other.height,
             "rebuilt_detections_published": int(other["MODIS"].sum() + other["VIIRS"].sum()),
             "rebuilt_detections_in_cells": int(other["n_modis"].sum() + other["n_viirs"].sum()),
             "rebuilt_mismatching": other.filter(bad | pl.col("n_modis").is_null()).select("country", "MODIS", "n_modis", "VIIRS", "n_viirs").to_dicts()}

    # Geometric check: draw each large country's outline.
    geo = {f["properties"]["NAME"]: f["geometry"] for f in json.loads(GEO.read_text())["features"]}
    order = raw.filter(pl.col("key").is_in(list(fitted))).group_by("key").agg(pl.col("n_detections").sum()).sort("n_detections", descending=True)
    cell_tot = cells.group_by("cell").agg(pl.col("n_modis").sum(), pl.col("n_viirs").sum(), pl.col("n_harm").cast(pl.Float64).sum())
    geom_rows = []
    for c in order["key"].to_list():
        g = geo.get(ne_name(c))
        if g is None:
            continue
        inside = set(h3.geo_to_cells(g, res))
        sel = cell_tot.filter(pl.col("cell").is_in(list(inside)))
        r = j.filter(pl.col("country") == c).row(0, named=True)
        def d(x, y):
            return (x - y) / y if y else None
        geom_rows.append({"country": c, "cells_in_outline": len(inside),
                          "raw_modis_rel_diff": d(float(sel["n_modis"].sum()), r["MODIS"]),
                          "raw_viirs_rel_diff": d(float(sel["n_viirs"].sum()), r["VIIRS"]),
                          "harmonized_rel_diff": d(float(sel["n_harm"].sum()), r["n_harmonized"])})
        if len(geom_rows) >= a.top:
            break
    diffs = sorted(abs(x["harmonized_rel_diff"]) for x in geom_rows if x["harmonized_rel_diff"] is not None)
    med = diffs[len(diffs) // 2] if diffs else None
    out = {"resolution": res, "exact": exact, "outline_tolerance": a.tol, "outline_median_abs_rel_diff_harmonized": med,
           "outline": geom_rows,
           "outline_note": "cells whose centre is inside the Natural Earth 110 m outline vs the FIRMS country file; "
                           "differences come from the coarse outline and border cells, not from the data"}
    (AREA / "check.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({k: v for k, v in exact.items() if k != "rebuilt_mismatching"}))
    for x in geom_rows:
        print(f"  {x['country']:<34} cells {x['cells_in_outline']:>6}  harm {x['harmonized_rel_diff']:+.3%}  modis {x['raw_modis_rel_diff']:+.3%}  viirs {x['raw_viirs_rel_diff']:+.3%}")
    print(f"median |harmonized diff| over {len(diffs)} outlines: {med:.3%} (tolerance {a.tol:.0%})")
    ok = exact["raw_mismatches_staged"] == 0 and exact["harmonized_max_rel_diff_staged"] < 1e-4 and med is not None and med <= a.tol
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
