#!/usr/bin/env python3
"""Build web/public/data/proof.json: the computed numbers behind the Method
"Proof" section. Every number the app shows there is read from this file.

Inputs (all already published under web/public/data/):
  params_global.json                 null_control, validation_test, fit_source
  validation_points.json             training-only ratio baseline (held-out metrics)
  countries.json                     annual raw / harmonized series per country
  calendar_raw_global.parquet        monthly MODIS / VIIRS counts per country
  calendar_harmonized_global.parquet monthly harmonized counts per country

Sections:
  step_collapse  2012 step (mean 2012-2014 / mean 2009-2011) per fitted country:
                 Aqua-only, naive raw splice, harmonized.
  benchmark      held-out 2019-2021 cell-month metrics: model vs ratio baseline
                 vs FRP threshold vs raw VIIRS, per country and counted.
  records        "False-Record Counter": share of country-months 2012-2021 above
                 the 2003-2011 maximum of the same calendar month.
  seam           "Find the Seam": year of the largest |log step| between
                 consecutive 3-year means, candidate years 2006-2019.

Usage: python3 scripts/build_proof.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from statistics import median

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
OUT = DATA / "proof.json"

WITHIN = 1.25  # "within x1.25 of the diagonal"
BASE_YEARS = (2003, 2011)
TEST_YEARS = (2012, 2021)
CANDIDATES = list(range(2006, 2020))  # 3 years before and after stay inside 2003-2021
EXAMPLES = ["India", "Brazil"]


def r(v: float | None, dp: int = 4) -> float | None:
    return None if v is None or not math.isfinite(v) else round(v, dp)


def step_collapse(params: dict) -> dict:
    rows = []
    for c, p in sorted(params["countries"].items()):
        nc = p.get("null_control") or {}
        raw, aqua, harm = (nc.get(k) for k in ("spliced_raw_step_ratio_2012", "aqua_only_step_ratio_2012", "harmonized_step_ratio_2012"))
        if not all(isinstance(v, (int, float)) and v > 0 and math.isfinite(v) for v in (raw, aqua, harm)):
            continue
        rows.append({"country": c, "fit_source": p.get("fit_source"), "aqua": r(aqua), "raw": r(raw), "harm": r(harm)})

    def summary(sub: list[dict]) -> dict:
        lr = [abs(math.log(x["raw"] / x["aqua"])) for x in sub]
        lh = [abs(math.log(x["harm"] / x["aqua"])) for x in sub]
        lim = math.log(WITHIN)
        return {
            "n": len(sub),
            "median_abs_log_raw_over_aqua": r(median(lr)),
            "median_abs_log_harm_over_aqua": r(median(lh)),
            "median_factor_raw": r(math.exp(median(lr)), 3),
            "median_factor_harm": r(math.exp(median(lh)), 3),
            "within_1_25_raw": sum(v <= lim for v in lr),
            "within_1_25_harm": sum(v <= lim for v in lh),
            "raw_above_aqua": sum(x["raw"] > x["aqua"] for x in sub),
        }

    return {
        "definition": "step = mean annual count 2012-2014 / mean 2009-2011 (params_global.json null_control). "
                      "Aqua-only uses one unchanged sensor; raw splices MODIS (to 2011) onto VIIRS (from 2012).",
        "within_factor": WITHIN,
        "all": summary(rows),
        "own": summary([x for x in rows if x["fit_source"] == "own"]),
        "pooled": summary([x for x in rows if x["fit_source"] == "pooled"]),
        "countries": rows,
    }


def benchmark(params: dict, vp: dict) -> dict:
    rows = []
    for c, p in sorted(params["countries"].items()):
        vt = p.get("validation_test") or {}
        b = (vp["countries"].get(c) or {}).get("baseline_multiplicative")
        m2 = (vp["countries"].get(c) or {}).get("model") or {}
        rows.append({
            "country": c,
            "fit_source": p.get("fit_source"),
            "n_cell_months": (vt.get("model") or {}).get("n_cell_months"),
            "model": {"r2": r(vt["model"]["r2"]), "rmse": r(vt["model"]["rmse"]), "bias_pct": r(vt["model"]["bias_pct"], 2), "mae": r(m2.get("mae"))},
            "ratio": None if not b else {"r2": r(b["r2"]), "rmse": r(b["rmse"]), "bias_pct": r(b["bias_pct"], 2), "mae": r(b["mae"])},
            "threshold": {"r2": r(vt["threshold"]["r2"]), "rmse": r(vt["threshold"]["rmse"]), "bias_pct": r(vt["threshold"]["bias_pct"], 2)},
            "raw_viirs": {"r2": r(vt["raw_viirs"]["r2"]), "rmse": r(vt["raw_viirs"]["rmse"]), "bias_pct": r(vt["raw_viirs"]["bias_pct"], 2)},
        })

    def counts(sub: list[dict]) -> dict:
        def beats(base: str, metric: str, lower: bool) -> int:
            n = 0
            for x in sub:
                a, b = x["model"].get(metric), (x[base] or {}).get(metric)
                if a is None or b is None:
                    continue
                n += (a < b) if lower else (a > b)
            return n

        def med(series: str, metric: str) -> float | None:
            vals = [(x[series] or {}).get(metric) for x in sub]
            vals = [v for v in vals if v is not None]
            return r(median(vals)) if vals else None

        return {
            "n": len(sub),
            "n_with_ratio": sum(x["ratio"] is not None for x in sub),
            "beats_ratio_r2": beats("ratio", "r2", False),
            "beats_ratio_mae": beats("ratio", "mae", True),
            "beats_ratio_rmse": beats("ratio", "rmse", True),
            "beats_threshold_r2": beats("threshold", "r2", False),
            "beats_threshold_rmse": beats("threshold", "rmse", True),
            "beats_raw_r2": beats("raw_viirs", "r2", False),
            "beats_raw_rmse": beats("raw_viirs", "rmse", True),
            "median_r2": {s: med(s, "r2") for s in ("model", "ratio", "threshold", "raw_viirs")},
            "median_rmse": {s: med(s, "rmse") for s in ("model", "ratio", "threshold", "raw_viirs")},
            "median_mae": {s: med(s, "mae") for s in ("model", "ratio")},
            "model_r2_below_zero": sum((x["model"]["r2"] or 0) < 0 for x in sub),
        }

    return {
        "definition": "Held-out 2019-2021 cell-months (H3 res-5, monthly Aqua daytime counts), fit on 2012-2018. "
                      "Model, threshold and raw VIIRS from params_global.json validation_test; "
                      "ratio baseline (training-only Aqua/Suomi-NPP ratio x VIIRS count) and MAE from validation_points.json.",
        "ratio_definition": vp.get("baseline_definition"),
        "all": counts(rows),
        "own": counts([x for x in rows if x["fit_source"] == "own"]),
        "pooled": counts([x for x in rows if x["fit_source"] == "pooled"]),
        "countries": rows,
    }


def monthly(own: list[str]) -> dict[str, pl.DataFrame]:
    raw = pl.read_parquet(DATA / "calendar_raw_global.parquet").filter((pl.col("scope") == "country") & pl.col("key").is_in(own))
    harm = pl.read_parquet(DATA / "calendar_harmonized_global.parquet").filter((pl.col("scope") == "country") & pl.col("key").is_in(own))
    grid = pl.DataFrame({"key": own}).join(pl.DataFrame({"year": list(range(BASE_YEARS[0], TEST_YEARS[1] + 1))}), how="cross").join(
        pl.DataFrame({"month": list(range(1, 13))}), how="cross")
    grid = grid.with_columns(pl.col("year").cast(pl.Int32), pl.col("month").cast(pl.Int8))

    def on_grid(df: pl.DataFrame, col: str) -> pl.DataFrame:
        df = df.with_columns(pl.col("year").cast(pl.Int32), pl.col("month").cast(pl.Int8))
        return grid.join(df.select("key", "year", "month", pl.col(col).cast(pl.Float64).alias("v")), on=["key", "year", "month"], how="left").fill_null(0.0)

    modis = raw.filter(pl.col("sensor") == "MODIS").group_by("key", "year", "month").agg(pl.col("n_detections").sum())
    viirs = raw.filter(pl.col("sensor") == "VIIRS").group_by("key", "year", "month").agg(pl.col("n_detections").sum())
    m, v = on_grid(modis, "n_detections"), on_grid(viirs, "n_detections")
    splice = m.join(v, on=["key", "year", "month"], suffix="_v").with_columns(
        pl.when(pl.col("year") <= 2011).then(pl.col("v")).otherwise(pl.col("v_v")).alias("v")).select("key", "year", "month", "v")
    return {"raw_splice": splice, "modis": m, "harmonized": on_grid(harm, "n_harmonized")}


def records(own: list[str]) -> dict:
    series = monthly(own)
    per_country: dict[str, dict] = {c: {} for c in own}
    shares = {}
    for name, df in series.items():
        base = df.filter(pl.col("year").is_between(*BASE_YEARS)).group_by("key", "month").agg(pl.col("v").max().alias("base_max"))
        test = df.filter(pl.col("year").is_between(*TEST_YEARS)).join(base, on=["key", "month"])
        test = test.with_columns((pl.col("v") > pl.col("base_max")).alias("rec"))
        shares[name] = {"flagged": int(test["rec"].sum()), "of": test.height, "share": r(test["rec"].mean())}
        for row in test.group_by("key").agg(pl.col("rec").sum()).iter_rows():
            per_country[row[0]][name] = int(row[1])
    n_base = BASE_YEARS[1] - BASE_YEARS[0] + 1
    return {
        "definition": f"For each own-fit country, calendar month and year {TEST_YEARS[0]}-{TEST_YEARS[1]}: flagged as a record when the "
                      f"monthly count is strictly above the maximum of that calendar month over {BASE_YEARS[0]}-{BASE_YEARS[1]}. "
                      "raw_splice = MODIS to 2011 then VIIRS from 2012 (calendar_raw_global); modis = MODIS Terra+Aqua all years; "
                      "harmonized = calendar_harmonized_global. Months with no row count as 0.",
        "n_countries": len(own),
        "per_country_of": 12 * (TEST_YEARS[1] - TEST_YEARS[0] + 1),
        "chance_reference": {
            "share": r(1 / (n_base + 1)),
            "definition": f"if a year is exchangeable with the {n_base} baseline years (no trend, no ties), the chance it is the largest of the {n_base + 1} is 1/{n_base + 1}",
        },
        "series": shares,
        "examples": EXAMPLES,
        "countries": per_country,
    }


def seam(countries: dict, own: list[str]) -> dict:
    by = {c["country"]: c for c in countries["countries"]}

    def biggest(annual: dict[int, float]) -> int | None:
        best, best_y = -1.0, None
        for y in CANDIDATES:
            before = [annual.get(t, 0.0) for t in range(y - 3, y)]
            after = [annual.get(t, 0.0) for t in range(y, y + 3)]
            a, b = sum(before) / 3, sum(after) / 3
            if a <= 0 or b <= 0:
                continue
            s = abs(math.log(b / a))
            if s > best:
                best, best_y = s, y
        return best_y

    out, skipped = {}, []
    for c in own:
        row = by.get(c)
        if not row:
            skipped.append(c)
            continue
        raw = {a["year"]: float(a["raw"] or 0) for a in row["annual"]}
        harm = {a["year"]: float(a["harm"] or 0) for a in row["annual"] if a.get("harm") is not None}
        out[c] = {"raw": biggest(raw), "harm": biggest(harm)}
    n = len(out)
    return {
        "definition": "For each own-fit country's annual series (countries.json), the candidate year y with the largest "
                      "|log(mean(y..y+2) / mean(y-3..y-1))|. Candidates 2006-2019, so every window stays inside 2003-2021 "
                      "(before the 2022 orbit drift). Candidates with a zero mean are skipped.",
        "candidates": CANDIDATES,
        "n_countries": n,
        "skipped": skipped,
        "raw_2012": sum(v["raw"] == 2012 for v in out.values()),
        "harm_2012": sum(v["harm"] == 2012 for v in out.values()),
        "chance_2012": r(n / len(CANDIDATES), 2),
        "countries": out,
    }


def main() -> None:
    params = json.loads((DATA / "params_global.json").read_text())
    vp = json.loads((DATA / "validation_points.json").read_text())
    countries = json.loads((DATA / "countries.json").read_text())
    own = sorted(c for c, p in params["countries"].items() if p.get("fit_source") == "own")
    proof = {
        "fit_version": params["fit_version"],
        "generated_by": "scripts/build_proof.py",
        "step_collapse": step_collapse(params),
        "benchmark": benchmark(params, vp),
        "records": records(own),
        "seam": seam(countries, own),
    }
    OUT.write_text(json.dumps(proof, separators=(",", ":")))
    sc, bm, rc, sm = proof["step_collapse"]["all"], proof["benchmark"]["all"], proof["records"], proof["seam"]
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")
    print(f"step collapse n={sc['n']}: median factor raw x{sc['median_factor_raw']} harm x{sc['median_factor_harm']}; "
          f"within x1.25 raw {sc['within_1_25_raw']} harm {sc['within_1_25_harm']}")
    print(f"benchmark n={bm['n']}: beats ratio R2 {bm['beats_ratio_r2']}, MAE {bm['beats_ratio_mae']}, RMSE {bm['beats_ratio_rmse']}; "
          f"threshold R2 {bm['beats_threshold_r2']}; raw R2 {bm['beats_raw_r2']}")
    print("records:", {k: v["share"] for k, v in rc["series"].items()}, "of", rc["series"]["raw_splice"]["of"], "chance", rc["chance_reference"]["share"])
    for c in EXAMPLES:
        print(" ", c, rc["countries"][c])
    print(f"seam n={sm['n_countries']}: 2012 biggest raw {sm['raw_2012']}, harm {sm['harm_2012']}, chance {sm['chance_2012']}; skipped {sm['skipped']}")


if __name__ == "__main__":
    main()
