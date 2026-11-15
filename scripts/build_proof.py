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
  headline       one comparison on held-out 2019-2021, the same country-years for
                 every method (heldout_errors.json): median R2, MAE, bias, the
                 number of countries where each method is best, and how many
                 have their 2012 step within x1.25 of Aqua alone.
  limits         what the correction cannot do, computed: held-out error by
                 fire-count tercile and own-fit vs pooled.
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
EXAMPLES = ["Canada"]  # same default country as the Explorer


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


METHODS = ("raw_viirs", "ratio", "threshold", "model")


def headline(params: dict, he: dict) -> dict:
    cs = he["countries"]
    names = sorted(cs)
    assert set(names) == set(params["countries"]), "heldout_errors.json and params_global.json disagree"

    def med(vals):
        vals = [v for v in vals if v is not None]
        return r(median(vals)) if vals else None

    def best(metric: str, lower: bool) -> dict:
        out = {m: 0 for m in METHODS}
        for c in names:
            vals = {m: cs[c]["cell_month"][m][metric] for m in METHODS}
            vals = {m: v for m, v in vals.items() if v is not None}
            if vals:
                out[(min if lower else max)(vals, key=vals.get)] += 1
        return out

    lim = math.log(WITHIN)
    step_n = {m: sum(1 for c in names if cs[c]["step_2012"] and cs[c]["step_2012"][m] > 0
                     and abs(math.log(cs[c]["step_2012"][m] / cs[c]["step_2012"]["aqua"])) <= lim) for m in METHODS}
    rows = {m: {
        "median_r2": med(cs[c]["cell_month"][m]["r2"] for c in names),
        "median_mae": med(cs[c]["cell_month"][m]["mae"] for c in names),
        "median_bias_pct": med(cs[c]["cell_month"][m]["bias_pct"] for c in names),
        "median_abs_bias_pct": med(abs(cs[c]["cell_month"][m]["bias_pct"]) for c in names if cs[c]["cell_month"][m]["bias_pct"] is not None),
        "median_country_month_ape_pct": med(cs[c]["country_month"][m]["median_ape_pct"] for c in names),
        "step_within_1_25": step_n[m],
    } for m in METHODS}
    b_mae, b_r2 = best("mae", True), best("r2", False)
    for m in METHODS:
        rows[m]["best_mae"], rows[m]["best_r2"] = b_mae[m], b_r2[m]
    lower_mae_than_ratio = sum(cs[c]["cell_month"]["model"]["mae"] < cs[c]["cell_month"]["ratio"]["mae"] for c in names)
    return {
        "definition": "Held-out 2019-2021 (fit on 2012-2018, nothing tuned on the test years). Every method is scored on the same "
                      "H3 res-5 cell x month table for the same countries and years (scripts/build_heldout_errors.py). Medians are over "
                      "countries. best_* = the method with the lowest MAE (highest R2) in that country. step_within_1_25 = countries whose "
                      "2012 step (mean 2012-2014 / mean Aqua 2009-2011) is within x1.25 of the step of Aqua alone, the unchanged sensor.",
        "test_years": he["test_years"],
        "n_countries": len(names),
        "n_own": sum(params["countries"][c]["fit_source"] == "own" for c in names),
        "n_pooled": sum(params["countries"][c]["fit_source"] == "pooled" for c in names),
        "n_unfitted": len(params["failed"]),
        "n_cell_months": sum(cs[c]["cell_month"]["model"]["n_cell_months"] for c in names),
        "within_factor": WITHIN,
        "model_lower_mae_than_ratio": lower_mae_than_ratio,
        "methods": rows,
    }


def calibration(cs: dict, params: dict) -> dict:
    """Does the typical error describe unseen months? Typical error from 2019-2020 only; share of 2021 months within it."""
    def agg(sub):
        rows = [cs[c]["country_month"]["calibration"] for c in sub]
        rows = [x for x in rows if x["n_2021_within"] is not None]
        n, k = sum(x["n_2021"] for x in rows), sum(x["n_2021_within"] for x in rows)
        return {"n_countries": len(rows), "n_months_2021": n, "n_within": k, "share_within": r(k / n, 3) if n else None,
                "median_country_share": r(median(x["n_2021_within"] / x["n_2021"] for x in rows), 3) if rows else None}
    own = [c for c in cs if params["countries"][c]["fit_source"] == "own"]
    pooled = [c for c in cs if params["countries"][c]["fit_source"] == "pooled"]
    return {"definition": "Each country's median monthly miss over its 2019-2020 held-out months, then the share of its 2021 "
                          "country-months whose miss is within that median. About 0.5 means the typical error carries over to "
                          "unseen months; well below 0.5 means it understates the error.",
            "all": agg(list(cs)), "own": agg(own), "pooled": agg(pooled)}


