#!/usr/bin/env python3
"""Derived tables for the app: season timing, overpass drift, country summary.

For every country with a detection table and a fit in params.json:

* season.json -- per year, the day of the fire year by which 10%, 50% and 90%
  of that year's detections had happened (onset, peak, end), in the raw record
  (MODIS to 2011, VIIRS from 2012) and the harmonized one (Aqua, then VIIRS
  weighted by the fitted detection probability). The fire year starts at the
  country's quietest month, so a southern-hemisphere season is not cut in two.
  Each series gets a least-squares trend in days per decade, 2003-2025.
* drift.json -- mean local solar overpass time of daytime detections, per
  satellite per year. Shows Terra and Aqua leaving their frozen orbits.
* countries.json -- one row per country: totals, 2012 step ratios, held-out
  R2, fitted 50%-detection FRP, fit source.

Usage: python3 scripts/build_insights.py   (env EMBERLINE_DATA, EMBERLINE_PARAMS)
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import numpy as np
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("EMBERLINE_DATA", ROOT / "data" / "public"))
WEB = ROOT / "web" / "public" / "data"
PARAMS = WEB / os.environ.get("EMBERLINE_PARAMS", "params.json")
FIRST, LAST = 2003, 2025


def trend(years: list[int], values: list[float | None]) -> float | None:
    pts = [(y, v) for y, v in zip(years, values) if v is not None]
    if len(pts) < 8:
        return None
    x = np.array([p[0] for p in pts], float); y = np.array([p[1] for p in pts], float)
    return float(np.polyfit(x, y, 1)[0] * 10)


def quantile_days(day_counts: np.ndarray) -> tuple[int | None, int | None, int | None]:
    total = day_counts.sum()
    if total < 20:
        return None, None, None
    c = np.cumsum(day_counts) / total
    return tuple(int(np.searchsorted(c, q)) + 1 for q in (0.1, 0.5, 0.9))  # type: ignore[return-value]


def country_insights(name: str, fit: dict) -> tuple[dict, list[dict], dict]:
    d = pl.read_parquet(DATA / f"detections_{name}.parquet", columns=["lat", "lon", "acq_ts", "platform", "frp_mw", "lst_hours"])
    d = d.with_columns(pl.col("acq_ts").dt.year().alias("year"), pl.col("acq_ts").dt.month().alias("month"),
                       pl.col("acq_ts").dt.date().alias("date"))
    b0, b1, kappa = fit["logistic"]["b0"], fit["logistic"]["b1"], fit["kappa"]
    p = 1 / (1 + np.exp(-(b0 + b1 * np.log(np.clip(d["frp_mw"].to_numpy(), 0.1, None)))))
    d = d.with_columns(pl.Series("w_harm", np.where(
        d["platform"].to_numpy() == "Suomi-NPP", p * kappa, np.where(d["platform"].to_numpy() == "Aqua", 1.0, 0.0))))
    d = d.with_columns(
        pl.when((pl.col("year") < 2012) & pl.col("platform").is_in(["Terra", "Aqua"])).then(1.0)
        .when((pl.col("year") >= 2012) & (pl.col("platform") == "Suomi-NPP")).then(1.0).otherwise(0.0).alias("w_raw"),
        pl.when(pl.col("year") < 2012).then(pl.col("w_harm") * (pl.col("platform") == "Aqua"))
        .otherwise(pl.col("w_harm") * (pl.col("platform") == "Suomi-NPP")).alias("w_harm"),
    )
    # fire year starts at the climatologically quietest month
    monthly = d.group_by("month").agg(pl.col("w_harm").sum()).sort("month")
    start = int(monthly.sort("w_harm")["month"][0]) if monthly.height else 1
    d = d.with_columns(
        (pl.col("year") + ((pl.col("month") >= start) & pl.lit(start != 1)).cast(pl.Int32) - 0).alias("fire_year"),
    )
    if start != 1:  # a fire year is labelled by the calendar year it mostly falls in
        d = d.with_columns(pl.when(pl.col("month") >= start).then(pl.col("year") + (1 if start > 6 else 0))
                           .otherwise(pl.col("year") - (0 if start > 6 else 1)).alias("fire_year"))
    origin = pl.date(2000, start, 1)
    d = d.with_columns(((pl.col("date") - pl.date(2000, 1, 1)).dt.total_days()).alias("abs_day"))

    rows = []
    for fy in range(FIRST, LAST + 1):
        sub = d.filter(pl.col("fire_year") == fy)
        if sub.height == 0:
            rows.append({"year": fy}); continue
        y0 = fy - (1 if start > 6 and start != 1 else 0) if start != 1 else fy
        start_day = (np.datetime64(f"{y0:04d}-{start:02d}-01") - np.datetime64("2000-01-01")).astype(int)
        day = (sub["abs_day"].to_numpy() - start_day).clip(0, 365)
        rec = {"year": fy}
        for key in ("raw", "harm"):
            counts = np.bincount(day, weights=sub[f"w_{key}"].to_numpy(), minlength=366)[:366]
            on, pk, en = quantile_days(counts)
            rec[f"{key}_onset"], rec[f"{key}_peak"], rec[f"{key}_end"] = on, pk, en
            rec[f"{key}_length"] = (en - on) if on and en else None
            rec[f"{key}_total"] = round(float(counts.sum()), 1)
        rows.append(rec)
    yrs = [r["year"] for r in rows]
    trends = {f"{k}_{m}": trend(yrs, [r.get(f"{k}_{m}") for r in rows])
              for k in ("raw", "harm") for m in ("onset", "peak", "end", "length")}
    season = {"fire_year_start_month": start, "years": rows, "trend_days_per_decade": trends}

    day = d.filter(pl.col("lst_hours").is_not_null())
    drift = (day.group_by("platform", "year").agg(pl.col("lst_hours").mean().alias("lst"), pl.len().alias("n"))
             .filter(pl.col("n") >= 30).sort("platform", "year"))
    drift_rows = [{"platform": r["platform"], "year": r["year"], "lst": round(r["lst"], 3), "n": r["n"]}
                  for r in drift.iter_rows(named=True)]

    t = fit["validation_test"]
    nc = fit["null_control"]
    ann = d.group_by("year").agg(pl.col("w_raw").sum().alias("raw"), pl.col("w_harm").sum().alias("harm")).sort("year")
    summary = {
        "country": name,
        "detections_filtered": d.height,
        "raw_2025": float(ann.filter(pl.col("year") == 2025)["raw"].sum()),
        "harm_2025": float(ann.filter(pl.col("year") == 2025)["harm"].sum()),
        "harm_mean_2003_2025": float(ann.filter(pl.col("year").is_between(FIRST, LAST))["harm"].mean() or 0),
        "peak_year": int(ann.sort("harm", descending=True)["year"][0]) if ann.height else None,
        "step_raw": nc["spliced_raw_step_ratio_2012"], "step_aqua": nc["aqua_only_step_ratio_2012"],
        "step_harm": nc["harmonized_step_ratio_2012"],
        "r2_model": t["model"]["r2"], "r2_raw": t["raw_viirs"]["r2"], "bias_pct": t["model"]["bias_pct"],
        "frp_p50": fit["frp_at_p50_mw"], "fit_source": fit.get("fit_source", "own"),
        "onset_trend_raw": trends["raw_onset"], "onset_trend_harm": trends["harm_onset"],
        "annual": [{"year": r["year"], "raw": round(r["raw"], 1), "harm": round(r["harm"], 1)} for r in ann.iter_rows(named=True)],
    }
    return season, drift_rows, summary


def clean(o):
    if isinstance(o, float) and (math.isnan(o) or math.isinf(o)):
        return None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o


def main() -> int:
    params = json.loads(PARAMS.read_text())
    season, drift, table = {}, {}, []
    for name, fit in sorted(params["countries"].items()):
        if not (DATA / f"detections_{name}.parquet").exists():
            continue
        s, dr, row = country_insights(name, fit)
        season[name], drift[name] = s, dr
        table.append(row)
        print(f"{name}: onset trend raw {row['onset_trend_raw']} harm {row['onset_trend_harm']} d/decade", flush=True)
    meta = {"fit_version": params["fit_version"], "unit": params["unit"]}
    (WEB / "season.json").write_text(json.dumps(clean({**meta, "countries": season}), separators=(",", ":")))
    (WEB / "drift.json").write_text(json.dumps(clean({**meta, "countries": drift}), separators=(",", ":")))
    (WEB / "countries.json").write_text(json.dumps(clean({**meta, "countries": table}), separators=(",", ":")))
    print("wrote season.json, drift.json, countries.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
