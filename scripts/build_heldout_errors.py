#!/usr/bin/env python3
"""Held-out (2019-2021) error of every method on the same cell-months.

For each fitted country this re-evaluates the published fit (no refit, no
tuning) on the held-out years and writes web/public/data/heldout_errors.json:

  cell_month   per method (model, ratio, threshold, raw_viirs): r2, bias_pct,
               rmse, mae on the H3 res-5 cell x month table that
               fit_harmonization.evaluate(TEST) uses. Every method is scored on
               the identical join, so the comparison is like for like.
  country_month  the same predictions summed to whole-country monthly totals
               (36 months). ape = |pred - obs| / obs per month with obs > 0;
               we publish the median and 80th percentile of ape. This is the
               "typical error" band the Explorer shows next to a country's
               harmonized series.

Inputs: published b0, b1, kappa, threshold_baseline_mw (params_global.json),
the training-only ratio (validation_points.json), and
data/global_public/detections_<Country>.parquet.

The script refuses to write unless the recomputed R^2 of the model, threshold
and raw VIIRS reproduce params_global.json validation_test to 1e-6 and the
model MAE reproduces validation_points.json.

Usage: python3 scripts/build_heldout_errors.py [--jobs N]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
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
OUT = WEB / "heldout_errors.json"
KEYS = ["h3_5", "year", "month"]
TOL = 1e-6
METHODS = ("model", "ratio", "threshold", "raw_viirs")


def load_test(country: str) -> pl.DataFrame:
    d = (pl.scan_parquet(DATA / f"detections_{country}.parquet")
         .select("lat", "lon", "acq_ts", "platform", "frp_mw")
         .with_columns(pl.col("acq_ts").dt.year().alias("year"), pl.col("acq_ts").dt.month().alias("month"))
         .filter(pl.col("year").is_between(2009, fh.TEST[1])).drop("acq_ts").collect())
    lat, lon = d["lat"].to_numpy(), d["lon"].to_numpy()
    c7 = np.fromiter((H3I.latlng_to_cell(a, b, 7) for a, b in zip(lat, lon)), dtype=np.uint64, count=len(lat))
    u7, inv = np.unique(c7, return_inverse=True)
    u5 = np.fromiter((H3I.cell_to_parent(int(c), 5) for c in u7), dtype=np.uint64, count=len(u7))
    return d.drop("lat", "lon").with_columns(pl.Series("h3_5", u5[inv]))


def evaluate(args: tuple[str, dict, float]) -> dict:
    country, p, ratio = args
    full = load_test(country)
    step = step_ratios(full, p, ratio)
    d = full.filter(pl.col("year").is_between(*fh.TEST))
    aqua = d.filter(pl.col("platform") == "Aqua")
    v = d.filter(pl.col("platform") == "Suomi-NPP")
    v = v.with_columns(pl.Series("p", fh.prob(v["frp_mw"].to_numpy(), p["logistic"]["b0"], p["logistic"]["b1"])))
    v = v.with_columns((pl.col("p") * p["kappa"]).alias("aqua_eq"))
    T = p["threshold_baseline_mw"]
    j = (fh.cell_month(aqua, None, "obs")
         .join(fh.cell_month(v, "aqua_eq", "model"), on=KEYS, how="full", coalesce=True)
         .join(fh.cell_month(v, None, "raw"), on=KEYS, how="full", coalesce=True)
         .join(fh.cell_month(v.filter(pl.col("frp_mw") >= T), None, "thr"), on=KEYS, how="full", coalesce=True)
         .fill_null(0).with_columns((pl.col("raw") * ratio).alias("ratio")))
    o = j["obs"].to_numpy().astype(float)
    cols = {"model": "model", "ratio": "ratio", "threshold": "thr", "raw_viirs": "raw"}
    cell = {}
    for m, col in cols.items():
        pr = j[col].to_numpy().astype(float)
        x = fh.metrics(pr, o)
        cell[m] = {k: x[k] for k in ("r2", "bias_pct", "rmse", "n_cell_months")} | {"mae": float(np.abs(o - pr).mean())}
    cm = j.group_by("year", "month").agg([pl.col(c).cast(pl.Float64).sum() for c in ["obs", *set(cols.values())]]).sort("year", "month")
    cm = cm.filter(pl.col("obs") > 0)
    country_month = {"n_months": cm.height, "obs_total": float(cm["obs"].sum())}
    for m, col in cols.items():
        ape = (np.abs(cm[col].to_numpy() - cm["obs"].to_numpy()) / cm["obs"].to_numpy()) if cm.height else np.array([])
        country_month[m] = {"median_ape_pct": float(100 * np.median(ape)) if len(ape) else None,
                            "p80_ape_pct": float(100 * np.percentile(ape, 80)) if len(ape) else None}
    return {"country": country, "cell_month": cell, "country_month": country_month, "step_2012": step}


def step_ratios(d: pl.DataFrame, p: dict, ratio: float) -> dict:
    """2012 step (mean annual 2012-2014 / mean annual Aqua 2009-2011), as in
    fit_harmonization's null control, for every method. Years are the rows
    present in the fit's annual table (any platform with a detection)."""
    v = d.filter((pl.col("platform") == "Suomi-NPP") & (pl.col("year") >= 2012))
    v = v.with_columns((pl.Series(fh.prob(v["frp_mw"].to_numpy(), p["logistic"]["b0"], p["logistic"]["b1"])) * p["kappa"]).alias("aqua_eq"))
    T = p["threshold_baseline_mw"]
    annual = (d.select("year").unique()
              .join(d.filter(pl.col("platform") == "Aqua").group_by("year").len().rename({"len": "aqua"}), on="year", how="left")
              .join(v.group_by("year").agg(pl.len().alias("raw"), pl.col("aqua_eq").sum(),
                                           (pl.col("frp_mw") >= T).sum().alias("thr")), on="year", how="left")
              .fill_null(0))

    def mean(col: str, a: int, b: int) -> float:
        return float(annual.filter(pl.col("year").is_between(a, b))[col].cast(pl.Float64).mean())

    before = mean("aqua", 2009, 2011)
    if not before:
        return {}
    return {"aqua": mean("aqua", 2012, 2014) / before, "model": mean("aqua_eq", 2012, 2014) / before,
            "ratio": ratio * mean("raw", 2012, 2014) / before, "threshold": mean("thr", 2012, 2014) / before,
            "raw_viirs": mean("raw", 2012, 2014) / before}


