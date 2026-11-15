#!/usr/bin/env python3
"""Build web/src/content/hero.json: the small, static numbers behind the home hero.

The hero chart must paint without a network request, so its series are computed
here once and imported by the page at build time. Every number is read from the
published data files; nothing is typed in.

Inputs (web/public/data/):
  calendar_raw_global.parquet         monthly MODIS / VIIRS counts per country
  calendar_harmonized_global.parquet  monthly harmonized (Aqua-MODIS-equivalent) counts
  proof.json                          step_collapse, worked_example, headline

Per hero country, 2003-2025:
  raw   the naive splice: MODIS (Terra + Aqua) up to 2011, VIIRS (Suomi-NPP) from 2012
  harm  the harmonized series
  Each is indexed to its own 2003-2011 mean (1 = that era's average year).
  step_raw / step_harm: mean annual count 2012-2014 / mean 2009-2011, the same
  definition as params_global.json null_control.

Usage: python3 scripts/build_hero.py
"""
from __future__ import annotations

import json
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
OUT = ROOT / "web" / "src" / "content" / "hero.json"
COUNTRIES = ["Australia", "Canada", "Brazil", "India"]
FIRST, LAST = 2003, 2025


def mean(d: dict[int, float], a: int, b: int) -> float:
    return sum(d.get(y, 0.0) for y in range(a, b + 1)) / (b - a + 1)


def main() -> None:
    raw = (pl.read_parquet(DATA / "calendar_raw_global.parquet")
           .filter((pl.col("scope") == "country") & pl.col("key").is_in(COUNTRIES))
           .group_by("key", "year", "sensor").agg(pl.col("n_detections").sum().alias("n")))
    harm = (pl.read_parquet(DATA / "calendar_harmonized_global.parquet")
            .filter((pl.col("scope") == "country") & pl.col("key").is_in(COUNTRIES))
            .group_by("key", "year").agg(pl.col("n_harmonized").sum().alias("n")))

    out_c = []
    for c in COUNTRIES:
        r = raw.filter(pl.col("key") == c)
        modis = {int(y): float(n) for y, n in r.filter(pl.col("sensor") == "MODIS").select("year", "n").iter_rows()}
        viirs = {int(y): float(n) for y, n in r.filter(pl.col("sensor") == "VIIRS").select("year", "n").iter_rows()}
        splice = {y: (modis.get(y, 0.0) if y <= 2011 else viirs.get(y, 0.0)) for y in range(FIRST, LAST + 1)}
        h = {int(y): float(n) for y, n in harm.filter(pl.col("key") == c).select("year", "n").iter_rows()}
        hs = {y: h.get(y, 0.0) for y in range(FIRST, LAST + 1)}
        base_r, base_h = mean(splice, 2003, 2011), mean(hs, 2003, 2011)
        out_c.append({
            "country": c,
            "raw": [round(splice[y] / base_r, 4) for y in range(FIRST, LAST + 1)],
            "harm": [round(hs[y] / base_h, 4) for y in range(FIRST, LAST + 1)],
            "step_raw": round(mean(splice, 2012, 2014) / mean(splice, 2009, 2011), 3),
            "step_harm": round(mean(hs, 2012, 2014) / mean(hs, 2009, 2011), 3),
        })

    proof = json.loads((DATA / "proof.json").read_text())
    sc = proof["step_collapse"]["all"]
    we = proof["worked_example"]
    model = proof["headline"]["methods"]["model"]
    out = {
        "generated_by": "scripts/build_hero.py",
        "fit_version": proof["fit_version"],
        "years": [FIRST, LAST],
        "index_base": [2003, 2011],
        "step_definition": "mean annual count 2012-2014 / mean 2009-2011",
        "countries": out_c,
        "step_collapse": {"n": sc["n"], "within_1_25_harm": sc["within_1_25_harm"], "within_1_25_raw": sc["within_1_25_raw"],
                          "within_factor": proof["step_collapse"]["within_factor"]},
        "worked_example": {"label": we["label"], "year": we["unusual"]["year"], "month": we["unusual"]["month"],
                           "times_median": we["unusual"]["times_median"], "n_years": we["unusual"]["n_years"]},
        "typical_error": {"median_country_month_ape_pct": model["median_country_month_ape_pct"],
                          "test_years": proof["headline"]["test_years"], "n_countries": proof["headline"]["n_countries"]},
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    for c in out_c:
        print(f"{c['country']:10s} step raw x{c['step_raw']:.2f}  harmonized x{c['step_harm']:.2f}")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
