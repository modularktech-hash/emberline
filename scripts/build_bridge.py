#!/usr/bin/env python3
"""Bridge: NOAA-20 VIIRS -> Suomi-NPP VIIRS, so the current month can be harmonized.

The published fit (params_global.json) maps Suomi-NPP VIIRS detections to
Aqua-MODIS-equivalent counts: harmonized = kappa x sum of P(detect | log FRP).
The current month only exists as NOAA-20 near-real-time (NRT) data. Suomi-NPP and
NOAA-20 both fly the same VIIRS 375 m instrument design, about 50 minutes apart on
the same orbit plane, and overlap from 2018. This script fits and validates a
one-number-per-country bridge between them, then applies the whole chain to the
current month.

Chain (per country c, per month):
    H_N20  = kappa_c x sum_i P_c(FRP_i)  over NOAA-20 detections i
    bridged = r_c x H_N20
    target  = kappa_c x sum_j P_c(FRP_j) over Suomi-NPP detections j
              (= the published harmonized calendar, calendar_harmonized_countries.csv)
    r_c     = sum(target) / sum(H_N20) over the training months, 2018-2021.
The same published logistic P_c and kappa_c are applied to NOAA-20 FRP unchanged;
r_c absorbs what differs (platform, overpass time, and the inputs below).

The NRT feed carries no fire `type` and its membership is a point-in-outline test,
so the bridge input is built from the NOAA-20 standard-processing archive the way
the NRT current month is built: daytime, confidence nominal/high, FRP > 0, ALL fire
types, and only points inside the Natural Earth 110 m outline
(web/public/geo/countries.geojson), exactly the filter of build_month_to_date.py.
The target is the published Suomi-NPP series (type 0, FIRMS country files), so r_c
also absorbs the average non-vegetation share and the outline mismatch. A second
variant (type 0 only, FIRMS country file membership, like the archive pipeline) is
fitted and scored the same way for reference only.

Validation: train 2018-2021, test 2022-2023 (held out; nothing is tuned on it).
Suomi-NPP's orbit did not drift, so the target is valid in 2022+. Error is scored on
months whose target is >= MIN_TARGET Aqua-equivalent detections. Baseline: the same
chain without the bridge (r_c = 1). A country passes when its held-out median
monthly miss is <= PASS_MEDIAN_APE % over >= MIN_TEST_MONTHS months. Untested: NRT
versus standard processing of NOAA-20 itself (no NRT archive for 2022-2023).

Current month: NOAA-20 NRT responses cached by build_month_to_date.py in
data/mtd_cache/ (re-fetched with FIRMS_MAP_KEY only on a cache miss), same filters
and outline, harmonized with the chain above for passing countries only, against the
harmonized history of the same calendar month 2003-2025 (Aqua counts to 2011,
harmonized Suomi-NPP from 2012). Typical error = the bridge's held-out median miss
and the published fit's held-out country-month median miss (heldout_errors.json),
combined in quadrature (treated as independent).

Inputs: data/noaa20/viirs-jpss1_<year>_<Country>.csv.gz (scripts/fetch_noaa20_archive.sh).
Outputs: web/public/data/bridge.json; adds `harmonized` fields to month_to_date.json
(run after build_month_to_date.py, which rewrites that file without them).

Usage: python3 scripts/build_bridge.py
"""
from __future__ import annotations

import io
import json
import math
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import polars as pl
import shapely
from shapely.geometry import shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_month_to_date as mtd  # noqa: E402  same outline, boxes, chunks, cache and filters

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
N20 = ROOT / "data" / "noaa20"
OUT = DATA / "bridge.json"
TRAIN = (2018, 2021)
TEST = (2022, 2023)
MIN_TARGET = 10.0
PASS_MEDIAN_APE = 25.0
MIN_TEST_MONTHS = 12
HIST = (2003, 2025)
LABEL = "harmonized (bridged from NOAA-20, validated 2022-2023), provisional: month incomplete"


