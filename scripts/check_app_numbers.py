#!/usr/bin/env python3
"""Cross-check the numbers the app shows against the published data files.

Checks, all computed from web/public/data/ (nothing typed in by hand):

1. countries.json against the calendars and params_global.json, for every
   fitted country: yearly raw (MODIS to 2011, VIIRS from 2012) and harmonized
   totals, total detections, held-out R2, bias, step ratios, FRP at P=0.5,
   fit source; and its not-fitted list against params_global "failed".
2. The app's own data layer (web/src/lib/queries.ts, run under Node against a
   local range-request server) against Parquet totals computed here with
   Polars, for a sample of countries (original four, large and small fits,
   pooled fits, one too sparse to fit). The raw-only country must come back
   with no harmonized series.
3. Optional, --screen FILE: numbers scraped from the rendered pages by the
   Playwright run (Method and Data table cells, Explorer CSV and matrix)
   against the same files.

Usage: python3 scripts/check_app_numbers.py [--screen screen.json] [Country ...]
Exit code 0 when every check passes.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "public"
DATA = WEB / "data"
DEFAULT_SAMPLE = ["Portugal", "Chile", "Australia", "Canada", "Brazil", "Indonesia",
                  "Democratic_Republic_of_the_Congo", "Lao_PDR", "Sweden", "Iceland"]

failures: list[str] = []
passes = 0


def check(ok: bool, what: str) -> None:
    global passes
    if ok:
        passes += 1
    else:
        failures.append(what)


def close(a: float | None, b: float | None, tol: float = 1e-6) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= tol * max(1.0, abs(a), abs(b))


class RangeHandler(SimpleHTTPRequestHandler):
    """Static files with HTTP Range support (the app's world files are read by range)."""

    def log_message(self, *args):  # quiet
        pass

    def send_head(self):
        rng = self.headers.get("Range")
        path = Path(self.translate_path(self.path))
        if not rng or not path.is_file():
            return super().send_head()
        size = path.stat().st_size
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        a, b = m.group(1), m.group(2)
        start, end = (size - int(b), size - 1) if a == "" else (int(a), int(b) if b else size - 1)
        start, end = max(0, start), min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self.wfile.write(f.read(end - start + 1))
        f.close()
        return None


def splice_years(raw: pl.DataFrame, harm: pl.DataFrame, name: str) -> tuple[dict, dict]:
    r = raw.filter(pl.col("key") == name)
    rr = (r.filter(((pl.col("year") < 2012) & (pl.col("sensor") == "MODIS")) | ((pl.col("year") >= 2012) & (pl.col("sensor") == "VIIRS")))
          .group_by("year").agg(pl.col("n_detections").sum()))
    hh = harm.filter(pl.col("key") == name).group_by("year").agg(pl.col("n_harmonized").sum())
    return ({int(y): float(v) for y, v in rr.iter_rows()}, {int(y): float(v) for y, v in hh.iter_rows()})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--screen", type=Path)
    ap.add_argument("countries", nargs="*")
    args = ap.parse_args()
    sample = args.countries or DEFAULT_SAMPLE

    params = json.loads((DATA / "params_global.json").read_text())
    table = json.loads((DATA / "countries.json").read_text())
    season = json.loads((DATA / "season.json").read_text())
    raw = pl.read_parquet(DATA / "calendar_raw_global.parquet").filter(pl.col("scope") == "country")
    harm = pl.read_parquet(DATA / "calendar_harmonized_global.parquet").filter(pl.col("scope") == "country")

    # 1. countries.json against calendars + params
    check(table["fit_version"] == params["fit_version"], "countries.json fit_version != params_global")
    rows = {r["country"]: r for r in table["countries"]}
    check(set(rows) == set(params["countries"]), "countries.json countries != params_global countries")
    check({n["country"] for n in table.get("not_fitted", [])} == set(params.get("failed", {})), "not_fitted != params_global failed")
    check(set(season["countries"]) == set(params["countries"]), "season.json countries != fitted countries")
    for name, fit in params["countries"].items():
        row = rows.get(name)
        if row is None:
            continue
        ry, hy = splice_years(raw, harm, name)
        for a in row["annual"]:
            check(close(a["raw"], ry.get(a["year"], 0.0), 1e-9), f"{name} {a['year']} raw {a['raw']} != calendar {ry.get(a['year'])}")
            check(abs(a["harm"] - hy.get(a["year"], 0.0)) <= 0.051, f"{name} {a['year']} harm {a['harm']} != calendar {hy.get(a['year'])}")
        check(row["detections_filtered"] == int(raw.filter(pl.col("key") == name)["n_detections"].sum()), f"{name} detections_filtered")
        t = fit["validation_test"]
        for k, v in (("r2_model", t["model"]["r2"]), ("r2_raw", t["raw_viirs"]["r2"]), ("bias_pct", t["model"]["bias_pct"]),
                     ("step_raw", fit["null_control"]["spliced_raw_step_ratio_2012"]), ("step_harm", fit["null_control"]["harmonized_step_ratio_2012"]),
                     ("step_aqua", fit["null_control"]["aqua_only_step_ratio_2012"]), ("frp_p50", fit["frp_at_p50_mw"])):
            check(close(row[k], v), f"{name} {k} {row[k]} != params {v}")
        check(row["fit_source"] == fit.get("fit_source", "own"), f"{name} fit_source")
        check(row.get("season_resolution") == season["countries"][name].get("resolution"), f"{name} season resolution")

    # 2. the app's data layer under Node, against Polars
    handler = partial(RangeHandler, directory=str(WEB))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/data"
    out = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", str(ROOT / "web" / "scripts" / "dump-calendar.ts"), base, *sample],
                         capture_output=True, text=True, cwd=ROOT / "web")
    srv.shutdown()
    if out.returncode != 0:
        failures.append(f"node data layer failed: {out.stderr[-500:]}")
    else:
        app = json.loads(out.stdout)
        check(app["dataset"] == "world", f"app loaded {app['dataset']} files, not world")
        check(app["fit_version"] == params["fit_version"], "app fit_version")
        for name in sample:
            got = app["countries"][name]
            ry, hy = splice_years(raw, harm, name)
            for y, v in got["raw"]["years"].items():
                check(close(v, ry.get(int(y)) if int(y) in ry else None, 1e-9), f"app {name} raw {y}: {v} != {ry.get(int(y))}")
            if name in params["countries"]:
                check(got["harmonized"]["keys"] == [name], f"app {name}: harmonized keys {got['harmonized']['keys']}")
                for y, v in got["harmonized"]["years"].items():
                    if v is None:
                        continue
                    check(abs(v - hy.get(int(y), 0.0)) < 1e-6, f"app {name} harmonized {y}: {v} != {hy.get(int(y), 0.0)}")
            else:
                check(got["harmonized"]["keys"] == [] and got["harmonized"]["uncorrected"] == [name],
                      f"app {name} (not fitted) must have no harmonized series: {got['harmonized']['keys']}")
                check(all(v is None for v in got["harmonized"]["years"].values()), f"app {name}: harmonized values present")
        print(f"data layer: {len(sample)} countries checked ({', '.join(sample)})")

    # 3. what the pages rendered
    if args.screen:
        screen = json.loads(args.screen.read_text())
        num = lambda s: None if s.strip() in ("—", "") else float(s.replace("−", "-").replace(",", "").replace("×", "").replace("%", "").replace("+", ""))
        pretty = {re.sub("_", " ", k): k for k in params["countries"]}
        pretty.update({"Côte d’Ivoire": "Cote_d_Ivoire", "Dem. Rep. Korea": "Dem_Rep_Korea", "Macedonia (former Yugoslav Rep.)": "Macedonia_Former_Yugoslav_Republic_of"})
        for r in screen.get("method_rows", []):
            key = pretty.get(r["country"].replace("pooled", "").strip())
            check(key is not None, f"method row country not in params: {r['country']}")
            if key is None:
                continue
            t = params["countries"][key]["validation_test"]
            r2 = t["model"]["r2"]
            check(abs(num(r["r2"]) - r2) <= (0.05 if abs(r2) >= 1 else 0.005), f"method {key} R2 {r['r2']} vs {r2}")
            check(abs(num(r["bias"]) - t["model"]["bias_pct"]) <= 0.05, f"method {key} bias {r['bias']} vs {t['model']['bias_pct']}")
            check(num(r["n"]) == t["model"]["n_cell_months"], f"method {key} cell-months {r['n']}")
        for r in screen.get("data_rows", []):
            key = pretty.get(r["country"].replace("pooled", "").strip())
            if key is None:
                failures.append(f"data row country not in params: {r['country']}")
                continue
            row = rows[key]
            check(abs(num(r["harm_mean"]) - row["harm_mean_2003_2025"]) <= 0.5, f"data {key} mean {r['harm_mean']}")
            check(abs(num(r["raw_2025"]) - row["raw_2025"]) <= 0.5, f"data {key} raw 2025 {r['raw_2025']}")
            check(abs(num(r["r2"]) - row["r2_model"]) <= (0.05 if abs(row["r2_model"]) >= 1 else 0.005), f"data {key} R2 {r['r2']}")
        for e in screen.get("explorer", []):
            key, mode = e["country"], e["mode"]
            col = "n_detections" if mode == "raw" else "n_harmonized"
            if mode == "raw":
                src = raw.filter((pl.col("key") == key) & (((pl.col("year") < 2012) & (pl.col("sensor") == "MODIS")) | ((pl.col("year") >= 2012) & (pl.col("sensor") == "VIIRS"))))
            else:
                src = harm.filter(pl.col("key") == key)
            exp = {(int(y), int(m)): float(v) for y, m, v in src.group_by("year", "month").agg(pl.col(col).sum()).iter_rows()}
            lines = [l for l in e["csv"].splitlines() if l and not l.startswith("#")][1:]
            csv = {(int(a), int(b)): (None if c == "" else float(c)) for a, b, c, *_ in (l.split(",") for l in lines)}
            for (y, m), v in csv.items():
                want = exp.get((y, m), 0.0 if mode == "harmonized" else None)
                check(v is not None and want is not None and abs(v - round(want, 2)) < 0.006 or (v is None and want is None),
                      f"explorer CSV {key} {mode} {y}-{m}: {v} vs {want}")
            for cell, text in e.get("matrix", {}).items():
                y, m = map(int, cell.split("-"))
                v = csv.get((y, m))
                shown = None if text in ("—", "", "no data") else float(text.replace(",", ""))
                check((shown is None and v is None) or (shown is not None and v is not None and abs(shown - round(v)) <= 0.5),
                      f"explorer matrix {key} {mode} {cell}: screen {text} vs CSV {v}")
        print(f"screen: {len(screen.get('method_rows', []))} method rows, {len(screen.get('data_rows', []))} data rows, "
              f"{len(screen.get('explorer', []))} explorer exports checked")

    print(f"{passes} checks passed, {len(failures)} failed")
    for f in failures[:40]:
        print("FAIL", f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
