#!/usr/bin/env python3
"""Derived tables for the app: season timing, overpass drift, country summary.

Covers every fitted country in params_global.json (the world fit). Totals,
step ratios and validation come from the published calendars and fit for all
of them. Season timing and drift need point detections:

* where a detection table is on this machine (data/public for the original
  four, data/global_public for the rest) AND its yearly raw totals equal the
  published calendar_raw_global.parquet exactly, season timing is computed per
  day (resolution "daily") and overpass drift per satellite per year;
* otherwise season timing is computed from the monthly calendars, assuming
  detections spread evenly within each month (resolution "monthly", labelled
  as such in the app), and there is no drift row. Nothing is filled in by hand.

For each country:

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

Usage: python3 scripts/build_insights.py
  env EMBERLINE_PARAMS (default params_global.json), EMBERLINE_DETECTIONS
  (colon-separated detection-table directories, default data/public:data/global_public)
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
DET_DIRS = [Path(p) for p in os.environ.get(
    "EMBERLINE_DETECTIONS", f"{ROOT / 'data' / 'public'}:{ROOT / 'data' / 'global_public'}").split(":")]
WEB = ROOT / "web" / "public" / "data"
PARAMS = WEB / os.environ.get("EMBERLINE_PARAMS", "params_global.json")
CAL_RAW = WEB / os.environ.get("EMBERLINE_CAL_RAW", "calendar_raw_global.parquet")
CAL_HARM = WEB / os.environ.get("EMBERLINE_CAL_HARM", "calendar_harmonized_global.parquet")
FIRST, LAST = 2003, 2025
VIIRS_FROM = 2012
DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


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


def detections_path(name: str) -> Path | None:
    for d in DET_DIRS:
        f = d / f"detections_{name}.parquet"
        if f.exists():
            return f
    return None


def fire_year_of(year: int, month: int, start: int) -> int:
    if start == 1:
        return year
    if month >= start:
        return year + (1 if start > 6 else 0)
    return year - (0 if start > 6 else 1)


def country_insights(name: str, fit: dict, path: Path) -> tuple[dict, list[dict], dict]:
    d = pl.read_parquet(path, columns=["lat", "lon", "acq_ts", "platform", "frp_mw", "lst_hours"])
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


def calendar_country(name: str, raw: pl.DataFrame, harm: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Monthly raw (MODIS to 2011, VIIRS from 2012) and harmonized series of one country, from the calendars."""
    r = raw.filter(pl.col("key") == name)
    rawm = (r.filter(((pl.col("year") < VIIRS_FROM) & (pl.col("sensor") == "MODIS"))
                     | ((pl.col("year") >= VIIRS_FROM) & (pl.col("sensor") == "VIIRS")))
            .group_by("year", "month").agg(pl.col("n_detections").sum().cast(pl.Float64).alias("raw")))
    harmm = harm.filter(pl.col("key") == name).group_by("year", "month").agg(pl.col("n_harmonized").sum().alias("harm"))
    grid = pl.DataFrame({"year": [y for y in range(2001, LAST + 1) for _ in range(12)],
                         "month": [m for _ in range(2001, LAST + 1) for m in range(1, 13)]})
    m = (grid.join(rawm.with_columns(pl.col("year").cast(pl.Int64), pl.col("month").cast(pl.Int64)), on=["year", "month"], how="left")
         .join(harmm.with_columns(pl.col("year").cast(pl.Int64), pl.col("month").cast(pl.Int64)), on=["year", "month"], how="left")
         .with_columns(pl.col("raw").fill_null(0.0), pl.col("harm").fill_null(0.0)).sort("year", "month"))
    return r, m