def rnd(o, n=4):
    if isinstance(o, dict):
        return {k: rnd(v, n) for k, v in o.items()}
    if isinstance(o, float):
        return round(o, n) if np.isfinite(o) else None
    return o


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    P = json.loads((WEB / "params_global.json").read_text())
    VP = json.loads((WEB / "validation_points.json").read_text())
    fitted = P["countries"]
    jobs = [(c, fitted[c], VP["countries"][c]["baseline_multiplicative"]["ratio"]) for c in fitted]
    jobs.sort(key=lambda t: -(DATA / f"detections_{t[0]}.parquet").stat().st_size)
    out = {}
    with Pool(a.jobs) as pool:
        for r in pool.imap_unordered(evaluate, jobs):
            out[r["country"]] = r
            print(f"  {r['country']}", flush=True)

    worst = 0.0
    for c, r in out.items():
        pub = fitted[c]["validation_test"]
        for m in ("model", "threshold", "raw_viirs"):
            a_, b_ = r["cell_month"][m]["r2"], pub[m]["r2"]
            if (a_ is None) != (b_ is None) or (a_ is not None and abs(a_ - b_) > TOL):
                print(f"R2 MISMATCH {c} {m}: {a_} vs {b_}; nothing written", file=sys.stderr)
                return 1
            if a_ is not None:
                worst = max(worst, abs(a_ - b_))
        nc = fitted[c]["null_control"]
        st = r["step_2012"]
        for k, pk in (("aqua", "aqua_only_step_ratio_2012"), ("model", "harmonized_step_ratio_2012")):
            if not st or abs(st[k] / nc[pk] - 1) > 1e-6:
                print(f"STEP MISMATCH {c} {k}: {st.get(k)} vs {nc[pk]}; nothing written", file=sys.stderr)
                return 1
        dm = abs(r["cell_month"]["model"]["mae"] - VP["countries"][c]["model"]["mae"])
        db = abs(r["cell_month"]["ratio"]["mae"] - VP["countries"][c]["baseline_multiplicative"]["mae"])
        if dm > 1e-5 or db > 1e-5:
            print(f"MAE MISMATCH {c}: model {dm}, ratio {db}; nothing written", file=sys.stderr)
            return 1
    print(f"reproduced published R2 (max diff {worst:.2e}) and MAE for {len(out)} countries")
    doc = {
        "fit_version": P["fit_version"],
        "generated_by": "scripts/build_heldout_errors.py",
        "test_years": list(fh.TEST),
        "definition": "Published fit re-evaluated on held-out 2019-2021, no refit. cell_month: H3 res-5 cell x month, same join "
                      "for every method (mae = mean |obs - pred| in Aqua detections per cell-month). country_month: predictions "
                      "summed to the whole country per month; ape = 100*|pred - obs|/obs over months with obs > 0. "
                      "step_2012: mean annual count 2012-2014 under each method / mean annual Aqua count 2009-2011 "
                      "(aqua = Aqua alone, the unchanged-sensor reference; model and aqua reproduce params_global null_control).",
        "countries": {c: rnd({k: v for k, v in out[c].items() if k != "country"}) for c in sorted(out)},
    }
    OUT.write_text(json.dumps(doc, separators=(",", ":"), allow_nan=False))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