def p_detect(frp: pl.Expr, b0: float, b1: float) -> pl.Expr:
    return 1.0 / (1.0 + (-(b0 + b1 * frp.log())).exp())


def monthly_n20(country: str, geom, b0: float, b1: float, kappa: float) -> dict[str, pl.DataFrame]:
    """Monthly harmonized NOAA-20 for both variants: nrt_like and archive_like."""
    parts = {"nrt_like": [], "archive_like": []}
    for y in range(TRAIN[0], TEST[1] + 1):
        df = pl.read_csv(N20 / f"viirs-jpss1_{y}_{country}.csv.gz", infer_schema_length=0,
                         columns=["latitude", "longitude", "acq_date", "confidence", "daynight", "frp", "type"])
        if df.is_empty():
            continue
        df = df.with_columns(pl.col("frp").cast(pl.Float64, strict=False), pl.col("latitude").cast(pl.Float64), pl.col("longitude").cast(pl.Float64))
        df = df.filter((pl.col("daynight") == "D") & pl.col("confidence").str.to_lowercase().is_in(["n", "h", "nominal", "high"]) & (pl.col("frp") > 0))
        df = df.with_columns(pl.col("acq_date").str.slice(0, 4).cast(pl.Int32).alias("year"), pl.col("acq_date").str.slice(5, 2).cast(pl.Int32).alias("month"),
                             p_detect(pl.col("frp"), b0, b1).alias("P"))
        inside = shapely.contains_xy(geom, df["longitude"].to_numpy(), df["latitude"].to_numpy())
        parts["nrt_like"].append(df.filter(pl.Series(inside)))
        parts["archive_like"].append(df.filter(pl.col("type") == "0"))
    out = {}
    for k, fr in parts.items():
        d = pl.concat(fr)
        out[k] = d.group_by("year", "month").agg((pl.col("P").sum() * kappa).alias("h_n20"), pl.len().alias("n_n20"))
    return out


def r2(obs: np.ndarray, pred: np.ndarray) -> float | None:
    if len(obs) < 3:
        return None
    ss = float(((obs - obs.mean()) ** 2).sum())
    return None if ss == 0 else 1 - float(((obs - pred) ** 2).sum()) / ss


def score(obs: np.ndarray, pred: np.ndarray) -> dict:
    keep = obs >= MIN_TARGET
    o, p = obs[keep], pred[keep]
    ape = 100 * np.abs(p - o) / o if len(o) else np.array([])
    return {
        "n_months": int(keep.sum()),
        "median_ape_pct": round(float(np.median(ape)), 2) if len(ape) else None,
        "p80_ape_pct": round(float(np.percentile(ape, 80)), 2) if len(ape) else None,
        "bias_pct": round(100 * (float(p.sum()) - float(o.sum())) / float(o.sum()), 2) if len(o) and o.sum() > 0 else None,
        "r2": (round(v, 4) if (v := r2(o, p)) is not None else None),
    }


def fit_variant(m: pl.DataFrame, target: pl.DataFrame) -> dict | None:
    j = target.join(m, on=["year", "month"], how="left").with_columns(pl.col("h_n20").fill_null(0.0))
    tr = j.filter(pl.col("year").is_between(*TRAIN))
    te = j.filter(pl.col("year").is_between(*TEST))
    if tr["h_n20"].sum() <= 0 or tr["target"].sum() <= 0:
        return None
    ratio = float(tr["target"].sum() / tr["h_n20"].sum())
    o, h = te["target"].to_numpy(), te["h_n20"].to_numpy()
    return {"ratio": round(ratio, 5), "train_target_total": round(float(tr["target"].sum()), 1),
            "test_bridged": score(o, ratio * h), "test_unbridged": score(o, h),
            "_pairs": (o, h, ratio)}


