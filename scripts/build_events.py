#!/usr/bin/env python3
"""Build web/public/data/events.json: the "known fire disasters" test.

Question: does each record put the fire seasons everyone remembers near the top
of its own history?

The event list below was fixed before any result was computed. Two groups:
  recent  widely documented extreme seasons in the VIIRS era (2012 onward)
  early   widely documented extreme seasons in the MODIS era (to 2011) -- the
          fair contrast, because a raw splice inflates every year from 2012 on
          and can push an old disaster below ordinary recent years.

For each event: the window total (sum of monthly counts over the event's
calendar window) is ranked against the same calendar window in every year of the
pool. Rank 1 = the largest window total. The pool is every window that starts in
2003-2025 and ends by the last month of data (December 2025); windows that cross
a year boundary (Australia's Sep-Feb) are labelled by their start year, and the
pool starts in 2002 for those so the 2002-03 season can be ranked (the
harmonized record begins July 2002).

Two records, both from the published monthly country tables:
  harmonized  calendar_harmonized_global.parquet n_harmonized
  raw splice  calendar_raw_global.parquet n_detections, MODIS (Terra + Aqua)
              to 2011 then VIIRS (Suomi-NPP) from 2012 -- the same definition
              as build_hero.py and build_proof.py. Months with no row count 0.

Reference links are kept here, not in the UI.

Usage: python3 scripts/build_events.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
OUT = DATA / "events.json"
FIRST, LAST = 2003, 2025
LAST_DATA = (2025, 12)

# (group, label, parquet key, start year, start month, number of months, reference)
EVENTS = [
    ("recent", "Australia Black Summer", "Australia", 2019, 9, 6,
     "https://en.wikipedia.org/wiki/2019%E2%80%9320_Australian_bushfire_season"),
    ("recent", "Canada record season", "Canada", 2023, 5, 5,
     "https://en.wikipedia.org/wiki/2023_Canadian_wildfires"),
    ("recent", "Portugal fires", "Portugal", 2017, 6, 5,
     "https://en.wikipedia.org/wiki/2017_Portugal_wildfires"),
    ("recent", "Brazil Amazon fires", "Brazil", 2019, 8, 2,
     "https://en.wikipedia.org/wiki/2019_Amazon_rainforest_wildfires"),
    ("recent", "Western US fires", "United_States", 2020, 8, 3,
     "https://en.wikipedia.org/wiki/2020_Western_United_States_wildfire_season"),
    ("recent", "Greece fires", "Greece", 2021, 7, 2,
     "https://en.wikipedia.org/wiki/2021_Greece_wildfires"),
    ("early", "Australia 2002-03 season", "Australia", 2002, 9, 6,
     "https://en.wikipedia.org/wiki/2003_Canberra_bushfires"),
    ("early", "Russia 2003 (Siberia)", "Russian_Federation", 2003, 4, 5,
     "https://earthobservatory.nasa.gov/images/3501/fires-in-siberia"),
    ("early", "Russia 2010 heat-wave fires", "Russian_Federation", 2010, 7, 2,
     "https://en.wikipedia.org/wiki/2010_Russian_wildfires"),
    ("early", "Portugal 2003", "Portugal", 2003, 6, 5,
     "https://en.wikipedia.org/wiki/2003_Portugal_forest_fires"),
    ("early", "Portugal 2005", "Portugal", 2005, 6, 5,
     "https://effis.jrc.ec.europa.eu/reports-and-publications/annual-fire-reports"),
    ("early", "Indonesia 2006 haze", "Indonesia", 2006, 8, 3,
     "https://en.wikipedia.org/wiki/2006_Southeast_Asian_haze"),
    ("early", "Greece 2007", "Greece", 2007, 7, 2,
     "https://en.wikipedia.org/wiki/2007_Greek_forest_fires"),
]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def monthly() -> dict[str, dict[tuple[str, int, int], float]]:
    keys = sorted({e[2] for e in EVENTS})
    raw = (pl.read_parquet(DATA / "calendar_raw_global.parquet")
           .filter((pl.col("scope") == "country") & pl.col("key").is_in(keys))
           .group_by("key", "year", "month", "sensor").agg(pl.col("n_detections").sum()))
    harm = (pl.read_parquet(DATA / "calendar_harmonized_global.parquet")
            .filter((pl.col("scope") == "country") & pl.col("key").is_in(keys)))
    splice: dict[tuple[str, int, int], float] = {}
    for k, y, m, s, n in raw.iter_rows():
        if (s == "MODIS" and y <= 2011) or (s == "VIIRS" and y >= 2012):
            splice[(k, int(y), int(m))] = splice.get((k, int(y), int(m)), 0.0) + float(n)
    h = {(k, int(y), int(m)): float(n) for _, k, y, m, n in harm.iter_rows()}
    return {"harmonized": h, "raw_splice": splice}


def window(series: dict, key: str, year: int, month: int, n: int) -> float:
    tot = 0.0
    for i in range(n):
        y, m = year + (month - 1 + i) // 12, (month - 1 + i) % 12 + 1
        tot += series.get((key, y, m), 0.0)
    return tot


def ends_in_data(year: int, month: int, n: int) -> bool:
    end = (year * 12 + month - 1 + n - 1)
    return end <= LAST_DATA[0] * 12 + LAST_DATA[1] - 1


def label_window(year: int, month: int, n: int) -> str:
    end = month - 1 + n - 1
    ey, em = year + end // 12, end % 12 + 1
    return f"{MONTHS[month - 1]} {year} - {MONTHS[em - 1]} {ey}" if ey != year else f"{MONTHS[month - 1]}-{MONTHS[em - 1]} {year}"


def main() -> None:
    series = monthly()
    rows = []
    for group, label, key, y0, m0, n, _ref in EVENTS:
        crosses = m0 - 1 + n > 12
        start = 2002 if crosses else FIRST
        pool_years = [y for y in range(start, LAST + 1) if ends_in_data(y, m0, n)]
        row = {"group": group, "event": label, "country": key.replace("_", " "), "window": label_window(y0, m0, n),
               "year": y0, "pool_years": [pool_years[0], pool_years[-1]], "pool_size": len(pool_years)}
        for name, s in series.items():
            tot = {y: window(s, key, y, m0, n) for y in pool_years}
            if not any(tot.values()):
                row[name] = None
                continue
            ev = tot[y0]
            rank = 1 + sum(1 for y in pool_years if tot[y] > ev)
            above = sorted(y for y in pool_years if tot[y] > ev)
            row[name] = {"rank": rank, "total": round(ev, 1), "years_above": above,
                         "recent_years_above": [y for y in above if y >= 2012]}
        rows.append(row)

    def med(group: str, name: str) -> float | None:
        v = [r[name]["rank"] for r in rows if r["group"] == group and r[name]]
        return median(v) if v else None

    def top(group: str, name: str, k: int) -> int:
        return sum(1 for r in rows if r["group"] == group and r[name] and r[name]["rank"] <= k)

    summary = {g: {"n": sum(1 for r in rows if r["group"] == g),
                   **{f"median_rank_{nm}": med(g, nm) for nm in series},
                   **{f"top3_{nm}": top(g, nm, 3) for nm in series}} for g in ("recent", "early")}
    out = {
        "fit_version": json.loads((DATA / "params_global.json").read_text())["fit_version"],
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "definition": ("Each event's window total (sum of monthly detections over the listed months) is ranked against the same "
                       "calendar window in every year of the pool; rank 1 = largest. Pool: windows starting 2003-2025 and ending by "
                       "Dec 2025 (from 2002 for windows that cross New Year). harmonized = calendar_harmonized_global; raw_splice = "
                       "MODIS (Terra+Aqua) to 2011 then VIIRS (Suomi-NPP) from 2012. Event list fixed before results were computed."),
        "events": rows,
        "summary": summary,
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    for r in rows:
        h, s = r["harmonized"], r["raw_splice"]
        print(f"{r['group']:6} {r['event']:30} {r['window']:22} pool={r['pool_size']:2}  harm={h and h['rank']}  raw={s and s['rank']}  "
              f"raw-recent-above={s and s['recent_years_above']}  harm-recent-above={h and h['recent_years_above']}")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
