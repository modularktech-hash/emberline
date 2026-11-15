#!/usr/bin/env python3
"""Check web/public/data/season.json for incomplete fire years and date handling.

Asserts:
* every fire year whose window runs past 31 Dec 2025 or starts before a
  series has data (raw 2001-01-01, harmonized = Aqua 2002-07-04) has null
  values for that series and is listed in its "partial" field, and no
  complete fire year is marked partial;
* published trends use only complete years (recomputed from the rows);
* onset <= peak <= end and every day number fits its fire year's length
  (365, or 366 when the window contains 29 February);
* the builder's labelling (build_insights.fire_year_of) and window
  (build_insights.fire_year_window) agree for every day 2001-2025 and every
  start month, including leap days.
Reports the daily / monthly resolution split.

Usage: python3 scripts/check_seasons.py
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SEASON = ROOT / "web" / "public" / "data" / "season.json"
FROM = {"raw": dt.date(2001, 1, 1), "harm": dt.date(2002, 7, 4)}
END = dt.date(2025, 12, 31)
FIELDS = ("onset", "peak", "end", "length", "total")


def window(fy: int, start: int) -> tuple[dt.date, dt.date]:
    """Independent re-statement of the label rule: start 1 -> calendar year;
    2-6 -> labelled by the start year; 7-12 -> labelled by the end year."""
    y0 = fy if start == 1 else (fy - 1 if start > 6 else fy)
    first = dt.date(y0, start, 1)
    return first, dt.date(y0 + 1, start, 1) - dt.timedelta(days=1)


def trend(years, values):
    pts = [(y, v) for y, v in zip(years, values) if v is not None]
    if len(pts) < 8:
        return None
    return float(np.polyfit([p[0] for p in pts], [p[1] for p in pts], 1)[0] * 10)


def check_builder_labels(fails: list[str]) -> int:
    spec = importlib.util.spec_from_file_location("build_insights", ROOT / "scripts" / "build_insights.py")
    bi = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bi)  # module code only defines things; main() is not run
    n = 0
    for start in range(1, 13):
        d = dt.date(2001, 1, 1)
        while d <= END:
            fy = bi.fire_year_of(d.year, d.month, start)
            first, last = bi.fire_year_window(fy, start)
            first, last = first.astype(dt.date), last.astype(dt.date)
            if (first, last) != window(fy, start):
                fails.append(f"builder window differs: start {start} fy {fy}")
            length = (last - first).days + 1
            idx = (d - first).days  # the builder's day index (abs_day - start_day)
            if not (first <= d <= last and 0 <= idx < length and length in (365, 366)):
                fails.append(f"{d} start {start}: fy {fy} window {first}..{last} index {idx}")
            if length == 366 and not any(dt.date(y, 2, 29) >= first and dt.date(y, 2, 29) <= last
                                         for y in (first.year, last.year) if y % 4 == 0):
                fails.append(f"366-day window without 29 Feb: {first}..{last}")
            n += 1
            d += dt.timedelta(days=1)
    return n


def main() -> int:
    s = json.loads(SEASON.read_text())
    fails: list[str] = []
    res = Counter(v["resolution"] for v in s["countries"].values())
    n_partial = Counter()
    for name, v in s["countries"].items():
        start = v["fire_year_start_month"]
        for r in v["years"]:
            first, last = window(r["year"], start)
            should = [k for k in ("raw", "harm") if first < FROM[k] or last > END]
            listed = r.get("partial", [])
            if sorted(listed) != sorted(should):
                fails.append(f"{name} {r['year']}: partial {listed}, expected {should} ({first}..{last})")
            for k in should:
                n_partial[(v["resolution"], k)] += 1
                if any(r.get(f"{k}_{f}") is not None for f in FIELDS):
                    fails.append(f"{name} {r['year']}: incomplete {k} season presented with values")
            length = (last - first).days + 1
            for k in ("raw", "harm"):
                on, pk, en = (r.get(f"{k}_{f}") for f in ("onset", "peak", "end"))
                if on is not None and not (1 <= on <= pk <= en <= length):
                    fails.append(f"{name} {r['year']} {k}: onset/peak/end {on}/{pk}/{en} outside 1..{length}")
        years = [r["year"] for r in v["years"]]
        for key, pub in v["trend_days_per_decade"].items():
            want = trend(years, [r.get(key) for r in v["years"]])
            if (want is None) != (pub is None) or (want is not None and abs(want - pub) > 1e-6):
                fails.append(f"{name} trend {key}: published {pub}, from complete years {want}")
    n_days = check_builder_labels(fails)
    print(f"resolution: {res.get('daily', 0)} daily, {res.get('monthly', 0)} monthly ({len(s['countries'])} countries)")
    print("incomplete fire-year series (resolution, series): count =", dict(sorted(n_partial.items())))
    print(f"label/window check: {n_days} day x start-month cases")
    if fails:
        print(f"FAIL ({len(fails)}):")
        for f in fails[:25]:
            print("  ", f)
        return 1
    print("OK: no incomplete fire year presented as complete; trends use complete years only; leap days handled")
    return 0


if __name__ == "__main__":
    sys.exit(main())