def summarize(rows: list[dict], key: str) -> dict:
    meds = [r[key]["median_ape_pct"] for r in rows if r[key]["median_ape_pct"] is not None]
    biases = [r[key]["bias_pct"] for r in rows if r[key]["bias_pct"] is not None]
    r2s = [r[key]["r2"] for r in rows if r[key]["r2"] is not None]
    return {"median_of_country_median_ape_pct": round(float(np.median(meds)), 2) if meds else None,
            "median_bias_pct": round(float(np.median(biases)), 2) if biases else None,
            "median_r2": round(float(np.median(r2s)), 4) if r2s else None,
            "countries_median_ape_le_threshold": sum(m <= PASS_MEDIAN_APE for m in meds)}


def pooled_log_r2(pairs: list[tuple[np.ndarray, np.ndarray]]) -> float | None:
    o = np.concatenate([a for a, _ in pairs]) if pairs else np.array([])
    p = np.concatenate([b for _, b in pairs]) if pairs else np.array([])
    keep = (o >= MIN_TARGET) & (p > 0)
    v = r2(np.log10(o[keep]), np.log10(p[keep]))
    return round(v, 4) if v is not None else None


def current_month(countries: dict, params: dict, geo: dict, mfile: dict) -> dict:
    """Harmonized NOAA-20 NRT month to date for passing countries (cached responses)."""
    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    d0, d1 = (date.fromisoformat(x) for x in mfile["window_utc"])
    out = {}
    for c, info in countries.items():
        if not info["pass"] or c not in mfile["countries"]:
            continue
        g = geo[mtd.ne_name(c)]
        lg = params["countries"][c]["logistic"]
        kappa = params["countries"][c]["kappa"]
        frames, complete = [], True
        for b in mtd.boxes(g):
            for s, n in mtd.chunks(d0, d1):
                body = mtd.fetch(key, "VIIRS_NOAA20_NRT", b, s, n) if key else (
                    (mtd.CACHE / f"VIIRS_NOAA20_NRT_{'_'.join(str(round(v, 3)) for v in b)}_{n}_{s.isoformat()}.csv").read_text()
                    if (mtd.CACHE / f"VIIRS_NOAA20_NRT_{'_'.join(str(round(v, 3)) for v in b)}_{n}_{s.isoformat()}.csv").exists() else None)
                if body is None:
                    complete = False
                    continue
                if body:
                    df = mtd.keep(pl.read_csv(io.StringIO(body), infer_schema_length=0), "VIIRS_NOAA20_NRT", d0, d1)
                    if not df.is_empty():
                        mask = shapely.contains_xy(g, df["longitude"].cast(pl.Float64).to_numpy(), df["latitude"].cast(pl.Float64).to_numpy())
                        frames.append(df.filter(pl.Series(mask)).select("latitude", "longitude", "acq_date", "acq_time", "frp"))
        if not complete:
            continue
        df = pl.concat(frames).unique() if frames else pl.DataFrame({"frp": []}, schema={"frp": pl.Utf8})
        n_raw = df.height
        if n_raw != mfile["countries"][c].get("NOAA-20", {}).get("month_to_date", n_raw):
            print(f"  {c}: NRT count {n_raw} differs from month_to_date.json; skipped", file=sys.stderr)
            continue
        h = float(df.select(p_detect(pl.col("frp").cast(pl.Float64), lg["b0"], lg["b1"]).sum()).item() or 0.0) * kappa if n_raw else 0.0
        out[c] = {"n_raw": n_raw, "h_n20": h}
    return out