def monthly_season(m: pl.DataFrame) -> dict:
    """Season timing from monthly totals: fire-year day by which 10/50/90% had happened.

    Within a month, detections are assumed evenly spread (linear interpolation
    of the cumulative share), so a day here is an estimate at monthly
    resolution, not an observed date.
    """
    clim = m.filter(pl.col("year").is_between(FIRST, LAST)).group_by("month").agg(pl.col("harm").sum()).sort("harm")
    start = int(clim["month"][0]) if clim.height and clim["harm"].sum() > 0 else 1
    by = {(r["year"], r["month"]): r for r in m.iter_rows(named=True)}
    rows = []
    for fy in range(FIRST, LAST + 1):
        y0 = fy - (1 if start > 6 else 0) if start != 1 else fy
        months = [((y0 + (start - 1 + i) // 12), (start - 1 + i) % 12 + 1) for i in range(12)]
        rec: dict = {"year": fy}
        if not all(k in by for k in months):
            rows.append(rec); continue
        for key in ("raw", "harm"):
            vals = np.array([by[k][key] for k in months], float)
            lens = np.array([DAYS[mm - 1] for _, mm in months], float)
            total = vals.sum()
            out = [None, None, None]
            if total >= 20:
                cum = np.concatenate([[0.0], np.cumsum(vals)]) / total
                edges = np.concatenate([[0.0], np.cumsum(lens)])
                for j, q in enumerate((0.1, 0.5, 0.9)):
                    i = int(np.searchsorted(cum, q, side="left")) - 1
                    i = min(max(i, 0), 11)
                    frac = (q - cum[i]) / (cum[i + 1] - cum[i]) if cum[i + 1] > cum[i] else 0.0
                    out[j] = int(math.floor(edges[i] + frac * lens[i])) + 1
            on, pk, en = out
            rec[f"{key}_onset"], rec[f"{key}_peak"], rec[f"{key}_end"] = on, pk, en
            rec[f"{key}_length"] = (en - on) if on and en else None
            rec[f"{key}_total"] = round(float(total), 1)
        rows.append(rec)
    yrs = [r["year"] for r in rows]
    trends = {f"{k}_{mm}": trend(yrs, [r.get(f"{k}_{mm}") for r in rows])
              for k in ("raw", "harm") for mm in ("onset", "peak", "end", "length")}
    return {"fire_year_start_month": start, "resolution": "monthly", "years": rows, "trend_days_per_decade": trends}


def calendar_summary(name: str, fit: dict, r: pl.DataFrame, m: pl.DataFrame) -> dict:
    ann = m.group_by("year").agg(pl.col("raw").sum(), pl.col("harm").sum()).sort("year")
    t = fit["validation_test"]
    nc = fit["null_control"]
    return {
        "country": name,
        "detections_filtered": int(r["n_detections"].sum()),
        "raw_2025": float(ann.filter(pl.col("year") == 2025)["raw"].sum()),
        "harm_2025": float(ann.filter(pl.col("year") == 2025)["harm"].sum()),
        "harm_mean_2003_2025": float(ann.filter(pl.col("year").is_between(FIRST, LAST))["harm"].mean() or 0),
        "peak_year": int(ann.sort("harm", descending=True)["year"][0]) if ann.height else None,
        "step_raw": nc["spliced_raw_step_ratio_2012"], "step_aqua": nc["aqua_only_step_ratio_2012"],
        "step_harm": nc["harmonized_step_ratio_2012"],
        "r2_model": t["model"]["r2"], "r2_raw": t["raw_viirs"]["r2"], "bias_pct": t["model"]["bias_pct"],
        "frp_p50": fit["frp_at_p50_mw"], "fit_source": fit.get("fit_source", "own"),
        "annual": [{"year": a["year"], "raw": round(a["raw"], 1), "harm": round(a["harm"], 1)} for a in ann.iter_rows(named=True)],
    }


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
    raw = pl.read_parquet(CAL_RAW).filter(pl.col("scope") == "country")
    harm = pl.read_parquet(CAL_HARM).filter(pl.col("scope") == "country")
    season, drift, table, checks, checks_mvd = {}, {}, [], {}, []
    only = set(sys.argv[1:])  # optional: a subset, for testing (files are then written for it only)
    for name, fit in sorted(params["countries"].items()):
        if only and name not in only:
            continue
        r, m = calendar_country(name, raw, harm)
        row = calendar_summary(name, fit, r, m)
        path = detections_path(name)
        resolution, why = "monthly", "no detection table on this machine"
        if path is not None:
            s_daily, dr, det_row = country_insights(name, fit, path)
            cal_ann = {a["year"]: a["raw"] for a in row["annual"]}
            det_ann = {a["year"]: a["raw"] for a in det_row["annual"]}
            mismatch = [y for y in sorted(set(cal_ann) | set(det_ann)) if round(cal_ann.get(y, 0.0)) != round(det_ann.get(y, 0.0))]
            if not mismatch and det_row["detections_filtered"] == row["detections_filtered"]:
                resolution, why = "daily", f"detections {path.parent.name}/{path.name} match the calendar"
                season[name] = {**s_daily, "resolution": "daily"}
                drift[name] = dr
                # How far the monthly-resolution method lands from the daily one, where both exist.
                mon = monthly_season(m)["trend_days_per_decade"]
                checks_mvd.append({"country": name, **{k: (None if mon[k] is None or s_daily["trend_days_per_decade"][k] is None
                                                            else mon[k] - s_daily["trend_days_per_decade"][k])
                                                        for k in ("raw_onset", "harm_onset", "harm_peak", "harm_end")}})
            else:
                why = f"detection table differs from the published calendar in {len(mismatch)} years"
        if resolution == "monthly":
            season[name] = monthly_season(m)
        tr = season[name]["trend_days_per_decade"]
        row.update({"season_resolution": resolution, "onset_trend_raw": tr["raw_onset"], "onset_trend_harm": tr["harm_onset"]})
        table.append(row)
        checks[name] = why
        print(f"{name}: {resolution} ({why}); onset trend raw {tr['raw_onset']} harm {tr['harm_onset']} d/decade", flush=True)

    # Countries the fit could not run for: raw record only, from the calendar.
    not_fitted = []
    for name in sorted(params.get("failed", {})):
        r = raw.filter(pl.col("key") == name)
        not_fitted.append({"country": name, "detections_filtered": int(r["n_detections"].sum()) if r.height else 0,
                           "has_raw_calendar": r.height > 0})
    meta = {"fit_version": params["fit_version"], "unit": params["unit"],
            "train_years": params["train_years"], "test_years": params["test_years"]}
    n_daily = sum(1 for v in season.values() if v["resolution"] == "daily")
    diffs = [abs(v) for c in checks_mvd for k, v in c.items() if k != "country" and v is not None]
    seasons_meta = {**meta, "resolution_note": (
        "daily: from point detections; monthly: from the monthly calendars, assuming detections spread evenly "
        "within each month (an estimate at monthly resolution)"),
        "monthly_vs_daily": {"countries": len(checks_mvd), "trend_abs_diff_median": float(np.median(diffs)) if diffs else None,
                             "trend_abs_diff_max": max(diffs) if diffs else None,
                             "definition": "monthly-method minus daily-method trend (days/decade) for onset, peak and end, "
                                           "over countries with both"}}
    (WEB / "season.json").write_text(json.dumps(clean({**seasons_meta, "countries": season}), separators=(",", ":")))
    (WEB / "drift.json").write_text(json.dumps(clean({**meta, "countries": drift}), separators=(",", ":")))
    (WEB / "countries.json").write_text(json.dumps(clean({**meta, "pooled_rule": params.get("pooled_rule"),
                                                           "countries": table, "not_fitted": not_fitted}), separators=(",", ":")))
    print(f"wrote season.json ({len(season)} countries, {n_daily} daily, {len(season) - n_daily} monthly), "
          f"drift.json ({len(drift)}), countries.json ({len(table)} fitted, {len(not_fitted)} not fitted)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
