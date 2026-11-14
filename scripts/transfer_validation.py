#!/usr/bin/env python3
"""E28 transfer validation: how good is a borrowed (pooled) curve out of country?

For every own-fit country in the published global fit, rebuild the pooled
curve exactly as ``fit_harmonization.main()`` does (detection-weighted mean of
the source countries' b0, b1, kappa, weights = n_train_viirs_detections),
leaving the country itself out when it is one of the source countries. Apply
it (a) with kappa re-estimated on the country's own 2012-2018 data for the
pooled curve, exactly as ``fit_country`` does, and (b) with the pooled kappa,
and score on held-out 2019-2021 H3 res-5 cell-months with the fit script's own
``metrics``. The own fit is re-scored from the published coefficients the same
way and must reproduce the published held-out R2 (a self-check).

Analysis only: nothing here changes a published fit or fit version. 2019-2021
is used only to score; no method is selected on it.

Usage: EMBERLINE_DATA=/path/to/data/global_public python3 scripts/transfer_validation.py [Country ...]
Env: TV_JOBS (default 2), TV_ROWS (resumable per-country rows, default data/transfer_validation_rows.json)
"""
from __future__ import annotations

import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("EMBERLINE_DATA", str(ROOT / "data" / "global_public"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fit_harmonization as fh  # noqa: E402

PARAMS = ROOT / "web" / "public" / "data" / "params_global.json"
OUT_JSON = ROOT / "web" / "public" / "data" / "transfer_validation.json"
OUT_ROWS = Path(os.environ.get("TV_ROWS", ROOT / "data" / "transfer_validation_rows.json"))
KEY = ["h3_5", "year", "month"]


def pooled_without(pub: dict, leave_out: str) -> dict:
    """fit_harmonization.main()'s pooled model, minus one source country."""
    src = [c for c in pub["pooled_model"]["from_countries"] if c != leave_out]
    rs = [pub["countries"][c] for c in src]
    w = np.array([r["n_train_viirs_detections"] for r in rs], dtype=float)
    return {"b0": float(np.average([r["logistic"]["b0"] for r in rs], weights=w)),
            "b1": float(np.average([r["logistic"]["b1"] for r in rs], weights=w)),
            "kappa": float(np.average([r["kappa"] for r in rs], weights=w)),
            "n_sources": len(src)}


def score(country: str, pub: dict) -> dict:
    r = pub["countries"][country]
    d = fh.load(country).filter(pl.col("year").is_between(fh.TRAIN[0], fh.TEST[1]))
    v = d.filter(pl.col("platform") == "Suomi-NPP")
    aqua = d.filter(pl.col("platform") == "Aqua")
    del d
    n_aqua_tr = fh.years(aqua, fh.TRAIN).height
    obs = fh.cell_month(fh.years(aqua, fh.TEST), None, "obs")
    frp = v["frp_mw"].to_numpy()

    def run(b0, b1, kappa=None):
        vv = v.with_columns(pl.Series("p", fh.prob(frp, b0, b1)))
        if kappa is None:  # fit_country's kappa rule, applied to this curve
            kappa = n_aqua_tr / float(fh.years(vv, fh.TRAIN)["p"].sum())
        model = fh.cell_month(fh.years(vv.with_columns((pl.col("p") * kappa).alias("m")), fh.TEST), "m", "model")
        j = obs.join(model, on=KEY, how="full", coalesce=True).fill_null(0)
        m = fh.metrics(j["model"].to_numpy(), j["obs"].to_numpy().astype(float))
        return {"r2": m["r2"], "bias_pct": m["bias_pct"], "rmse": m["rmse"], "kappa": kappa,
                "frp50_mw": float(np.exp(-b0 / b1)) if b1 > 0 else None, "n_cell_months": m["n_cell_months"]}

    lg = r["logistic"]
    pool = pooled_without(pub, country)
    return {"country": country, "in_pool_sources": country in pub["pooled_model"]["from_countries"],
            "n_train_viirs": r["n_train_viirs_detections"], "pool_n_sources": pool["n_sources"],
            "published": {"r2": r["validation_test"]["model"]["r2"],
                          "bias_pct": r["validation_test"]["model"]["bias_pct"]},
            "own": run(lg["b0"], lg["b1"], r["kappa"]),
            "pooled_curve_own_kappa": run(pool["b0"], pool["b1"]),
            "pooled_curve_pooled_kappa": run(pool["b0"], pool["b1"], pool["kappa"])}


def _safe(c: str, pub: dict) -> dict:
    try:
        return score(c, pub)
    except Exception as e:  # noqa: BLE001  reported, not fatal
        return {"country": c, "error": f"{type(e).__name__}: {e}"}


def med(xs):
    xs = [x for x in xs if x is not None]
    return float(np.median(xs)) if xs else None


def summarise(rows: list[dict]) -> dict:
    out = {"n": len(rows)}
    for k in ("own", "pooled_curve_own_kappa", "pooled_curve_pooled_kappa"):
        r2 = [r[k]["r2"] for r in rows]
        out[k] = {"median_r2": med(r2),
                  "n_r2_below_0": sum(1 for x in r2 if x is not None and x < 0),
                  "median_abs_bias_pct": med([abs(r[k]["bias_pct"]) for r in rows if r[k]["bias_pct"] is not None])}
    for k, name in (("pooled_curve_own_kappa", "own_kappa"), ("pooled_curve_pooled_kappa", "pooled_kappa")):
        loss = [r["own"]["r2"] - r[k]["r2"] for r in rows if r["own"]["r2"] is not None and r[k]["r2"] is not None]
        out[f"median_r2_loss_{name}"] = med(loss)
        out[f"n_pooled_beats_own_{name}"] = sum(1 for x in loss if x < 0)
    return out


def main() -> int:
    pub = json.loads(PARAMS.read_text())
    own = [c for c, r in pub["countries"].items() if r["fit_source"] == "own"]
    done = {}
    if OUT_ROWS.exists():
        done = {r["country"]: r for r in json.loads(OUT_ROWS.read_text()) if "error" not in r}
    todo = [c for c in (sys.argv[1:] or own) if c not in done]
    todo.sort(key=lambda c: (fh.DATA / f"detections_{c}.parquet").stat().st_size)
    OUT_ROWS.parent.mkdir(parents=True, exist_ok=True)
    with ProcessPoolExecutor(int(os.environ.get("TV_JOBS", "2"))) as ex:
        for res in ex.map(_safe, todo, [pub] * len(todo)):
            done[res["country"]] = res
            if "error" in res:
                print(res["country"], "ERROR", res["error"], flush=True)
            else:
                f = lambda x: "None" if x is None else f"{x:.3f}"  # noqa: E731
                print(f"{res['country']}: own={f(res['own']['r2'])} published={f(res['published']['r2'])} "
                      f"pooled+ownK={f(res['pooled_curve_own_kappa']['r2'])} "
                      f"pooled+pooledK={f(res['pooled_curve_pooled_kappa']['r2'])}", flush=True)
            OUT_ROWS.write_text(json.dumps(list(done.values()), indent=1, default=float))
    rows = [r for c, r in done.items() if "error" not in r and c in own]
    diffs = [abs(r["own"]["r2"] - r["published"]["r2"]) for r in rows
             if r["own"]["r2"] is not None and r["published"]["r2"] is not None]
    summary = {
        "analysis": "E28 leave-one-country-out transfer validation (analysis only, not a published fit)",
        "fit_version": pub["fit_version"],
        "method": "pooled curve = n_train_viirs-weighted mean of the published pool sources' b0, b1, kappa, "
                  "excluding the scored country; applied with own kappa (2012-2018 rule) and with pooled kappa; "
                  "scored on 2019-2021 H3 res-5 cell-months against observed Aqua with fit_harmonization.metrics",
        "n_countries": len(rows),
        "errors": sorted(c for c, r in done.items() if "error" in r),
        "own_fit_reproduction_max_abs_r2_diff": max(diffs) if diffs else None,
        "all_own_fit_countries": summarise(rows),
        "pool_sources_left_out": summarise([r for r in rows if r["in_pool_sources"]]),
        "not_pool_sources": summarise([r for r in rows if not r["in_pool_sources"]]),
    }
    if len(sys.argv) == 1:
        OUT_JSON.write_text(json.dumps(summary, indent=2, default=float) + "\n")
    print(json.dumps(summary, indent=2, default=float))
    return 0


if __name__ == "__main__":
    sys.exit(main())
