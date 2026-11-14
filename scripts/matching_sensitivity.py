#!/usr/bin/env python3
"""E29 matching-rule sensitivity (analysis only; NOT a published fit).

The published label is "Aqua detected on the same UTC date in the same H3
res-7 cell or one of its 6 neighbours" (k-ring 1, 0 days). This refits each
country under alternative rules with the fit script's own functions:

  published   k=1, +/-0 days
  same_cell   k=0, +/-0 days
  kring2      k=2, +/-0 days
  pm1day      k=1, +/-1 day

For each rule: logistic on 2012-2018 (fh.fit_logistic), kappa on 2012-2018
(fit_country's rule), scored on 2019-2021 H3 res-5 cell-months with
fh.metrics. Nothing here is selected on, or published from, 2019-2021.

Usage: EMBERLINE_DATA=.../data/global_public python3 scripts/matching_sensitivity.py Country [...]
Writes per-country JSON rows to MS_OUT (default data/matching_sensitivity.json).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import h3.api.basic_int as H3I
import numpy as np
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("EMBERLINE_DATA", str(ROOT / "data" / "global_public"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fit_harmonization as fh  # noqa: E402

OUT = Path(os.environ.get("MS_OUT", ROOT / "data" / "matching_sensitivity.json"))
RULES = {"published": (1, 0), "same_cell": (0, 0), "kring2": (2, 0), "pm1day": (1, 1)}
KEY = ["h3_5", "year", "month"]


def label(v: pl.DataFrame, aqua: pl.DataFrame, k: int, days: int) -> np.ndarray:
    """seen (0/1) per VIIRS row: Aqua within k rings and +/- days of the UTC date.
    With k=1, days=0 this is fh.label_viirs exactly."""
    a = aqua.select("date", "h3_7").unique()
    cells = a["h3_7"].unique().to_numpy()
    src, nbr = [], []
    for c in cells:
        for n in H3I.grid_disk(int(c), k):
            src.append(int(c)); nbr.append(n)
    disk = pl.DataFrame({"h3_7": src, "nbr": nbr}, schema={"h3_7": pl.UInt64, "nbr": pl.UInt64})
    pairs = a.join(disk, on="h3_7").select("date", pl.col("nbr").alias("h3_7"))
    if days:
        pairs = pl.concat([pairs.with_columns(pl.col("date") + pl.duration(days=s)) for s in range(-days, days + 1)])
    pairs = pairs.unique().with_columns(pl.lit(1, dtype=pl.Int8).alias("seen"))
    return (v.with_row_index("_i").join(pairs, on=["date", "h3_7"], how="left").sort("_i")
            ["seen"].fill_null(0).to_numpy())


def run(country: str, pub: dict) -> dict:
    d = fh.load(country).filter(pl.col("year").is_between(fh.TRAIN[0], fh.TEST[1]))
    v = d.filter(pl.col("platform") == "Suomi-NPP")
    aqua = d.filter(pl.col("platform") == "Aqua")
    del d
    tr_mask = v["year"].is_between(*fh.TRAIN).to_numpy()
    frp = v["frp_mw"].to_numpy()
    x = np.log(np.clip(frp, 0.1, None))
    n_aqua_tr = fh.years(aqua, fh.TRAIN).height
    obs = fh.cell_month(fh.years(aqua, fh.TEST), None, "obs")
    out = {"country": country, "published_fit_source": pub["countries"].get(country, {}).get("fit_source"),
           "n_train_viirs": int(tr_mask.sum()), "rules": {}, "examples": []}
    labels = {}
    for name, (k, days) in RULES.items():
        seen = label(v, aqua, k, days)
        labels[name] = seen
        b0, b1 = fh.fit_logistic(x[tr_mask], seen[tr_mask].astype(float))
        p = fh.prob(frp, b0, b1)
        kappa = n_aqua_tr / float(p[tr_mask].sum())
        vv = v.with_columns(pl.Series("m", p * kappa))
        model = fh.cell_month(fh.years(vv, fh.TEST), "m", "model")
        j = obs.join(model, on=KEY, how="full", coalesce=True).fill_null(0)
        m = fh.metrics(j["model"].to_numpy(), j["obs"].to_numpy().astype(float))
        out["rules"][name] = {"k_ring": k, "days": days, "b0": b0, "b1": b1,
                              "frp50_mw": float(np.exp(-b0 / b1)) if b1 > 0 else None,
                              "kappa": kappa, "train_match_rate": float(seen[tr_mask].mean()),
                              "test_r2": m["r2"], "test_bias_pct": m["bias_pct"], "test_rmse": m["rmse"]}
        print(f"  {country} {name}: match={out['rules'][name]['train_match_rate']:.3f} b0={b0:.3f} b1={b1:.3f} "
              f"FRP50={out['rules'][name]['frp50_mw']} kappa={kappa:.3f} R2={m['r2']:.3f} bias={m['bias_pct']:+.1f}%",
              flush=True)
    # examples: rows whose label differs between rules, plus agreed matched/unmatched, from TRAIN years
    rng = np.random.default_rng(29)
    lab = np.column_stack([labels[n] for n in RULES])
    groups = {"all_matched": lab.all(1), "all_unmatched": ~lab.any(1),
              "only_wider_rules_match": (labels["published"] == 0) & ((labels["kring2"] == 1) | (labels["pm1day"] == 1)),
              "published_matches_same_cell_does_not": (labels["published"] == 1) & (labels["same_cell"] == 0)}
    for g, mask in groups.items():
        idx = np.flatnonzero(mask & tr_mask)
        for i in rng.choice(idx, min(2, len(idx)), replace=False) if len(idx) else []:
            row = v.row(int(i), named=True)
            out["examples"].append({"group": g, "date": str(row["date"]), "lat": row["lat"], "lon": row["lon"],
                                    "frp_mw": row["frp_mw"], "h3_7": H3I.int_to_str(int(row["h3_7"])),
                                    **{n: int(labels[n][i]) for n in RULES}})
        out.setdefault("group_share_train", {})[g] = float((mask & tr_mask).sum() / tr_mask.sum())
    return out


def main() -> int:
    pub = json.loads((ROOT / "web" / "public" / "data" / "params_global.json").read_text())
    rows = json.loads(OUT.read_text()) if OUT.exists() else []
    have = {r["country"] for r in rows}
    for c in sys.argv[1:]:
        if c in have:
            continue
        print(f"{c} ...", flush=True)
        r = run(c, pub)
        pr = pub["countries"].get(c)
        if pr:  # self-check: published rule refit must equal the published coefficients if own fit
            r["published_b0_b1"] = [pr["logistic"]["b0"], pr["logistic"]["b1"]]
        rows.append(r)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(rows, indent=1, default=float))
    return 0


if __name__ == "__main__":
    sys.exit(main())
