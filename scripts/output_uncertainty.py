#!/usr/bin/env python3
"""E27: propagate logistic-coefficient uncertainty to harmonized country totals.

The published fit saved only marginal 95% intervals for b0 and b1 (no draws,
no covariance), and b0/b1 are strongly correlated, so the intervals cannot be
resampled independently. This script reruns a coefficient bootstrap on the
same 2012-2018 training detections and matching rule as
``fit_harmonization.fit_country`` (its own ``load``/``label_viirs``) and never
changes a published value:

* Resampling unit: H3 res-5 cell (cluster bootstrap, Poisson(1) weight per
  training cell), so spatially correlated detections are not treated as
  independent. B draws (default 200), fixed seed.
* For each draw (b0*, b1*), kappa* is re-derived with the fit script's rule
  (training Aqua count / training sum of P*) on the unweighted training data,
  because kappa is defined as a function of the curve. kappa's own sampling
  uncertainty (Aqua count noise, choice of training years) is NOT included.
  Countries whose kappa is borrowed (kappa_source = pooled) keep the pooled
  kappa fixed.
* Harmonized monthly total for 2012+ = kappa* x sum of P*(frp) over Suomi-NPP
  detections in that month; 2.5/97.5 percentiles over draws. Pre-2012 months
  are observed Aqua counts, no model uncertainty.
* Self-checks: the unweighted fit on the aggregated data must reproduce the
  published b0/b1, and the point totals must reproduce the published country
  calendar.

Not included anywhere: kappa sampling, structural/model-form error, matching
rule choice (see E29), detection-level FIRMS errors, orbital drift after 2021
(see drift.json). Pooled-curve countries: null, "not estimated".

Usage: python3 scripts/output_uncertainty.py [Country ...]
Env: EMBERLINE_DATA (default data/global_public), OU_JOBS (2), OU_BOOT (200),
     OU_ROWS (resumable per-country rows, default data/output_uncertainty_rows.json)
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
CAL = ROOT / "web" / "public" / "data" / "calendar_harmonized_global.parquet"
OUT_JSON = ROOT / "web" / "public" / "data" / "harmonized_uncertainty.json"
OUT_ROWS = Path(os.environ.get("OU_ROWS", ROOT / "data" / "output_uncertainty_rows.json"))
B = int(os.environ.get("OU_BOOT", "200"))
SEED = 20261127

COVERS = {
    "included": ["sampling uncertainty of the logistic coefficients b0, b1 (H3 res-5 cluster bootstrap "
                 "of the 2012-2018 training detections), with kappa re-derived from each bootstrap curve "
                 "by the published kappa rule"],
    "not_included": ["sampling uncertainty of kappa itself (no interval estimated)",
                     "model-form / structural error of the harmonization",
                     "matching-rule choice (see E29 sensitivity)",
                     "orbital-drift effects in 2022-2025 (see drift.json)",
                     "detection-level FIRMS errors, cloud and omission",
                     "uncertainty of observed Aqua counts before 2012 (shown as observed, no interval)"],
}


def wfit(x: np.ndarray, n1: np.ndarray, n: np.ndarray, iters: int = 60) -> tuple[float, float]:
    """Weighted Newton logistic on aggregated (x, successes, trials); same model as fh.fit_logistic."""
    X = np.column_stack([np.ones_like(x), x])
    b = np.zeros(2)
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ b)))
        w = n * p * (1 - p) + 1e-12
        step = np.linalg.solve((X * w[:, None]).T @ X, X.T @ (n1 - n * p))
        b += step
        if np.abs(step).max() < 1e-9:
            break
    return float(b[0]), float(b[1])


def run(country: str, pub: dict) -> dict:
    r = pub["countries"][country]
    d = fh.load(country)
    v = fh.label_viirs(d)
    n_aqua_tr = fh.years(d.filter(pl.col("platform") == "Aqua"), fh.TRAIN).height
    del d
    frp = np.clip(v["frp_mw"].to_numpy(), 0.1, None)
    fu, fidx = np.unique(frp, return_inverse=True)
    xu = np.log(fu)
    yr, mo = v["year"].to_numpy(), v["month"].to_numpy()
    tr = (yr >= fh.TRAIN[0]) & (yr <= fh.TRAIN[1])
    # training aggregated by (cell, frp value): trials and successes
    cu, cidx = np.unique(v["h3_5"].to_numpy()[tr], return_inverse=True)
    seen = v["seen"].to_numpy()[tr].astype(np.int64)
    key = cidx.astype(np.int64) * len(fu) + fidx[tr]
    ku, kinv = np.unique(key, return_inverse=True)
    k_n = np.bincount(kinv).astype(float)
    k_s = np.bincount(kinv, weights=seen).astype(float)
    k_cell, k_f = ku // len(fu), ku % len(fu)
    tr_counts = np.bincount(fidx[tr], minlength=len(fu)).astype(float)
    # all years: counts per (year-month, frp value)
    ym = (yr - 2012) * 12 + (mo - 1)
    nym = int(ym.max()) + 1
    mkey = ym.astype(np.int64) * len(fu) + fidx
    mu, minv = np.unique(mkey, return_inverse=True)
    m_cnt = np.bincount(minv).astype(float)
    m_ym, m_f = mu // len(fu), mu % len(fu)
    del v

    def totals(b0, b1):
        p = 1 / (1 + np.exp(-(b0 + b1 * xu)))
        kappa = r["kappa"] if r["kappa_source"] == "pooled" else n_aqua_tr / float(tr_counts @ p)
        return kappa * np.bincount(m_ym, weights=m_cnt * p[m_f], minlength=nym), kappa

    def fit_w(cw):
        w = cw[k_cell]
        n = np.bincount(k_f, weights=k_n * w, minlength=len(fu))
        s = np.bincount(k_f, weights=k_s * w, minlength=len(fu))
        keep = n > 0
        return wfit(xu[keep], s[keep], n[keep])

    b0, b1 = fit_w(np.ones(len(cu)))
    lg = r["logistic"]
    point, kappa = totals(lg["b0"], lg["b1"])
    rng = np.random.default_rng([SEED, sum(map(ord, country))])
    draws, coefs = [], []
    for _ in range(B):
        bb = fit_w(rng.poisson(1.0, len(cu)).astype(float))
        coefs.append(bb)
        draws.append(totals(*bb)[0])
    draws = np.array(draws)
    ann_draws = draws.reshape(B, -1, 12).sum(axis=2) if nym % 12 == 0 else None
    if ann_draws is None:  # pad to whole years
        pad = np.zeros((B, (-nym) % 12))
        ann_draws = np.concatenate([draws, pad], 1).reshape(B, -1, 12).sum(axis=2)
        point_p = np.concatenate([point, np.zeros((-nym) % 12)])
    else:
        point_p = point
    ann_point = point_p.reshape(-1, 12).sum(axis=1)
    lo_m, hi_m = np.percentile(draws, [2.5, 97.5], axis=0)
    lo_a, hi_a = np.percentile(ann_draws, [2.5, 97.5], axis=0)
    coefs = np.array(coefs)
    return {
        "country": country, "n_train_cells": int(len(cu)), "n_boot": B,
        "refit_b0": b0, "refit_b1": b1, "published_b0": lg["b0"], "published_b1": lg["b1"],
        "kappa_point": kappa, "kappa_source": r["kappa_source"],
        "boot_b0_ci95": np.percentile(coefs[:, 0], [2.5, 97.5]).tolist(),
        "boot_b1_ci95": np.percentile(coefs[:, 1], [2.5, 97.5]).tolist(),
        "boot_corr_b0_b1": float(np.corrcoef(coefs.T)[0, 1]),
        "annual": {str(2012 + i): [float(ann_point[i]), float(lo_a[i]), float(hi_a[i])]
                   for i in range(len(ann_point))},
        "monthly": {f"{2012 + i // 12}-{i % 12 + 1:02d}": [float(point[i]), float(lo_m[i]), float(hi_m[i])]
                    for i in range(nym)},
    }


def _safe(c, pub):
    try:
        return run(c, pub)
    except Exception as e:  # noqa: BLE001
        return {"country": c, "error": f"{type(e).__name__}: {e}"}


def main() -> int:
    pub = json.loads(PARAMS.read_text())
    own = [c for c, r in pub["countries"].items() if r["fit_source"] == "own"]
    done = {}
    if OUT_ROWS.exists():
        done = {x["country"]: x for x in json.loads(OUT_ROWS.read_text()) if "error" not in x}
    todo = [c for c in (sys.argv[1:] or own) if c not in done]
    todo.sort(key=lambda c: (fh.DATA / f"detections_{c}.parquet").stat().st_size)
    OUT_ROWS.parent.mkdir(parents=True, exist_ok=True)
    with ProcessPoolExecutor(int(os.environ.get("OU_JOBS", "2"))) as ex:
        for res in ex.map(_safe, todo, [pub] * len(todo)):
            done[res["country"]] = res
            if "error" in res:
                print(res["country"], "ERROR", res["error"], flush=True)
            else:
                print(f"{res['country']}: refit b0 diff {res['refit_b0'] - res['published_b0']:+.1e} "
                      f"corr {res['boot_corr_b0_b1']:+.2f}", flush=True)
            OUT_ROWS.write_text(json.dumps(list(done.values()), default=float))
    if sys.argv[1:]:
        return 0
    write(pub, done)
    return 0


def write(pub: dict, done: dict) -> None:
    cal = (pl.read_parquet(CAL).filter((pl.col("scope") == "country") & (pl.col("year") >= 2012))
           .group_by("key", "year").agg(pl.col("n_harmonized").sum()))
    calmap = {(k, y): n for k, y, n in cal.iter_rows()}
    countries, worst_rel, worst_coef = {}, 0.0, 0.0
    rel_widths = []
    for c, r in sorted(pub["countries"].items()):
        if r["fit_source"] != "own":
            countries[c] = {"status": "not estimated", "reason": "pooled (borrowed) curve: no coefficient "
                            "uncertainty is estimated for the pooled model", "annual": None, "monthly": None}
            continue
        x = done.get(c)
        if x is None or "error" in x:
            countries[c] = {"status": "not computed", "reason": (x or {}).get("error", "missing"),
                            "annual": None, "monthly": None}
            continue
        worst_coef = max(worst_coef, abs(x["refit_b0"] - x["published_b0"]), abs(x["refit_b1"] - x["published_b1"]))
        for y, (pt, lo, hi) in x["annual"].items():
            ref = calmap.get((c, int(y)), 0.0)
            worst_rel = max(worst_rel, abs(pt - ref) / max(ref, 1.0))
            if pt >= 100:
                rel_widths.append((hi - lo) / pt)
        rnd = lambda t: [round(t[0], 1), round(t[1], 1), round(t[2], 1)]  # noqa: E731
        countries[c] = {"status": "estimated", "kappa_source": x["kappa_source"],
                        "n_boot": x["n_boot"], "n_train_cells": x["n_train_cells"],
                        "boot_b0_ci95": x["boot_b0_ci95"], "boot_b1_ci95": x["boot_b1_ci95"],
                        "boot_corr_b0_b1": round(x["boot_corr_b0_b1"], 3),
                        "annual": {y: rnd(t) for y, t in x["annual"].items()},
                        "monthly": {m: rnd(t) for m, t in x["monthly"].items() if t[0] > 0 or t[2] > 0}}
    assert worst_coef < 1e-6, f"refit does not reproduce published coefficients ({worst_coef})"
    assert worst_rel < 1e-6, f"point totals do not reproduce the published calendar ({worst_rel})"
    rw = np.array(rel_widths)
    out = {
        "analysis": "E27 output uncertainty: logistic-coefficient uncertainty propagated to harmonized "
                    "country totals (2012 onwards)",
        "fit_version": pub["fit_version"], "unit": "Aqua-equivalent detections",
        "interval": "2.5th-97.5th percentile over bootstrap draws",
        "columns": ["point", "lower", "upper"],
        "covers": COVERS,
        "method": "H3 res-5 cluster bootstrap (Poisson(1) cell weights) of the 2012-2018 Suomi-NPP training "
                  "detections with the published match labels; logistic refit per draw; kappa re-derived per "
                  "draw by the published rule (own-kappa countries) or held at the pooled value; "
                  "point = published fit, reproduced exactly",
        "pre_2012": "observed Aqua counts; no interval",
        "self_check": {"max_abs_coef_diff_refit_vs_published": worst_coef,
                       "max_rel_diff_point_vs_published_calendar": worst_rel},
        "summary": {"n_estimated": int(sum(v["status"] == "estimated" for v in countries.values())),
                    "n_not_estimated_pooled": int(sum(v["status"] == "not estimated" for v in countries.values())),
                    "annual_rel_width_median": float(np.median(rw)) if len(rw) else None,
                    "annual_rel_width_p90": float(np.percentile(rw, 90)) if len(rw) else None,
                    "annual_rel_width_max": float(rw.max()) if len(rw) else None,
                    "annual_rel_width_population": "country-years 2012+ with point >= 100"},
        "countries": countries,
    }
    OUT_JSON.write_text(json.dumps(out, separators=(",", ":")))
    print(json.dumps(out["self_check"]), json.dumps(out["summary"]))
    print(f"wrote {OUT_JSON} ({OUT_JSON.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    raise SystemExit(main())
