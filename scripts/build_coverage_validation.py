#!/usr/bin/env python3
"""Additive data-contract outputs for the global fit. Changes no fitted number.

1. params_global.json: adds `coef_ci_estimated` (bool) to every country. The
   fit skipped coefficient resampling for borrowed (pooled) curves, so their
   `b0_ci95` / `b1_ci95` / `frp_at_p50_ci95_mw` are the point value twice, not
   an interval. Nothing else in the file changes (checked: the re-serialised
   file differs only by the added lines).
2. coverage_status.json: one reason-coded status per built country, with the
   counts that justify it. Each of the 66 `failed` countries is re-run through
   `fit_harmonization.fit_country` (nothing is written from that run) and the
   line it fails on must match the status derived from the counts.
3. validation_points.json: held-out (2019-2021) observed-vs-predicted pairs at
   H3 res-5 cell x month, plus a training-only multiplicative calibration
   baseline. The model is evaluated with the *published* b0, b1 and kappa
   using fit_harmonization's own `prob`, `cell_month`, `years`, `metrics`; its
   R^2 must reproduce the published `r2` to 1e-6 or the script refuses to write.

Usage: .venv/bin/python scripts/build_coverage_validation.py [--jobs N]
Inputs: data/global_public/detections_<Country>.parquet, web/public/data/*.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import traceback
import zlib
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("EMBERLINE_DATA", str(ROOT / "data" / "global_public"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import h3.api.basic_int as H3I  # noqa: E402
import numpy as np  # noqa: E402
import polars as pl  # noqa: E402

import fit_harmonization as fh  # noqa: E402

DATA = Path(os.environ["EMBERLINE_DATA"])
WEB = ROOT / "web" / "public" / "data"
PARAMS = WEB / "params_global.json"
KEYS = ["h3_5", "year", "month"]
MAX_POINTS = 300
SEED = 20261114
R2_TOL = 1e-6
STATUSES = ["own_fit", "borrowed_fit", "insufficient_training_observations",
            "insufficient_reference_observations", "insufficient_heldout_variation",
            "numerical_fit_failure", "no_observations"]


# ------------------------------------------------------------------ loading
def load_window(country: str) -> pl.DataFrame:
    """Aqua and Suomi-NPP detections 2009-2021 with the fit's H3 res-5 cell.

    Same cell definition as fit_harmonization.load (res-7 cell, then its res-5
    parent); restricted to the years used here so the largest countries load
    faster. The R^2 reproduction check proves the two agree."""
    d = (pl.scan_parquet(DATA / f"detections_{country}.parquet")
         .select("lat", "lon", "acq_ts", "platform", "frp_mw")
         .with_columns(pl.col("acq_ts").dt.year().alias("year"), pl.col("acq_ts").dt.month().alias("month"))
         .filter(pl.col("year").is_between(2009, 2021)).drop("acq_ts").collect())
    lat, lon = d["lat"].to_numpy(), d["lon"].to_numpy()
    c7 = np.fromiter((H3I.latlng_to_cell(a, b, 7) for a, b in zip(lat, lon)), dtype=np.uint64, count=len(lat))
    u7, inv = np.unique(c7, return_inverse=True)
    u5 = np.fromiter((H3I.cell_to_parent(int(c), 5) for c in u7), dtype=np.uint64, count=len(u7))
    return d.drop("lat", "lon").with_columns(pl.Series("h3_5", u5[inv]))


def counts(d: pl.DataFrame) -> dict:
    aqua = d.filter(pl.col("platform") == "Aqua")
    viirs = d.filter((pl.col("platform") == "Suomi-NPP") & (pl.col("year") >= 2012))
    modis = d.filter(pl.col("platform").is_in(["Aqua", "Terra"]))
    test_obs = fh.cell_month(fh.years(aqua, fh.TEST), None, "obs")
    test_raw = fh.cell_month(fh.years(viirs, fh.TEST), None, "raw")
    test = test_obs.join(test_raw, on=KEYS, how="full", coalesce=True).fill_null(0)
    train = (fh.cell_month(fh.years(aqua, fh.TRAIN), None, "obs")
             .join(fh.cell_month(fh.years(viirs, fh.TRAIN), None, "raw"), on=KEYS, how="full", coalesce=True))
    return {
        "n_train_viirs": fh.years(viirs, fh.TRAIN).height,
        "n_train_aqua": fh.years(aqua, fh.TRAIN).height,
        "n_train_viirs_frp_ge_100": fh.years(viirs, fh.TRAIN).filter(pl.col("frp_mw") >= 100).height,
        "n_test_viirs": fh.years(viirs, fh.TEST).height,
        "n_test_aqua": fh.years(aqua, fh.TEST).height,
        "n_train_cell_months": train.height,
        "n_test_cell_months": test.height,
        "n_test_cell_months_with_aqua": int((test["obs"] > 0).sum()),
        "n_test_cells": int(test["h3_5"].n_unique()),
        "n_test_cells_with_aqua": int(test.filter(pl.col("obs") > 0)["h3_5"].n_unique()),
        "n_modis_2009_2011": fh.years(modis, (2009, 2011)).height,
        "n_any_2012_2014": fh.years(d.filter(pl.col("platform").is_in(["Aqua", "Terra", "Suomi-NPP"])), (2012, 2014)).height,
    }


# --------------------------------------------------------- fitted countries
def validate(args: tuple[str, dict]) -> dict:
    country, p = args
    d = load_window(country)
    c = counts(d)
    aqua = d.filter(pl.col("platform") == "Aqua")
    b0, b1, kappa = p["logistic"]["b0"], p["logistic"]["b1"], p["kappa"]
    v = (d.filter((pl.col("platform") == "Suomi-NPP") & (pl.col("year") >= 2012))
         .with_columns(pl.Series("p", fh.prob(d.filter((pl.col("platform") == "Suomi-NPP") & (pl.col("year") >= 2012))["frp_mw"].to_numpy(), b0, b1)))
         .with_columns((pl.col("p") * kappa).alias("aqua_eq")))
    # Same frames and join as fit_harmonization.fit_country.evaluate(TEST).
    obs = fh.cell_month(fh.years(aqua, fh.TEST), None, "obs")
    model = fh.cell_month(fh.years(v, fh.TEST), "aqua_eq", "model")
    raw = fh.cell_month(fh.years(v, fh.TEST), None, "raw")
    j = (obs.join(model, on=KEYS, how="full", coalesce=True)
            .join(raw, on=KEYS, how="full", coalesce=True).fill_null(0).sort(KEYS))
    o = j["obs"].to_numpy().astype(float)
    pm = j["model"].to_numpy().astype(float)
    # Baseline: one ratio, Aqua / Suomi-NPP detections, 2012-2018 only.
    ratio = c["n_train_aqua"] / c["n_train_viirs"] if c["n_train_viirs"] else None
    m_model = fh.metrics(pm, o)
    m_model["mae"] = float(np.abs(o - pm).mean())
    if ratio is None:
        m_base = None
    else:
        pb = ratio * j["raw"].to_numpy().astype(float)
        m_base = fh.metrics(pb, o)
        m_base["mae"] = float(np.abs(o - pb).mean())
    rng = np.random.default_rng([SEED, zlib.crc32(country.encode())])
    idx = np.sort(rng.choice(len(o), MAX_POINTS, replace=False)) if len(o) > MAX_POINTS else np.arange(len(o))
    points = [[int(o[i]), round(float(pm[i]), 3)] for i in idx]
    return {"country": country, "counts": c, "ratio": ratio, "model": m_model, "baseline": m_base,
            "points": points, "n_points_total": int(len(o))}


# --------------------------------------------------------- failed countries
FAIL_SITES = {  # fit_harmonization.py source text of the line each condition fails on
    "train_empty": 'r = float(np.sqrt(((j["obs"] - j["pred"]) ** 2).mean()))',
    "step_window_empty": "return float(annual.filter(pl.col(\"year\").is_between(a, b))[col].mean())",
    "bootstrap_undefined": '"validation_test_ci95": {"r2": np.percentile(r2s, [2.5, 97.5]).tolist(),',
}


def classify_failure(c: dict) -> tuple[str, str, str]:
    """(status, site, condition) from counts, in the order fit_country runs."""
    if c["n_train_aqua"] == 0 and c["n_train_viirs_frp_ge_100"] == 0:
        cond = ("no Aqua detections in 2012-2018 (the training target) and no Suomi-NPP training detection "
                "with FRP >= 100 MW: the threshold-baseline loop (T up to 100 MW) reaches an empty training "
                "cell-month table, polars mean() of the empty column returns None and np.sqrt(None) raises")
        if c["n_train_viirs"] == 0 and c["n_test_aqua"] == 0 and c["n_test_viirs"] == 0:
            return ("no_observations", "train_empty",
                    "no Aqua and no Suomi-NPP detections at all in 2012-2021; " + cond)
        return "insufficient_training_observations", "train_empty", cond
    if c["n_modis_2009_2011"] == 0 or c["n_any_2012_2014"] == 0:
        return ("insufficient_reference_observations", "step_window_empty",
                "no MODIS detections in 2009-2011 (or no detections at all in 2012-2014), so the "
                "null-control step-ratio window is empty; polars mean() returns None and float(None) raises")
    if c["n_test_aqua"] == 0:
        return ("insufficient_reference_observations", "bootstrap_undefined",
                "no Aqua detections in held-out 2019-2021: observed total is 0, so held-out R^2 "
                "(zero variance) and bias % (division by 0) are None and np.percentile over them raises")
    return ("insufficient_heldout_variation", "bootstrap_undefined",
            "held-out Aqua detections fall in too few cells: at least one of the 200 cell-bootstrap "
            "resamples has observed cell-months with zero variance (R^2 None) or zero total (bias None), "
            "and np.percentile over a list containing None raises (depends on the resample draws)")


PUBLISHED_MESSAGE = {  # substring of the TypeError published in params_global.json `failed`
    "train_empty": "has no callable sqrt method",
    "step_window_empty": "float() argument must be",
    "bootstrap_undefined": "not supported between instances of",
}


def diagnose(args: tuple[str, str]) -> dict:
    country, published = args
    d = load_window(country)
    c = counts(d)
    status, site, cond = classify_failure(c)
    try:
        fh.fit_country(country)
        actual = None
    except Exception as e:  # reproduce the published failure, publish nothing
        fr = [f for f in traceback.extract_tb(e.__traceback__) if f.filename.endswith("fit_harmonization.py")][-1]
        actual = fr.line.strip()
    if PUBLISHED_MESSAGE[site] not in published:
        status, cond = "numerical_fit_failure", f"published error does not match the counts: {published}"
    elif actual is None and site != "bootstrap_undefined":
        status, cond = "numerical_fit_failure", "did not fail when re-run; failure not reproducible"
    elif actual is not None and actual != FAIL_SITES[site]:
        status, cond = "numerical_fit_failure", f"failed at an unexpected line: {actual}"
    return {"country": country, "counts": c, "status": status, "condition": cond,
            "failed_line": actual, "reproduced_on_rerun": actual is not None}


def init_pooled(pooled: dict) -> None:
    fh.POOLED.update(pooled)


# --------------------------------------------------------------------- main
def clean(o):
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: clean(x) for k, x in o.items()}
    if isinstance(o, list):
        return [clean(x) for x in o]
    return o


def rnd(x, n=6):
    return None if x is None else round(float(x), n)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=3)
    a = ap.parse_args()
    P = json.loads(PARAMS.read_text())
    fitted, failed = P["countries"], P["failed"]
    built = sorted(p.stem.removeprefix("detections_") for p in DATA.glob("detections_*.parquet"))
    assert set(built) == set(fitted) | set(failed) and not set(fitted) & set(failed), "country sets disagree"
    size = lambda c: -(DATA / f"detections_{c}.parquet").stat().st_size  # noqa: E731

    with Pool(a.jobs, initializer=init_pooled, initargs=(P["pooled_model"],)) as pool:
        diag = {r["country"]: r for r in pool.imap_unordered(diagnose, [(c, failed[c]) for c in sorted(failed, key=size)])}
        print(f"diagnosed {len(diag)} failed countries", flush=True)
        val = {}
        for r in pool.imap_unordered(validate, [(c, fitted[c]) for c in sorted(fitted, key=size)]):
            val[r["country"]] = r
            print(f"  {r['country']}: R2 {r['model']['r2']:.6f}", flush=True)

    # ---- R^2 reproduction check: refuse to publish on mismatch
    diffs = {c: abs(val[c]["model"]["r2"] - fitted[c]["validation_test"]["model"]["r2"]) for c in fitted}
    worst = max(diffs, key=diffs.get)
    print(f"max |R2 recomputed - published| = {diffs[worst]:.3e} ({worst})")
    bad = {c: x for c, x in diffs.items() if not x <= R2_TOL}
    if bad:
        print(f"R2 MISMATCH in {len(bad)} countries, nothing written: {sorted(bad)[:10]}", file=sys.stderr)
        return 1
    bias_diff = max(abs(val[c]["model"]["bias_pct"] - fitted[c]["validation_test"]["model"]["bias_pct"]) for c in fitted)
    n_diff = sum(val[c]["model"]["n_cell_months"] != fitted[c]["validation_test"]["model"]["n_cell_months"] for c in fitted)
    print(f"max |bias recomputed - published| = {bias_diff:.3e} pp; cell-month count mismatches: {n_diff}")
    if n_diff:
        return 1

    # ---- 1. params_global.json: add coef_ci_estimated, change nothing else
    for c, p in fitted.items():
        est = p["fit_source"] == "own" and p["n_train_viirs_detections"] >= 50
        lo_hi = p["logistic"]["b0_ci95"]
        assert est == (lo_hi[0] != lo_hi[1]), f"{c}: CI width disagrees with fit_source"
        items = [(key, x) for key, x in p.items() if key != "coef_ci_estimated"]  # idempotent
        k = [i for i, (key, _) in enumerate(items) if key == "kappa_source"][0] + 1
        fitted[c] = dict(items[:k] + [("coef_ci_estimated", est)] + items[k:])
    PARAMS.write_text(json.dumps(P, indent=2, allow_nan=False))

    # ---- 2. coverage_status.json
    raw = pl.read_parquet(WEB / "calendar_raw_global.parquet", columns=["scope", "key"]).filter(pl.col("scope") == "country")
    has_raw = set(raw["key"].unique().to_list())
    harm = pl.read_parquet(WEB / "calendar_harmonized_global.parquet", columns=["scope", "key"]).filter(pl.col("scope") == "country")
    has_harm = set(harm["key"].unique().to_list())
    out = {}
    for c in built:
        if c in fitted:
            p = fitted[c]
            e = {"status": "own_fit" if p["fit_source"] == "own" else "borrowed_fit",
                 "fit_source": p["fit_source"], "kappa_source": p["kappa_source"],
                 "condition": None, "counts": val[c]["counts"]}
        else:
            r = diag[c]
            e = {"status": r["status"], "fit_source": None, "kappa_source": None,
                 "condition": r["condition"], "counts": r["counts"],
                 "published_error": failed[c], "reproduced_on_rerun": r["reproduced_on_rerun"]}
        e["has_raw_calendar"] = c in has_raw
        e["has_harmonized_calendar"] = c in has_harm
        out[c] = e
    summary = {s: sum(1 for e in out.values() if e["status"] == s) for s in STATUSES}
    cov = {
        "fit_version": P["fit_version"],
        "statuses": STATUSES,
        "summary": summary,
        "n_countries": len(out),
        "thresholds": {
            "MIN_TRAIN_VIIRS": fh.MIN_TRAIN_VIIRS, "MIN_TRAIN_AQUA": fh.MIN_TRAIN_AQUA,
            "borrowed_fit": f"fit_source == 'pooled': fewer than {fh.MIN_TRAIN_VIIRS} Suomi-NPP training detections (2012-2018); "
                            f"kappa also borrowed when fewer than {fh.MIN_TRAIN_AQUA} Aqua training detections",
            "insufficient_training_observations": "n_train_aqua == 0 and n_train_viirs_frp_ge_100 == 0: no Aqua training "
                                                  "target 2012-2018, and the threshold-baseline search (T up to 100 MW) "
                                                  "then meets an empty cell-month table. No minimum above zero is coded",
            "no_observations": "no Aqua and no Suomi-NPP detections at all in 2012-2021",
            "insufficient_reference_observations": "n_modis_2009_2011 == 0 or n_any_2012_2014 == 0 (null-control window empty), "
                                                   "or n_test_aqua == 0 (no held-out Aqua to validate against)",
            "insufficient_heldout_variation": "n_test_aqua > 0 but concentrated in so few cells that a cell-bootstrap resample "
                                              "of the held-out cell-months has zero variance or zero total",
            "numerical_fit_failure": "re-running fit_country did not fail where the counts predict, or the published error "
                                     "does not match the counts (none expected)",
            "verification": "each failed country is re-run through fit_country; the failing line must match the status. "
                            "insufficient_heldout_variation depends on bootstrap draws, so a re-run may not fail "
                            "(reproduced_on_rerun false); the published error type is then the evidence",
        },
        "count_definitions": {
            "n_train_viirs / n_train_aqua": "Suomi-NPP / Aqua daytime vegetation-fire detections, 2012-2018",
            "n_train_viirs_frp_ge_100": "Suomi-NPP training detections with FRP >= 100 MW (largest baseline threshold)",
            "n_test_viirs / n_test_aqua": "same, 2019-2021",
            "n_train_cell_months / n_test_cell_months": "H3 res-5 cell x month with any Aqua or Suomi-NPP detection",
            "n_test_cell_months_with_aqua / n_test_cells / n_test_cells_with_aqua": "held-out cell-months with Aqua > 0; distinct res-5 cells",
            "n_modis_2009_2011": "Aqua + Terra detections 2009-2011 (null-control 'before' window)",
            "n_any_2012_2014": "Aqua + Terra + Suomi-NPP detections 2012-2014 (null-control 'after' window)",
        },
        "has_raw_calendar": "country has rows (scope='country') in calendar_raw_global.parquet",
        "countries": out,
    }
    (WEB / "coverage_status.json").write_text(json.dumps(clean(cov), indent=1, allow_nan=False))

    # ---- 3. validation_points.json
    vp = {}
    for c in sorted(fitted):
        r = val[c]
        fm = lambda m: None if m is None else {"r2": rnd(m["r2"]), "bias_pct": rnd(m["bias_pct"], 3),  # noqa: E731
                                                "mae": rnd(m["mae"]), "rmse": rnd(m["rmse"]), "n_cell_months": m["n_cell_months"]}
        b, mo = r["baseline"], r["model"]
        vp[c] = {
            "fit_source": fitted[c]["fit_source"],
            "model": fm(mo),
            "baseline_multiplicative": None if b is None else dict(fm(b), ratio=rnd(r["ratio"], 6)),
            "model_beats_baseline_r2": None if b is None or b["r2"] is None or mo["r2"] is None else bool(mo["r2"] > b["r2"]),
            "n_points_total": r["n_points_total"],
            "points": r["points"],
        }
    wins = sum(1 for x in vp.values() if x["model_beats_baseline_r2"] is True)
    losses = sum(1 for x in vp.values() if x["model_beats_baseline_r2"] is False)
    undefined = sum(1 for x in vp.values() if x["model_beats_baseline_r2"] is None)
    vpo = {
        "fit_version": P["fit_version"],
        "test_years": list(fh.TEST), "train_years": list(fh.TRAIN),
        "unit": "Aqua MODIS daytime vegetation-fire detections per H3 res-5 cell per month",
        "points_format": "[observed Aqua count, model-predicted Aqua-equivalent count]",
        "sampling": f"at most {MAX_POINTS} held-out cell-months per country, uniform without replacement, "
                    f"numpy default_rng([{SEED}, crc32(country)]); all cell-months when fewer",
        "baseline_definition": "prediction = ratio * Suomi-NPP detections in the cell-month, ratio = Aqua / Suomi-NPP "
                               "detections in the country over 2012-2018 only",
        "metric_definitions": "same cell-month table and formulas as fit_harmonization.metrics (r2 = 1 - SS_res/SS_tot, "
                              "bias_pct = 100*(sum pred - sum obs)/sum obs, rmse); mae = mean |obs - pred|",
        "summary": {"model_beats_baseline": wins, "baseline_beats_or_ties_model": losses, "undefined": undefined},
        "countries": vp,
    }
    (WEB / "validation_points.json").write_text(json.dumps(clean(vpo), separators=(",", ":"), allow_nan=False))
    print("status summary:", summary)
    print(f"model beats baseline on held-out R2: {wins}; does not: {losses}; undefined: {undefined}")
    for f in ("params_global.json", "coverage_status.json", "validation_points.json"):
        print(f, (WEB / f).stat().st_size, "bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
