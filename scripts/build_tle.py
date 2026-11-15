#!/usr/bin/env python3
"""Two-line orbital elements for the five fire satellites -> web/public/data/tle.json.

Keyless. Reads CelesTrak public TLEs through the tle.ivanstanojevic.me mirror
(one JSON object per NORAD id). The app propagates these in the browser for the
satellite view; nothing here feeds the harmonization.

If any satellite cannot be fetched the existing file is left untouched, so a
transient outage never ships a partial fleet.

Usage: python3 scripts/build_tle.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "tle.json"
API = "https://tle.ivanstanojevic.me/api/tle"
SOURCE = "tle.ivanstanojevic.me (mirror of CelesTrak public TLEs)"

FLEET = [
    ("Terra", 25994, "MODIS", "~10:30 descending, drifting earlier since 2022"),
    ("Aqua", 27424, "MODIS", "~13:30 ascending, drifting later since 2022"),
    ("Suomi-NPP", 37849, "VIIRS", "~13:30 ascending, stable"),
    ("NOAA-20", 43013, "VIIRS", "~13:30 ascending, stable"),
    ("NOAA-21", 54234, "VIIRS", "~13:30 ascending, stable"),
]


def fetch(norad: int) -> dict:
    last = ""
    for attempt in range(4):
        r = subprocess.run(["curl", "-sS", "--fail", "--connect-timeout", "10", "-m", "60", f"{API}/{norad}"],
                           capture_output=True, text=True)
        if r.returncode == 0:
            try:
                d = json.loads(r.stdout)
                if d.get("line1", "").startswith("1 ") and d.get("line2", "").startswith("2 "):
                    return d
                last = "response without TLE lines"
            except json.JSONDecodeError as e:
                last = f"bad JSON: {e}"
        else:
            last = r.stderr.strip()
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"NORAD {norad}: {last}")


def main() -> int:
    sats = []
    try:
        for name, norad, instrument, overpass in FLEET:
            d = fetch(norad)
            sats.append(dict(name=name, norad=norad, instrument=instrument, overpass=overpass,
                             epoch=d.get("date"), line1=d["line1"], line2=d["line2"]))
    except RuntimeError as e:
        print(f"TLE fetch failed, keeping existing {OUT.name}: {e}", file=sys.stderr)
        return 1
    out = dict(source=SOURCE, fetched=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), satellites=sats)
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT} ({len(sats)} satellites)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