def main() -> int:
    params = json.loads((DATA / "params_global.json").read_text())
    held = json.loads((DATA / "heldout_errors.json").read_text())["countries"]
    mfile = json.loads((DATA / "month_to_date.json").read_text())
    geo = {f["properties"]["NAME"]: shape(f["geometry"]) for f in json.loads(mtd.GEO.read_text())["features"]}
    cal = pl.read_csv(DATA / "calendar_harmonized_countries.csv", comment_prefix="#")

    names = sorted({p.name.split("_", 2)[2].removesuffix(".csv.gz") for p in N20.glob("viirs-jpss1_*_*.csv.gz")})
    ready = [c for c in names if c in params["countries"] and mtd.ne_name(c) in geo
             and all((N20 / f"viirs-jpss1_{y}_{c}.csv.gz").exists() for y in range(TRAIN[0], TEST[1] + 1))]
    print(f"{len(ready)} countries with a complete NOAA-20 archive {TRAIN[0]}-{TEST[1]}", file=sys.stderr)

    countries, pairs = {}, {"bridged": [], "unbridged": []}
    for c in ready:
        p = params["countries"][c]
        lg, kappa = p["logistic"], p["kappa"]
        g = geo[mtd.ne_name(c)]
        shapely.prepare(g)
        months = pl.DataFrame({"year": [y for y in range(TRAIN[0], TEST[1] + 1) for _ in range(12)],
                               "month": [m for _ in range(TRAIN[0], TEST[1] + 1) for m in range(1, 13)]},
                              schema={"year": pl.Int32, "month": pl.Int32})
        target = months.join(cal.filter(pl.col("country") == c).select(pl.col("year").cast(pl.Int32), pl.col("month").cast(pl.Int32),
                                                                       pl.col("n_harmonized").alias("target")), on=["year", "month"], how="left").with_columns(pl.col("target").fill_null(0.0))
        m = monthly_n20(c, g, lg["b0"], lg["b1"], kappa)
        a = fit_variant(m["nrt_like"], target)
        b = fit_variant(m["archive_like"], target)
        if a is None:
            continue
        o, h, ratio = a.pop("_pairs")
        if b:
            b.pop("_pairs")
        pairs["bridged"].append((o, ratio * h))
        pairs["unbridged"].append((o, h))
        tb = a["test_bridged"]
        ok = tb["median_ape_pct"] is not None and tb["median_ape_pct"] <= PASS_MEDIAN_APE and tb["n_months"] >= MIN_TEST_MONTHS
        fit_err = held.get(c, {}).get("country_month", {}).get("model", {}).get("median_ape_pct")
        typical = math.hypot(tb["median_ape_pct"], fit_err) if ok and fit_err is not None else None
        countries[c] = {"ratio": a["ratio"], "train_target_total": a["train_target_total"],
                        "test_bridged": tb, "test_unbridged": a["test_unbridged"],
                        "archive_like": ({"ratio": b["ratio"], "test_bridged": b["test_bridged"]} if b else None),
                        "fit_heldout_median_ape_pct": fit_err,
                        "typical_error_pct": round(typical, 1) if typical is not None else None,
                        "pass": bool(ok and typical is not None)}
        print(f"  {c:34s} r={a['ratio']:.3f}  test median miss bridged {tb['median_ape_pct']}%  unbridged {a['test_unbridged']['median_ape_pct']}%  {'PASS' if countries[c]['pass'] else 'fail'}", file=sys.stderr)

    rows = list(countries.values())
    n_pass = sum(r["pass"] for r in rows)
    bridge = {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "generated_by": "scripts/build_bridge.py",
        "fit_version": params["fit_version"],
        "from_platform": "NOAA-20 VIIRS 375 m (FIRMS viirs-jpss1 standard-processing archive)",
        "to_platform": "Suomi-NPP VIIRS 375 m, harmonized to Aqua-MODIS-equivalent with the published fit",
        "method": "per country: harmonized NOAA-20 (kappa x sum P(FRP), published logistic and kappa unchanged) x r, r = sum of harmonized Suomi-NPP / sum of harmonized NOAA-20 over the training months",
        "input_filters": "NOAA-20: daytime, confidence nominal or high, FRP > 0, all fire types, inside the Natural Earth 110 m outline (as the near-real-time month); target: the published harmonized Suomi-NPP series (vegetation fires, FIRMS country files)",
        "type_filter_note": "Near-real-time files carry no fire type, so the bridge is fitted without the type filter; r absorbs the average non-vegetation share. The type-0 variant (archive_like) is scored for reference only.",
        "train_years": list(TRAIN), "test_years": list(TEST),
        "score_definition": f"held-out months with target >= {MIN_TARGET:g} Aqua-equivalent detections; ape = 100 x |pred - target| / target; bias = 100 x (sum pred - sum target) / sum target; r2 on monthly values",
        "pass_rule": f"held-out median monthly miss <= {PASS_MEDIAN_APE:g}% over >= {MIN_TEST_MONTHS} months",
        "typical_error_definition": "sqrt(bridge held-out median miss^2 + published fit held-out country-month median miss^2) (quadrature, treated as independent)",
        "untested": "near-real-time versus standard processing of NOAA-20 (no near-real-time archive for the test years)",
        "n_countries": len(rows), "n_pass": n_pass,
        "summary": {"bridged": summarize(rows, "test_bridged") | {"pooled_log10_r2": pooled_log_r2(pairs["bridged"])},
                    "unbridged": summarize(rows, "test_unbridged") | {"pooled_log10_r2": pooled_log_r2(pairs["unbridged"])}},
        "countries": countries,
    }

    # Current month, passing countries only.
    now = current_month(countries, params, geo, mfile)
    days_c, days_m = mfile["days_covered"], mfile["days_in_month"]
    month = int(mfile["month"][5:7])
    applied = 0
    for c, row in mfile["countries"].items():
        row.pop("harmonized", None)
        if c not in now:
            continue
        info = countries[c]
        hn = info["ratio"] * now[c]["h_n20"]
        pace = hn * days_m / days_c
        hist = cal.filter((pl.col("country") == c) & (pl.col("month") == month) & pl.col("year").is_between(*HIST))
        by = {int(y): float(v) for y, v in hist.select("year", "n_harmonized").iter_rows()}
        vals = sorted(by.get(y, 0.0) for y in range(HIST[0], HIST[1] + 1))
        nv = len(vals)
        med = vals[nv // 2] if nv % 2 else (vals[nv // 2 - 1] + vals[nv // 2]) / 2
        below = sum(v < pace for v in vals)
        e = info["typical_error_pct"] / 100
        lo, hi = pace * (1 - e), pace * (1 + e)
        if lo > vals[-1]:
            verdict = "above every past year, even at the low end of the typical error"
        elif hi < vals[0]:
            verdict = "below every past year, even at the high end of the typical error"
        elif lo > med:
            verdict = "above the median, beyond the typical error"
        elif hi < med:
            verdict = "below the median, beyond the typical error"
        else:
            verdict = "near the median (within the typical error)"
        row["harmonized"] = {
            "label": LABEL,
            "month_to_date": round(hn, 1),
            "pace_full_month": round(pace, 1),
            "pace_range": [round(lo, 1), round(hi, 1)],
            "typical_error_pct": info["typical_error_pct"],
            "bridge_ratio": info["ratio"],
            "history_years": list(HIST),
            "history_median": round(med, 1),
            "history_min": round(vals[0], 1),
            "history_max": round(vals[-1], 1),
            "percentile_of_pace": round(100 * below / nv, 1),
            "rank_of_pace": 1 + sum(v > pace for v in vals),
            "rank_out_of": nv + 1,
            "verdict": verdict,
        }
        applied += 1
    mfile["harmonized_note"] = (f"{applied} countries carry a harmonized month to date: NOAA-20 near-real-time x the published fit x a NOAA-20 to Suomi-NPP bridge "
                                f"validated on {TEST[0]}-{TEST[1]} (bridge.json). History: the harmonized calendar, same month {HIST[0]}-{HIST[1]}. "
                                "Others stay raw and uncorrected.")
    bridge["current_month"] = {"month": mfile["month"], "window_utc": mfile["window_utc"], "n_countries_harmonized": applied}
    OUT.write_text(json.dumps(bridge, separators=(",", ":"), ensure_ascii=False))
    (DATA / "month_to_date.json").write_text(json.dumps(mfile, separators=(",", ":"), ensure_ascii=False))
    s = bridge["summary"]
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} countries, {n_pass} pass; bridged {s['bridged']}; unbridged {s['unbridged']}; "
          f"{applied} harmonized current months", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
