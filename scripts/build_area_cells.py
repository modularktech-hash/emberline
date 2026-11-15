#!/usr/bin/env python3
"""Global H3 cell x month aggregate for drawn areas (R7, R8, R11).

A drawn or typed area is answered by summing small, precomputed cells, never by
loading points. This script reduces the filtered detections of every country
(data/global_public/detections_<Country>.parquet, from run_global.py; the same
filtered detections the published fit used) to one row per
(H3 cell, country, year, month):

  n_modis   MODIS Terra + Aqua detections (raw)
  n_aqua    Aqua detections (raw)
  n_viirs   Suomi-NPP VIIRS detections (raw)
  n_harm    harmonized Aqua-equivalent count, computed exactly as
            fit_harmonization.calendar() does for the country calendar:
            observed Aqua before 2012, sum of kappa * P(Aqua sees it | FRP)
            over Suomi-NPP detections from 2012, using that country's
            published parameters (params_global.json; own or pooled fit).
            Null for a country without a fit: those rows are uncorrected and
            the app shows them flagged, never as corrected.

A cell straddling a border keeps one row per country, so each contribution
carries its own country's parameters and fit flag.

Stage 1 (per country, cached in data/area_cells/<Country>.parquet) works at H3
res 5. Stage 2 rolls up to the published resolution and writes one Parquet file
per H3 res-1 ancestor (web/public/data/area/<res1>.parquet), rows sorted by
H3 res-3 parent, then cell, then year and month, plus an index
(web/public/data/area/index.json) of files, sizes and the bounding box of each.
The client turns an area into cells with h3-js, fetches only the files those
cells live in, and sums.

Usage: python3 scripts/build_area_cells.py [--res 4] [--jobs 2] [--only Country ...]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import h3
import h3.api.basic_int as H3I
import numpy as np
import polars as pl

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "global_public"
CACHE = ROOT / "data" / "area_cells"
WEB = ROOT / "web" / "public" / "data"
OUT = WEB / "area"
BASE_RES = 5
VIIRS_START = 2012


def prob(frp: np.ndarray, b0: float, b1: float) -> np.ndarray:
    # Identical to fit_harmonization.prob().
    return 1 / (1 + np.exp(-(b0 + b1 * np.log(np.clip(frp, 0.1, None)))))


def stage1(country: str) -> tuple[str, int]:
    out = CACHE / f"{country}.parquet"
    if out.exists():
        return country, -1
    params = json.loads((WEB / "params_global.json").read_text())["countries"].get(country)
    import pyarrow.parquet as pq
    src = SRC / f"detections_{country}.parquet"
    if not src.exists():
        # A few small places have a published calendar but no detections file in
        # data/global_public: rebuild their detections from the archive with the
        # same filters (run_global.build_one).
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import run_global
        det = run_global.build_one(country)
        src = CACHE / "_det" / f"{country}.parquet"
        src.parent.mkdir(parents=True, exist_ok=True)
        (det if det is not None else pl.DataFrame(schema={"lat": pl.Float64, "lon": pl.Float64,
            "acq_ts": pl.Datetime("us", "UTC"), "platform": pl.Utf8, "frp_mw": pl.Float64})).write_parquet(src)
    pf = pq.ParquetFile(src)
    b0 = b1 = kappa = None
    if params:
        b0, b1, kappa = params["logistic"]["b0"], params["logistic"]["b1"], params["kappa"]
    parts = []
    # Batches of 4M detections keep the largest countries (DRC: ~50M) within memory.
    for batch in pf.iter_batches(batch_size=4_000_000, columns=["lat", "lon", "acq_ts", "platform", "frp_mw"]):
        d = pl.from_arrow(batch)
        u = d.select("lat", "lon").unique()
        cells = np.fromiter((H3I.latlng_to_cell(a, b, BASE_RES) for a, b in zip(u["lat"].to_numpy(), u["lon"].to_numpy())),
                            dtype=np.uint64, count=u.height)
        d = d.join(u.with_columns(pl.Series("cell", cells)), on=["lat", "lon"], how="left").drop("lat", "lon")
        d = d.with_columns(pl.col("acq_ts").dt.year().cast(pl.Int16).alias("year"),
                           pl.col("acq_ts").dt.month().cast(pl.Int8).alias("month")).drop("acq_ts")
        if params:
            d = d.with_columns(pl.Series("eq", prob(d["frp_mw"].to_numpy(), b0, b1) * kappa))
        else:
            d = d.with_columns(pl.lit(None, dtype=pl.Float64).alias("eq"))
        plat = pl.col("platform")
        parts.append(d.group_by("cell", "year", "month").agg(
            plat.is_in(["Terra", "Aqua"]).sum().cast(pl.Int32).alias("n_modis"),
            (plat == "Aqua").sum().cast(pl.Int32).alias("n_aqua"),
            (plat == "Suomi-NPP").sum().cast(pl.Int32).alias("n_viirs"),
            pl.when((plat == "Suomi-NPP") & (pl.col("year") >= VIIRS_START)).then(pl.col("eq")).otherwise(None)
              .sum().alias("harm_viirs"),
        ))
        del d
    if not parts:
        pl.DataFrame(schema={"cell": pl.UInt64, "year": pl.Int16, "month": pl.Int8, "n_modis": pl.Int32,
                             "n_aqua": pl.Int32, "n_viirs": pl.Int32, "harm_viirs": pl.Float64}).write_parquet(out)
        return country, 0
    agg = pl.concat(parts).group_by("cell", "year", "month").agg(
        pl.col("n_modis").sum(), pl.col("n_aqua").sum(), pl.col("n_viirs").sum(), pl.col("harm_viirs").sum()
    ).sort("cell", "year", "month")
    agg.write_parquet(out, compression="zstd")
    return country, agg.height


def countries() -> list[str]:
    files = sorted(SRC.glob("detections_*.parquet"), key=lambda p: -p.stat().st_size)
    have = [p.stem.removeprefix("detections_") for p in files]
    cal = pl.read_parquet(WEB / "calendar_raw_global.parquet", columns=["scope", "key"]).filter(pl.col("scope") == "country")
    return have + sorted(set(cal["key"].unique()) - set(have))


def stage2(res: int) -> dict:
    params = json.loads((WEB / "params_global.json").read_text())
    fitted = params["countries"]
    frames = []
    for p in sorted(CACHE.glob("*.parquet")):  # _det/ holds rebuilt inputs, not results
        c = p.stem
        f = pl.read_parquet(p)
        if f.is_empty():
            continue
        frames.append(f.with_columns(pl.lit(c).alias("country")))
    a = pl.concat(frames)
    # Roll the res-5 cells up to `res` (exact: an H3 child has exactly one parent).
    u = a["cell"].unique().to_numpy()
    up = np.fromiter((H3I.cell_to_parent(int(c), res) for c in u), dtype=np.uint64, count=len(u))
    a = a.join(pl.DataFrame({"cell": u, "c": up}, schema={"cell": pl.UInt64, "c": pl.UInt64}), on="cell").drop("cell")
    a = a.group_by("c", "country", "year", "month").agg(
        pl.col("n_modis").sum(), pl.col("n_aqua").sum(), pl.col("n_viirs").sum(), pl.col("harm_viirs").sum())
    fit = a["country"].is_in(list(fitted))
    # Harmonized: observed Aqua before 2012, Aqua-equivalent from VIIRS after; null where no fit.
    a = a.with_columns(
        pl.when(~fit).then(None)
          .when(pl.col("year") < VIIRS_START).then(pl.col("n_aqua").cast(pl.Float64))
          .otherwise(pl.col("harm_viirs")).cast(pl.Float32).alias("n_harm"))
    hc = pl.read_parquet(WEB / "calendar_harmonized_global.parquet").filter(pl.col("scope") == "country")
    hm = hc.select((pl.col("year").cast(pl.Int32) * 12 + pl.col("month").cast(pl.Int32) - 1).min()).item()
    harm_first = f"{hm // 12}-{hm % 12 + 1:02d}"
    uc = a["c"].unique().to_numpy()
    p3 = np.fromiter((H3I.cell_to_parent(int(c), 3) for c in uc), dtype=np.uint64, count=len(uc))
    p1 = np.fromiter((H3I.cell_to_parent(int(c), 1) for c in uc), dtype=np.uint64, count=len(uc))
    keys = pl.DataFrame({"c": uc, "p3": p3, "p1": p1}, schema={"c": pl.UInt64, "p3": pl.UInt64, "p1": pl.UInt64})
    a = a.join(keys, on="c").sort("p3", "c", "year", "month", "country")
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.parquet"):
        old.unlink()
    index = []
    for (p1v,), g in a.group_by(["p1"], maintain_order=True):
        name = h3.int_to_str(int(p1v))
        t = g.select(
            pl.col("c").map_elements(h3.int_to_str, return_dtype=pl.Utf8).alias("cell"),
            pl.col("p3").map_elements(h3.int_to_str, return_dtype=pl.Utf8).alias("h3_parent"),
            "country", "year", "month", "n_modis", "n_aqua", "n_viirs", "n_harm")
        path = OUT / f"{name}.parquet"
        t.write_parquet(path, compression="zstd", compression_level=19, statistics=True, row_group_size=1 << 20)
        index.append({"file": f"area/{name}.parquet", "res1": name, "rows": t.height, "bytes": path.stat().st_size})
    total = sum(r["bytes"] for r in index)
    meta = {
        "resolution": res,
        "cell_area_km2_mean": round(h3.average_hexagon_area(res, "km^2"), 1),
        "file_key": "H3 res-1 ancestor of the cell",
        "row_order": "h3_parent (res 3), cell, year, month, country",
        "columns": {
            "cell": f"H3 res-{res} cell",
            "h3_parent": "H3 res-3 parent of the cell",
            "country": "FIRMS country file the detections came from (a border cell has one row per country)",
            "n_modis": "raw MODIS Terra+Aqua detections",
            "n_aqua": "raw Aqua detections",
            "n_viirs": "raw Suomi-NPP VIIRS detections",
            "n_harm": "harmonized Aqua-equivalent detections (observed Aqua before 2012, predicted from VIIRS after); null = country has no fit, uncorrected",
        },
        "fit_version": params["fit_version"],
        # Same coverage as the country calendars: harmonized months start where
        # calendar_harmonized_global.parquet starts (Aqua's first months).
        "harmonized_first_ym": harm_first,
        "first_year": int(a["year"].min()), "last_year": int(a["year"].max()), "viirs_first_year": VIIRS_START,
        "filters": "same filtered detections as the country calendars (run_global.py / build_tables.py)",
        "files": index,
        "total_bytes": total,
        "total_rows": int(sum(r["rows"] for r in index)),
    }
    (OUT / "index.json").write_text(json.dumps(meta, indent=1))
    return meta


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", type=int, default=4)
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--stage", choices=["1", "2", "both"], default="both")
    a = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    if a.stage in ("1", "both"):
        todo = a.only or countries()
        # spawn, not fork: a forked child inherits polars' thread pool locks and can deadlock.
        import multiprocessing as mp
        with ProcessPoolExecutor(max_workers=a.jobs, mp_context=mp.get_context("spawn")) as ex:
            for i, (c, n) in enumerate(ex.map(stage1, todo), 1):
                print(f"[{i}/{len(todo)}] {c}: {'cached' if n < 0 else f'{n} rows'}", file=sys.stderr, flush=True)
    if a.stage in ("2", "both"):
        m = stage2(a.res)
        print(f"res {a.res}: {len(m['files'])} files, {m['total_rows']} rows, {m['total_bytes'] / 1e6:.1f} MB", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
