#!/usr/bin/env python3
"""Write web/public/data/manifest.json: one entry per published data file.

Everything measurable is computed from the files themselves: byte size,
sha256, row count, columns and types, time span, the rows per scope of the
calendar Parquets (country rows vs H3 grid rows, which hold the same
detections twice) and the fit version each file carries. Only the prose
(purpose, units, source products) is written here, keyed by file and column
name. Re-run after any data change:

    python3 scripts/build_manifest.py
    python3 scripts/check_data_contract.py     # verifies the hashes

The primary dataset is the world fit (params_global.json). The four-country
files (params.json, calendar_*.parquet without _global, cell_day.parquet) are
an older, smaller fallback; their fit version is recorded separately so the
two are never silently mixed.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public" / "data"
OUT = WEB / "manifest.json"

FIRMS_ARCHIVE = ("NASA FIRMS archive country files: MODIS Collection 6.1 (Terra, Aqua; MCD14) and "
                 "VIIRS 375 m Suomi-NPP (VNP14IMG), filtered to daytime vegetation fires (type 0)")
FIRMS_NRT = "NASA FIRMS near-real-time: VIIRS 375 m NOAA-20 and NOAA-21, MODIS Terra/Aqua (raw, uncorrected)"
TLE = "CelesTrak public two-line elements via tle.ivanstanojevic.me"

# dataset: "world" = the published fit; "fallback_four_country" = Australia, Canada, Chile, Portugal
# fit: which fit produced the file's numbers. "params_global.json" / "params.json" mean "the version
# recorded in that file"; None means the file does not depend on any fit.
FILES = {
    "params_global.json": dict(
        dataset="world", fit="self", source=FIRMS_ARCHIVE,
        purpose="Fitted parameters and train/held-out validation for the 171 fitted countries; "
                "pooled model; the 66 countries without a published fit"),
    "coverage_status.json": dict(
        dataset="world", fit="self", source="derived from params_global.json and calendar_raw_global.parquet",
        purpose="Reason-coded fit status for all 237 FIRMS countries"),
    "validation_points.json": dict(
        dataset="world", fit="self", source=FIRMS_ARCHIVE,
        purpose="Held-out (2019-2021) cell-month sample per fitted country and the training-only ratio baseline"),
    "transfer_validation.json": dict(
        dataset="world", fit="self", source="derived from params_global.json and the FIRMS archive (scripts/transfer_validation.py)",
        purpose="E28 analysis: leave-one-country-out held-out (2019-2021) scores of the pooled curve vs own fits; not a published fit"),
    "proof.json": dict(
        dataset="world", fit="self", source="derived from params_global.json, validation_points.json, countries.json and the world calendars (scripts/build_proof.py)",
        purpose="Computed numbers for the Method Proof section: 2012 step collapse, held-out benchmark counts, record-month shares, seam-year placebo"),
    "month_to_date.json": dict(
        dataset="world", fit=None, source="NASA FIRMS near-real-time area API (MODIS_NRT, VIIRS_NOAA20_NRT) and calendar_raw_global.parquet (scripts/build_month_to_date.py)",
        purpose="Provisional, raw month-to-date counts per country against the raw history of the same calendar month; not harmonized"),
    "dataset.json": dict(
        dataset="world", fit="self", source="derived from params_global.json, coverage_status.json and the world calendars (scripts/build_dataset_card.py)",
        purpose="Dataset card: coverage, scale, unit, licence and citation of the published record"),
    "calendar_harmonized_countries.csv": dict(
        dataset="world", fit="params_global.json", source="country rows of calendar_harmonized_global.parquet (scripts/build_dataset_card.py)",
        purpose="CSV export: harmonized monthly Aqua-MODIS-equivalent counts per fitted country (country, year, month, n_harmonized)"),
    "eonet.json": dict(
        dataset="live", fit=None, source="NASA EONET API v3, category wildfires, status open (scripts/build_eonet.py)",
        purpose="Open NASA EONET wildfire events (curated; a different source from the FIRMS detections), latest point per event"),
    "pipeline.json": dict(
        dataset="world", fit="self", source="derived from the published files (and file counts from data/global/ on the build machine) by scripts/build_pipeline_stats.py",
        purpose="Numbers for the /data data journey: archive files, filtered detections, training matches, fits, held-out score, calendar sizes, bytes of a country view"),
    "countries.json": dict(
        dataset="world", fit="self", source="derived from the world calendars and params_global.json",
        purpose="One summary row per fitted country (totals, 2012 step ratios, held-out R2, season trends)"),
    "season.json": dict(
        dataset="world", fit="self", source=FIRMS_ARCHIVE,
        purpose="Per fire year: day by which 10/50/90% of detections occurred, raw and harmonized; "
                "daily or monthly resolution per country"),
    "drift.json": dict(
        dataset="world", fit="self", source=FIRMS_ARCHIVE,
        purpose="Mean local solar overpass time per satellite per year (Terra/Aqua orbital drift), "
                "with observed/predicted Aqua ratios"),
    "calendar_raw_global.parquet": dict(
        dataset="world", fit=None, source=FIRMS_ARCHIVE,
        purpose="Raw monthly detection counts and summed FRP per sensor (MODIS to 2011 and VIIRS from 2012 "
                "both present for every year archived), per country and per H3 res-2 cell"),
    "calendar_harmonized_global.parquet": dict(
        dataset="world", fit="params_global.json", source=FIRMS_ARCHIVE,
        purpose="Harmonized monthly Aqua-MODIS-equivalent counts (Aqua to 2011, kappa*sum P over Suomi-NPP "
                "from 2012), per country and per H3 res-2 cell; fitted countries only"),
    "params.json": dict(
        dataset="fallback_four_country", fit="self", source=FIRMS_ARCHIVE,
        purpose="Fallback: the first four countries' fit (Australia, Canada, Chile, Portugal)"),
    "calendar_raw.parquet": dict(
        dataset="fallback_four_country", fit=None, source=FIRMS_ARCHIVE,
        purpose="Fallback: raw monthly calendar for the first four countries"),
    "calendar_harmonized.parquet": dict(
        dataset="fallback_four_country", fit="params.json", source=FIRMS_ARCHIVE,
        purpose="Fallback: harmonized monthly calendar for the first four countries"),
    "cell_day.parquet": dict(
        dataset="fallback_four_country", fit=None, source=FIRMS_ARCHIVE,
        purpose="Per H3 res-5 cell x UTC day x satellite for the first four countries; sorted by H3 res-2 "
                "parent then date (filter on h3_parent for range reads)"),
    "live.json": dict(
        dataset="live", fit=None, source=FIRMS_NRT,
        purpose="Recent raw detections binned to a 0.5 degree grid for the globe; not harmonized, "
                "not the Suomi-NPP record, not comparable with the historical calendars"),
    "harmonized_uncertainty.json": dict(
        dataset="world", fit="self", source="derived from the FIRMS archive and params_global.json (scripts/output_uncertainty.py)",
        purpose="E27: 95% bootstrap interval of harmonized country totals from logistic-coefficient uncertainty only "
                "(see its `covers` field); pooled-curve countries not estimated"),
    "current_month.json": dict(
        dataset="live", fit=None, source="FIRMS NRT and standard archive, NOAA-20 VIIRS (scripts, E07 prototype)",
        purpose="Prototype same-platform NOAA-20 recent window vs NOAA-20 history; not harmonized, "
                "not Aqua-equivalent"),
    "tle.json": dict(
        dataset="live", fit=None, source=TLE,
        purpose="Orbital elements for the satellite view"),
}

UNITS = {
    "scope": "'country' (key = FIRMS country name) or 'h3_parent' (key = H3 resolution-2 cell)",
    "key": "country name or H3 res-2 cell index, per scope",
    "year": "UTC calendar year of acquisition",
    "month": "UTC calendar month, 1-12",
    "sensor": "'MODIS' (Terra+Aqua) or 'VIIRS' (Suomi-NPP)",
    "n_detections": "count of filtered detections",
    "frp_sum_mw": "sum of per-detection fire radiative power, MW (a sum, not an energy)",
    "n_harmonized": "Aqua-MODIS-equivalent daytime vegetation-fire detections (count, may be fractional)",
    "h3": "H3 resolution-5 cell index",
    "h3_parent": "H3 resolution-2 parent cell index",
    "acq_date": "UTC acquisition date",
    "doy": "UTC day of year",
    "platform": "satellite (Terra, Aqua, Suomi-NPP)",
    "frp_mean_mw": "mean FRP per detection, MW",
    "frp_max_mw": "maximum FRP of a detection, MW",
    "mean_pixel_area_km2": "mean detection pixel area, km2",
    "mean_lst_hours": "mean local solar time of acquisition, hours (UTC + longitude/15)",
}

SCOPE_NOTE = ("Country rows and h3_parent rows count the same detections twice. Sum within one scope only: "
              "filter scope == 'country' for national totals or scope == 'h3_parent' for areas.")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def parquet_entry(path: Path) -> dict:
    d = pl.read_parquet(path)
    e: dict = {"format": "parquet", "rows": d.height,
               "columns": [{"name": c, "type": str(t), "unit": UNITS.get(c)} for c, t in d.schema.items()]}
    if "year" in d.columns:
        e["time_span"] = {"first_year": int(d["year"].min()), "last_year": int(d["year"].max())}
    if "acq_date" in d.columns:
        e["time_span"].update(first_date=str(d["acq_date"].min()), last_date=str(d["acq_date"].max()))
    if "scope" in d.columns:
        value = next((c for c in ("n_detections", "n_harmonized") if c in d.columns), None)
        agg = [pl.len().alias("rows"), pl.col("key").n_unique().alias("keys")]
        if value:
            agg.append(pl.col(value).sum().alias("total"))
        g = d.group_by("scope").agg(agg).sort("scope")
        e["scope_kind"] = "both" if g.height > 1 else str(g["scope"][0])
        e["scopes"] = {r["scope"]: {"rows": r["rows"], "keys": r["keys"],
                                    **({f"sum_{value}": round(float(r["total"]), 3)} if value else {})}
                       for r in g.iter_rows(named=True)}
        e["scope_note"] = SCOPE_NOTE
    elif "h3" in d.columns:
        e["scope_kind"] = "h3_grid"
    return e


def json_entry(path: Path) -> dict:
    j = json.loads(path.read_text())
    e: dict = {"format": "json", "top_level_keys": list(j)}
    c = j.get("countries")
    if isinstance(c, (dict, list)):
        e["rows"] = len(c)
        e["row_unit"] = "country"
        e["scope_kind"] = "country"
    for k in ("train_years", "test_years", "drift_years"):
        if k in j:
            e.setdefault("time_span", {})[k] = j[k]
    years = set()
    if isinstance(c, dict):
        for v in c.values():
            for r in (v.get("years") or []) if isinstance(v, dict) else []:
                if isinstance(r, dict) and "year" in r:
                    years.add(r["year"])
    if years:
        e.setdefault("time_span", {}).update(first_year=min(years), last_year=max(years))
    for k in ("fetched_utc", "fetched"):
        if k in j:
            e["fetched_utc"] = j[k]
    if "unit" in j:
        e["unit"] = j["unit"]
    return e


DATASET_INFO = {
    "world": dict(role="primary", description="the published world fit; what the app reads first",
                  params="params_global.json"),
    "fallback_four_country": dict(role="fallback",
                                  description="older four-country files (Australia, Canada, Chile, Portugal), "
                                              "a complete set of their own; read only as a whole set",
                                  params="params.json"),
    "live": dict(role="separate", description="recent raw feeds; never harmonized, never mixed with the "
                                              "historical record", params=None),
}

MIXING_RULE = ("A view may combine files only from ONE dataset (plus 'live', which is never harmonized). "
               "Never combine params, calendars or summaries from 'world' with any file from "
               "'fallback_four_country'. If any world file needed by a view fails, either load the whole "
               "fallback set (params.json + calendar_raw.parquet + calendar_harmonized.parquet) and say so "
               "on screen, or show the view as unavailable. World-only summaries (countries.json, season.json, "
               "drift.json, coverage_status.json, validation_points.json) have no fallback equivalent.")


def build_datasets(files: list[dict]) -> dict:
    """Group files into named, versioned datasets. A dataset is consistent when every member that
    depends on a fit carries the same fit version, and its harmonized calendar holds exactly the
    countries its params file fitted."""
    out = {}
    for name, info in DATASET_INFO.items():
        members = [f for f in files if f["dataset"] == name]
        versions = sorted({f["fit_version"] for f in members if f["fit_version"]})
        problems = []
        if len(versions) > 1:
            problems.append(f"fit versions differ: {versions}")
        if info["params"]:
            fitted = set(json.loads((WEB / info["params"]).read_text())["countries"])
            harm = next(f["name"] for f in members if f["name"].startswith("calendar_harmonized") and f["name"].endswith(".parquet"))
            keys = set(pl.read_parquet(WEB / harm, columns=["scope", "key"])
                       .filter(pl.col("scope") == "country")["key"].unique().to_list())
            if keys != fitted:
                problems.append(f"{harm} countries != {info['params']} fitted countries")
        out[name] = {
            "role": info["role"], "description": info["description"],
            "fit_version": versions[0] if len(versions) == 1 else None,
            "params_file": info["params"],
            "files": {f["name"]: f["sha256"] for f in members},
            "consistent": not problems, "problems": problems,
        }
    return out


OPTIONAL = {"month_to_date.json"}  # needs a FIRMS MAP_KEY run (scripts/build_month_to_date.py)


def main() -> int:
    present = sorted(p.name for p in WEB.iterdir() if p.is_file() and p.name != OUT.name and not p.name.startswith("."))
    unknown = sorted(set(present) - set(FILES))
    missing = sorted(set(FILES) - set(present) - OPTIONAL)
    if unknown or missing:
        print(f"manifest: describe every published file. unknown={unknown} missing={missing}", file=sys.stderr)
        return 1
    versions = {}
    for name in ("params_global.json", "params.json"):
        versions[name] = json.loads((WEB / name).read_text())["fit_version"]
    files = []
    for name in present:
        meta = FILES[name]
        path = WEB / name
        e = {"name": name, "dataset": meta["dataset"], "purpose": meta["purpose"], "source": meta["source"],
             "bytes": path.stat().st_size, "sha256": sha256(path)}
        if name.endswith(".parquet"):
            e |= parquet_entry(path)
        elif name.endswith(".csv"):
            lines = [l for l in path.read_text().splitlines() if not l.startswith("#")]
            e |= {"format": "csv", "columns": lines[0].split(","), "rows": len(lines) - 1, "comment_prefix": "#"}
        else:
            e |= json_entry(path)
        if meta["fit"] == "self":
            e["fit_version"] = json.loads(path.read_text())["fit_version"]
        elif meta["fit"]:
            e["fit_version"] = versions[meta["fit"]]
            e["fit_version_from"] = meta["fit"]
        else:
            e["fit_version"] = None
        files.append(e)
    datasets = build_datasets(files)
    world = [datasets["world"]["fit_version"]] if datasets["world"]["fit_version"] else []
    fallback = [datasets["fallback_four_country"]["fit_version"]] if datasets["fallback_four_country"]["fit_version"] else []
    manifest = {
        "manifest_version": 2,
        "fit_version": datasets["world"]["fit_version"],
        "fallback_fit_version": datasets["fallback_four_country"]["fit_version"],
        "datasets": datasets,
        "mixing_rule": MIXING_RULE,
        "generated_by": "scripts/build_manifest.py",
        "files": files,
    }
    OUT.write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(files)} files, world fit {world}, fallback fit {fallback}")
    ok = all(d["consistent"] for d in datasets.values())
    return 0 if ok and len(world) == 1 else 1


if __name__ == "__main__":
    sys.exit(main())
