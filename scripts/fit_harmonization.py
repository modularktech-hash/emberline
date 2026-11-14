#!/usr/bin/env python3
"""Fit and validate the MODIS/VIIRS harmonization.

Unit of the harmonized record: **Aqua-MODIS-equivalent detections** -- the
number of daytime vegetation-fire detections Aqua MODIS would have made.
Before 2012 that is observed Aqua. From 2012 it is predicted from Suomi-NPP
VIIRS, which never left its orbit, so the harmonized record is not exposed to
Aqua's post-2022 orbital drift.

Method, per country (country stands in for region; no land-cover table yet):

1. Match. A Suomi-NPP VIIRS detection is "seen by Aqua" if Aqua made a
   detection on the same UTC date in the same H3 res-7 cell or one of its six
   neighbours (~3.5 km). Both are daytime, ~13:30 overpasses in 2012-2021.
2. Detection probability. Logistic regression P(seen | log FRP) per country,
   fitted on TRAIN years only.
3. Scale. One VIIRS 375 m fire can light several pixels inside one MODIS 1 km
   pixel, so sum(P) over VIIRS detections overcounts MODIS detections. A
   per-country factor kappa = sum(Aqua detections) / sum(P), on TRAIN years.
   Harmonized count = kappa * sum(P).
4. Validate on held-out years at H3 res-5 cell x month: R^2, bias, RMSE
   against observed Aqua. Compare with two baselines: raw VIIRS counts and a
   single fitted FRP threshold.
5. Null control: Aqua alone shows no step at 2012; the naive spliced series
   (MODIS to 2011, VIIRS from 2012) does.
6. Drift era (2022-2025, never used for fitting): observed Aqua vs predicted,
   year by year, beside Aqua's mean local solar overpass time.

Every number in the outputs is computed here. Nothing is hard-coded.

Usage: python3 scripts/fit_harmonization.py [Country ...]
Inputs: data/public/detections_<Country>.parquet (from build_tables.py)
Outputs: web/public/data/params.json, web/public/data/calendar_harmonized.parquet,
         docs/figures/fit_*.png, docs/results.md
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import h3
import numpy as np
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
import os
DATA = Path(os.environ.get("EMBERLINE_DATA", ROOT / "data" / "public"))
WEB = Path(os.environ.get("EMBERLINE_OUTPUT", ROOT / "web" / "public" / "data"))
FIG = ROOT / "docs" / "figures"

TRAIN = (2012, 2018)
TEST = (2019, 2021)
FIT = (2012, 2021)
DRIFT = (2022, 2025)
FIT_VERSION = "v1-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M")
RNG = np.random.default_rng(20261114)
MIN_TRAIN_VIIRS = 5_000   # below this a country borrows the pooled curve
MIN_TRAIN_AQUA = 500      # below this it also borrows the pooled kappa
POOLED: dict = {}         # filled by main() before small countries are fitted
N_BOOT = 200


# --------------------------------------------------------------------- data
def load(country: str) -> pl.DataFrame:
    d = pl.read_parquet(
        DATA / f"detections_{country}.parquet",
        columns=["lat", "lon", "acq_ts", "platform", "frp_mw", "lst_hours"],
    )
    d = d.with_columns(
        pl.col("acq_ts").dt.date().alias("date"),
        pl.col("acq_ts").dt.year().alias("year"),
        pl.col("acq_ts").dt.month().alias("month"),
    ).drop("acq_ts")
    lat, lon = d["lat"].to_numpy(), d["lon"].to_numpy()
    c7 = [h3.latlng_to_cell(a, b, 7) for a, b in zip(lat, lon)]
    c5 = [h3.cell_to_parent(c, 5) for c in c7]
    c2 = [h3.cell_to_parent(c, 2) for c in c5]
    return d.with_columns(
        pl.Series("h3_7", c7), pl.Series("h3_5", c5), pl.Series("h3_parent", c2),
        pl.lit(country).alias("country"),
    )


def label_viirs(d: pl.DataFrame) -> pl.DataFrame:
    """Suomi-NPP detections in 2012-2025, with seen_by_aqua (0/1)."""
    aqua = d.filter((pl.col("platform") == "Aqua") & (pl.col("year") >= 2012))
    pairs = set()
    for day, cell in zip(aqua["date"].to_list(), aqua["h3_7"].to_list()):
        for n in h3.grid_disk(cell, 1):
            pairs.add((day, n))
    v = d.filter((pl.col("platform") == "Suomi-NPP") & (pl.col("year") >= 2012))
    seen = [1 if (a, b) in pairs else 0 for a, b in zip(v["date"].to_list(), v["h3_7"].to_list())]
    return v.with_columns(pl.Series("seen", seen, dtype=pl.Int8))


# --------------------------------------------------------------- logistic
def fit_logistic(x: np.ndarray, y: np.ndarray, iters: int = 60) -> tuple[float, float]:
    """Newton-Raphson logistic regression on one feature. Returns (b0, b1)."""
    X = np.column_stack([np.ones_like(x), x])
    b = np.zeros(2)
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ b)))
        w = p * (1 - p) + 1e-12
        g = X.T @ (y - p)
        H = (X * w[:, None]).T @ X
        step = np.linalg.solve(H, g)
        b += step
        if np.abs(step).max() < 1e-9:
            break
    return float(b[0]), float(b[1])


def prob(frp: np.ndarray, b0: float, b1: float) -> np.ndarray:
    return 1 / (1 + np.exp(-(b0 + b1 * np.log(np.clip(frp, 0.1, None)))))


# ---------------------------------------------------------------- metrics
def metrics(pred: np.ndarray, obs: np.ndarray) -> dict:
    ss_res = float(((obs - pred) ** 2).sum())
    ss_tot = float(((obs - obs.mean()) ** 2).sum())
    return {
        "r2": 1 - ss_res / ss_tot if ss_tot > 0 else None,
        "bias_pct": 100 * (pred.sum() - obs.sum()) / obs.sum() if obs.sum() else None,
        "rmse": float(np.sqrt(((obs - pred) ** 2).mean())),
        "n_cell_months": int(len(obs)),
        "obs_total": float(obs.sum()),
        "pred_total": float(pred.sum()),
    }


def cell_month(frame: pl.DataFrame, value: str | None, name: str) -> pl.DataFrame:
    agg = pl.len().alias(name) if value is None else pl.col(value).sum().alias(name)
    return frame.group_by("h3_5", "year", "month").agg(agg)


def years(frame: pl.DataFrame, lo_hi: tuple[int, int]) -> pl.DataFrame:
    return frame.filter(pl.col("year").is_between(*lo_hi))


# ------------------------------------------------------------------- main
def fit_country(country: str) -> tuple[dict, pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    d = load(country)
    v = label_viirs(d)
    aqua = d.filter(pl.col("platform") == "Aqua")

    # 2. logistic on TRAIN
    tr = years(v, TRAIN)
    x, y = np.log(np.clip(tr["frp_mw"].to_numpy(), 0.1, None)), tr["seen"].to_numpy().astype(float)
    pooled = len(x) < MIN_TRAIN_VIIRS and "b0" in POOLED
    if pooled:
        b0, b1 = POOLED["b0"], POOLED["b1"]
    else:
        b0, b1 = fit_logistic(x, y)
    frp50 = float(np.exp(-b0 / b1)) if b1 > 0 else None

    # bootstrap coefficient intervals (subsample for speed)
    n = len(x); m = min(n, 200_000)
    boots = []
    for _ in range(0 if pooled or n < 50 else N_BOOT // 4):
        i = RNG.integers(0, n, m)
        boots.append(fit_logistic(x[i], y[i]))
    boots = np.array(boots) if boots else np.array([[b0, b1], [b0, b1]])
    frp50_boot = np.exp(-boots[:, 0] / boots[:, 1])

    v = v.with_columns(pl.Series("p", prob(v["frp_mw"].to_numpy(), b0, b1)))

    # 3. kappa on TRAIN
    sum_p = float(years(v, TRAIN)["p"].sum())
    pooled_kappa = (years(aqua, TRAIN).height < MIN_TRAIN_AQUA or sum_p == 0) and "kappa" in POOLED
    kappa = POOLED["kappa"] if pooled_kappa else years(aqua, TRAIN).height / sum_p
    v = v.with_columns((pl.col("p") * kappa).alias("aqua_eq"))

    # threshold baseline: T chosen on TRAIN to minimise cell-month RMSE vs Aqua
    obs_tr = cell_month(years(aqua, TRAIN), None, "obs")
    best = None
    for T in [0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100]:
        vt = cell_month(years(v, TRAIN).filter(pl.col("frp_mw") >= T), None, "pred")
        j = obs_tr.join(vt, on=["h3_5", "year", "month"], how="full", coalesce=True).fill_null(0)
        r = float(np.sqrt(((j["obs"] - j["pred"]) ** 2).mean()))
        if best is None or r < best[1]:
            best = (T, r)
    T_best = best[0]

    # 4. validation on TEST: predicted vs observed Aqua, cell x month
    def evaluate(span):
        obs = cell_month(years(aqua, span), None, "obs")
        model = cell_month(years(v, span), "aqua_eq", "model")
        raw = cell_month(years(v, span), None, "raw")
        thr = cell_month(years(v, span).filter(pl.col("frp_mw") >= T_best), None, "thr")
        j = (obs.join(model, on=["h3_5", "year", "month"], how="full", coalesce=True)
                .join(raw, on=["h3_5", "year", "month"], how="full", coalesce=True)
                .join(thr, on=["h3_5", "year", "month"], how="full", coalesce=True)
                .fill_null(0))
        o = j["obs"].to_numpy().astype(float)
        return j, {
            "model": metrics(j["model"].to_numpy(), o),
            "raw_viirs": metrics(j["raw"].to_numpy().astype(float), o),
            "threshold": metrics(j["thr"].to_numpy().astype(float), o),
        }

    jt, test = evaluate(TEST)
    _, train = evaluate(TRAIN)

    # bootstrap the TEST metrics over cells
    cells = jt["h3_5"].unique().to_numpy()
    r2s, biases = [], []
    for _ in range(N_BOOT):
        pick = pl.DataFrame({"h3_5": RNG.choice(cells, len(cells))})
        s = pick.join(jt, on="h3_5", how="left")
        mm = metrics(s["model"].to_numpy(), s["obs"].to_numpy().astype(float))
        r2s.append(mm["r2"]); biases.append(mm["bias_pct"])

    # 5. null control: annual series
    annual_aqua = aqua.group_by("year").len().rename({"len": "aqua"})
    annual_modis = d.filter(pl.col("platform").is_in(["Aqua", "Terra"])).group_by("year").len().rename({"len": "modis_all"})
    annual_viirs = v.group_by("year").agg(pl.len().alias("viirs_raw"), pl.col("aqua_eq").sum().alias("aqua_eq"))
    annual = (annual_aqua.join(annual_modis, on="year", how="full", coalesce=True)
              .join(annual_viirs, on="year", how="full", coalesce=True).sort("year").fill_null(0))

    def mean_years(col, a, b):
        return float(annual.filter(pl.col("year").is_between(a, b))[col].mean())

    spliced_before = mean_years("modis_all", 2009, 2011)
    spliced_after = mean_years("viirs_raw", 2012, 2014)
    aqua_before, aqua_after = mean_years("aqua", 2009, 2011), mean_years("aqua", 2012, 2014)
    harm_after = mean_years("aqua_eq", 2012, 2014)

    # 6. drift era
    lst = aqua.group_by("year").agg(pl.col("lst_hours").mean().alias("aqua_lst"))
    drift = (annual.join(lst, on="year", how="left")
             .filter(pl.col("year") >= FIT[0])
             .with_columns((pl.col("aqua") / pl.col("aqua_eq")).alias("obs_over_pred")))

    params = {
        "fit_source": "pooled" if pooled else "own",
        "kappa_source": "pooled" if pooled_kappa else "own",
        "logistic": {"b0": b0, "b1": b1, "feature": "log(frp_mw)",
                     "b0_ci95": np.percentile(boots[:, 0], [2.5, 97.5]).tolist(),
                     "b1_ci95": np.percentile(boots[:, 1], [2.5, 97.5]).tolist()},
        "frp_at_p50_mw": frp50,
        "frp_at_p50_ci95_mw": np.percentile(frp50_boot, [2.5, 97.5]).tolist(),
        "kappa": kappa,
        "threshold_baseline_mw": T_best,
        "train_match_rate": float(y.mean()),
        "n_train_viirs_detections": int(n),
        "validation_train": train,
        "validation_test": test,
        "validation_test_ci95": {"r2": np.percentile(r2s, [2.5, 97.5]).tolist(),
                                 "bias_pct": np.percentile(biases, [2.5, 97.5]).tolist()},
        "null_control": {
            "spliced_raw_step_ratio_2012": spliced_after / spliced_before,
            "aqua_only_step_ratio_2012": aqua_after / aqua_before,
            "harmonized_step_ratio_2012": harm_after / aqua_before,
            "definition": "mean annual count 2012-2014 / mean 2009-2011",
        },
        "drift_era": drift.filter(pl.col("year") >= DRIFT[0]).select(
            "year", "aqua", "aqua_eq", "obs_over_pred", "aqua_lst").to_dicts(),
        "frozen_era_obs_over_pred": drift.filter(pl.col("year").is_between(*FIT)).select(
            "year", "obs_over_pred", "aqua_lst").to_dicts(),
    }
    return params, annual, v, aqua


def calendar(country: str, v: pl.DataFrame, aqua: pl.DataFrame) -> pl.DataFrame:
    """Aqua-equivalent counts per year x month: observed Aqua before 2012,
    VIIRS-derived from 2012. Country scope and h3_parent scope."""
    out = []
    for scope, key in (("country", None), ("h3_parent", "h3_parent")):
        g = ["year", "month"] + ([key] if key else [])
        a = aqua.filter(pl.col("year") < 2012).group_by(g).len().rename({"len": "n_harmonized"}).with_columns(pl.col("n_harmonized").cast(pl.Float64))
        b = v.group_by(g).agg(pl.col("aqua_eq").sum().alias("n_harmonized"))
        c = pl.concat([a, b], how="vertical_relaxed")
        c = c.with_columns(pl.lit(scope).alias("scope"),
                           (pl.col(key) if key else pl.lit(country)).alias("key"))
        if key:
            c = c.drop(key)
        out.append(c.select("scope", "key", "year", "month", "n_harmonized"))
    return pl.concat(out)


def plots(results: dict, annuals: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    FIG.mkdir(parents=True, exist_ok=True)
    for c, a in annuals.items():
        a = a.filter(pl.col("year") >= 2003)
        fig, ax = plt.subplots(figsize=(9, 4.5))
        yrs = a["year"].to_list()
        spliced = [m if y < 2012 else vr for y, m, vr in zip(yrs, a["modis_all"], a["viirs_raw"])]
        harm = [aq if y < 2012 else he for y, aq, he in zip(yrs, a["aqua"], a["aqua_eq"])]
        ax.plot(yrs, spliced, "o-", color="#d95f02", label="Raw: MODIS to 2011, then VIIRS")
        ax.plot(yrs, harm, "o-", color="#1b9e77", lw=2.5, label="Harmonized (Aqua-equivalent)")
        ax.plot(yrs, a["aqua"], ":", color="#555", label="Observed Aqua MODIS (validation)")
        ax.axvline(2011.5, color="#999", lw=0.8)
        ax.axvspan(2021.5, max(yrs) + 0.5, color="#eee", label="Drift era (held out)")
        ax.set_title(f"{c}: daytime vegetation-fire detections per year")
        ax.set_ylabel("detections"); ax.legend(fontsize=8); ax.grid(alpha=.3)
        fig.tight_layout(); fig.savefig(FIG / f"fit_annual_{c}.png", dpi=130); plt.close(fig)
    fig, ax = plt.subplots(figsize=(7, 4.5))
    f = np.logspace(0, 3, 200)
    for c, p in results.items():
        ax.semilogx(f, prob(f, p["logistic"]["b0"], p["logistic"]["b1"]), label=f"{c} (P=0.5 at {p['frp_at_p50_mw']:.1f} MW)")
    ax.axvspan(9, 11, color="#ddd", label="9-11 MW reported detection threshold")
    ax.set_xlabel("VIIRS FRP (MW)"); ax.set_ylabel("P(Aqua MODIS also detects)")
    ax.set_title("Fitted detection probability, 2012-2018"); ax.legend(fontsize=8); ax.grid(alpha=.3)
    fig.tight_layout(); fig.savefig(FIG / "fit_detection_probability.png", dpi=130); plt.close(fig)


def _fmt(x, f="{:.3f}"):
    return "n/a" if x is None else f.format(x)


def main() -> int:
    countries = sys.argv[1:] or ["Portugal", "Chile", "Australia", "Canada"]
    # Biggest first: their own fits define the pooled curve the small ones borrow.
    countries.sort(key=lambda c: -(DATA / f"detections_{c}.parquet").stat().st_size)
    results, annuals, cals, failed = {}, {}, [], {}
    for c in countries:
        if not POOLED and len([r for r in results.values() if r["fit_source"] == "own"]) >= 3 \
                and (DATA / f"detections_{c}.parquet").stat().st_size < 5_000_000:
            own = [r for r in results.values() if r["fit_source"] == "own"]
            w = np.array([r["n_train_viirs_detections"] for r in own], dtype=float)
            POOLED.update(b0=float(np.average([r["logistic"]["b0"] for r in own], weights=w)),
                          b1=float(np.average([r["logistic"]["b1"] for r in own], weights=w)),
                          kappa=float(np.average([r["kappa"] for r in own], weights=w)),
                          from_countries=sorted(k for k, r in results.items() if r["fit_source"] == "own"))
        print(f"fitting {c} ...", flush=True)
        try:
            p, annual, v, aqua = fit_country(c)
        except Exception as e:  # a country too sparse to evaluate is reported, not fatal
            failed[c] = f"{type(e).__name__}: {e}"
            print(f"  {c}: FAILED {failed[c]}", flush=True)
            continue
        results[c] = p; annuals[c] = annual
        cal = calendar(c, v, aqua)
        # Preserve each expensive completed fit even if a later country or the
        # process fails. These are recovery artifacts, never auto-published or
        # blindly reused when the input data / pooled model has changed.
        checkpoint = DATA / "fit_checkpoints" / c
        checkpoint.mkdir(parents=True, exist_ok=True)
        for filename, frame in (("calendar.parquet", cal), ("annual.parquet", annual)):
            temporary = checkpoint / (filename + ".tmp")
            frame.write_parquet(temporary, compression="zstd")
            temporary.replace(checkpoint / filename)
        temporary = checkpoint / "params.json.tmp"
        temporary.write_text(json.dumps({"fit_version": FIT_VERSION, "country": c,
                                         "params": p, "pooled_model": POOLED or None}, indent=2, default=float))
        temporary.replace(checkpoint / "params.json")
        cals.append(cal)
        t = p["validation_test"]
        print(f"  {c}: [{p['fit_source']}] test R2 model={_fmt(t['model']['r2'])} raw={_fmt(t['raw_viirs']['r2'])} "
              f"bias={_fmt(t['model']['bias_pct'], '{:+.1f}%')} P50={_fmt(p['frp_at_p50_mw'], '{:.1f}')} MW "
              f"kappa={p['kappa']:.3f}", flush=True)
    WEB.mkdir(parents=True, exist_ok=True)
    out = {"fit_version": FIT_VERSION, "unit": "Aqua-MODIS-equivalent daytime vegetation-fire detections",
           "train_years": list(TRAIN), "test_years": list(TEST), "drift_years": list(DRIFT),
           "match_rule": "same UTC date, H3 res-7 cell or its 6 neighbours",
           "pooled_model": POOLED or None,
           "pooled_rule": f"countries with < {MIN_TRAIN_VIIRS} training VIIRS detections borrow the "
                          f"detection-weighted mean curve of the own-fit countries; < {MIN_TRAIN_AQUA} Aqua "
                          "training detections also borrow its kappa",
           "failed": failed, "countries": results}
    (WEB / os.environ.get("EMBERLINE_PARAMS", "params.json")).write_text(json.dumps(out, indent=2, default=float))
    pl.concat(cals).sort("scope", "key", "year", "month").write_parquet(
        WEB / os.environ.get("EMBERLINE_CAL", "calendar_harmonized.parquet"), compression="zstd", statistics=True)
    if os.environ.get("EMBERLINE_PLOTS", "1") == "1":
        plots(results, annuals)
    print("done:", len(results), "fitted,", len(failed), "failed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