def limits(params: dict, he: dict) -> dict:
    cs = he["countries"]
    names = sorted(cs, key=lambda c: cs[c]["country_month"]["obs_total"])
    k = len(names)
    cuts = [names[: k // 3], names[k // 3: 2 * k // 3], names[2 * k // 3:]]

    def stats(sub: list[str]) -> dict:
        ape = [cs[c]["country_month"]["model"]["median_ape_pct"] for c in sub]
        ape = [v for v in ape if v is not None]
        r2 = [cs[c]["cell_month"]["model"]["r2"] for c in sub if cs[c]["cell_month"]["model"]["r2"] is not None]
        bias = [abs(cs[c]["cell_month"]["model"]["bias_pct"]) for c in sub if cs[c]["cell_month"]["model"]["bias_pct"] is not None]
        tot = [cs[c]["country_month"]["obs_total"] for c in sub]
        return {"n": len(sub), "heldout_aqua_min": r(min(tot), 0), "heldout_aqua_max": r(max(tot), 0),
                "median_country_month_ape_pct": r(median(ape), 1) if ape else None,
                "median_abs_bias_pct": r(median(bias), 1) if bias else None,
                "median_r2": r(median(r2)) if r2 else None, "r2_below_zero": sum(v < 0 for v in r2)}

    own = [c for c in cs if params["countries"][c]["fit_source"] == "own"]
    pooled = [c for c in cs if params["countries"][c]["fit_source"] == "pooled"]
    return {
        "definition": "Model only, held-out 2019-2021. Countries ranked by their held-out Aqua MODIS total (2019-2021 daytime vegetation "
                      "detections) and split into three equal-count groups. country_month_ape = |predicted - observed| / observed for a "
                      "whole-country monthly total, median over months with observed > 0, then median over countries. A typical held-out "
                      "miss, not a confidence interval and with no coverage guarantee.",
        "calibration": calibration(cs, params),
        "terciles": [stats(x) for x in cuts],
        "per_country_fields": ["median_ape_pct", "p80_ape_pct", "tercile (0 = fewest fires)", "heldout_aqua_total"],
        "per_country": {c: [r(cs[c]["country_month"]["model"]["median_ape_pct"], 1), r(cs[c]["country_month"]["model"]["p80_ape_pct"], 1),
                            next(i for i, g in enumerate(cuts) if c in g), r(cs[c]["country_month"]["obs_total"], 0)] for c in sorted(cs)},
        "own": stats(own),
        "pooled": stats(pooled),
    }


EXAMPLE_BOX = (141.0, -37.5, 153.7, -28.2)  # west, south, east, north: a box over New South Wales, Australia
EXAMPLE_YEARS = (2003, 2025)  # whole years of the harmonized record (Aqua's first full year onwards)


def _densify(ring: list[tuple[float, float]], step: float = 1.0) -> list[tuple[float, float]]:
    """Same as web/src/lib/aoi.ts densify: points along each edge at most `step` degrees apart."""
    out = []
    for i, (x0, y0) in enumerate(ring):
        x1, y1 = ring[(i + 1) % len(ring)]
        n = max(1, math.ceil(max(abs(x1 - x0), abs(y1 - y0)) / step))
        out += [(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(n)]
    return out


def unusual_month(series: dict[tuple[int, int], float], years: tuple[int, int]) -> dict:
    """The month whose value has the highest percentile within its own calendar month over `years`
    (share of those years with a strictly lower value); ties broken by the excess over that calendar
    month's median. The reported reference (median, range, next highest, times median) uses the
    other years of that calendar month only, excluding the month itself. Same rule as
    web/src/lib/unusual.ts."""
    best = None
    for (y, m), v in series.items():
        if not years[0] <= y <= years[1]:
            continue
        same = [series.get((yy, m), 0.0) for yy in range(years[0], years[1] + 1)]
        med = median(same)
        key = (sum(x < v for x in same) / len(same), v - med)
        if best is None or key > best[0]:
            others = sorted(x for yy, x in zip(range(years[0], years[1] + 1), same) if yy != y)
            om = median(others)
            best = (key, {"year": y, "month": m, "value": r(v, 1), "median": r(om, 1), "min": r(min(others), 1), "max": r(max(others), 1),
                          "next_highest": r(others[-1], 1), "rank": 1 + sum(x > v for x in same), "n_years": len(same),
                          "n_reference_years": len(others), "times_median": r(v / om, 1) if om else None})
    return best[1]


def worked_example(params: dict) -> dict:
    import h3
    w, s_, e, n = EXAMPLE_BOX
    ring = [(w, s_), (e, s_), (e, n), (w, n)]
    cells = sorted(h3.polygon_to_cells(h3.LatLngPoly([(y, x) for x, y in _densify(ring)]), 4))
    files = sorted({h3.cell_to_parent(c, 1) for c in cells})
    df = pl.concat([pl.read_parquet(DATA / "area" / f"{f}.parquet") for f in files if (DATA / "area" / f"{f}.parquet").exists()],
                   how="vertical_relaxed").filter(pl.col("cell").is_in(cells))
    harm = df.filter(pl.col("n_harm").is_not_null()).group_by("year", "month").agg(pl.col("n_harm").sum())
    series = {(y, m): float(v) for y, m, v in harm.iter_rows()}
    raw = df.with_columns(pl.when(pl.col("year") >= 2012).then(pl.col("n_viirs")).otherwise(pl.col("n_modis")).alias("raw")) \
            .group_by("year", "month").agg(pl.col("raw").sum())
    raw_s = {(y, m): float(v) for y, m, v in raw.iter_rows()}
    u = unusual_month(series, EXAMPLE_YEARS)
    by_country = df.group_by("country").agg(pl.col("n_viirs").sum()).sort("n_viirs", descending=True)
    main = by_country["country"][0]
    return {
        "definition": "A drawn box (H3 res-4 cells whose centre is inside it, as the Explorer selects them) summed from "
                      "web/public/data/area/*.parquet. Most unusual month: highest percentile within its own calendar month over "
                      f"{EXAMPLE_YEARS[0]}-{EXAMPLE_YEARS[1]} (share of years with a lower value), ties broken by the excess over that "
                      "month's median. The reference (median, range, next highest) is the other years of that calendar month, the month itself "
                      "excluded, from the same cells and the same harmonized series. Historical context, not a prediction.",
        "label": "New South Wales, Australia (it also clips the edges of Victoria, Queensland and South Australia)",
        "bbox": list(EXAMPLE_BOX),
        "years": list(EXAMPLE_YEARS),
        "n_cells": len(cells),
        "n_cells_with_data": df["cell"].n_unique(),
        "countries": by_country["country"].to_list(),
        "uncorrected_rows": int(df["n_harm"].is_null().sum()),
        "main_country": main,
        "main_country_fit_source": params["countries"][main]["fit_source"],
        "unusual": u,
        "raw_same_month": r(raw_s.get((u["year"], u["month"]), 0.0), 0),
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
    med = {name: r(median(per_country[c].get(name, 0) for c in own), 1) for name in series}
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
        "median_per_country": med,
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
    he = json.loads((DATA / "heldout_errors.json").read_text())
    assert he["fit_version"] == params["fit_version"], "heldout_errors.json is from another fit"
    own = sorted(c for c, p in params["countries"].items() if p.get("fit_source") == "own")
    proof = {
        "fit_version": params["fit_version"],
        "generated_by": "scripts/build_proof.py",
        "headline": headline(params, he),
        "limits": limits(params, he),
        "worked_example": worked_example(params),
        "step_collapse": step_collapse(params),
        "benchmark": benchmark(params, vp),
        "records": records(own),
        "seam": seam(countries, own),
    }
    OUT.write_text(json.dumps(proof, separators=(",", ":")))
    sc, bm, rc, sm = proof["step_collapse"]["all"], proof["benchmark"]["all"], proof["records"], proof["seam"]
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")
    print("headline:", json.dumps(proof["headline"]["methods"]))
    print("limits:", json.dumps({k: v for k, v in proof["limits"].items() if k != "per_country"}))
    print("worked example:", json.dumps(proof["worked_example"]))
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
