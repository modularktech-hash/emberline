#!/usr/bin/env python3
"""G6b: NASA EONET open wildfire events -> web/public/data/eonet.json.

EONET (Earth Observatory Natural Event Tracker) lists curated natural events;
it is a different source from the FIRMS detections. Keyless:
  https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open
Each event keeps its most recent point geometry.

Usage: python3 scripts/build_eonet.py
"""
from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data" / "eonet.json"
URL = "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open"


def fetch() -> dict:
    for attempt in range(6):
        r = subprocess.run(["curl", "-sS", "--connect-timeout", "10", "-m", "120", URL], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.lstrip().startswith("{"):
            return json.loads(r.stdout)
        time.sleep(3 + 3 * attempt)
    raise SystemExit(f"EONET request failed: {r.stderr[:200]}")


def main() -> None:
    d = fetch()
    events = []
    for e in d.get("events", []):
        pts = [g for g in e.get("geometry", []) if g.get("type") == "Point"]
        if not pts:
            continue
        g = max(pts, key=lambda g: g.get("date") or "")
        lon, lat = g["coordinates"][:2]
        events.append({
            "id": e["id"], "title": e.get("title"), "date": g.get("date"),
            "lat": round(lat, 4), "lon": round(lon, 4),
            "magnitude": g.get("magnitudeValue"), "magnitude_unit": g.get("magnitudeUnit"),
            "source": next((s.get("url") for s in e.get("sources", []) if s.get("url")), None),
        })
    events.sort(key=lambda e: e["date"] or "", reverse=True)
    dates = [e["date"] for e in events if e["date"]]
    out = {
        "fetched_utc": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()),
        "source": URL,
        "label": "NASA EONET curated events — a different source from the FIRMS detections",
        "definition": "open EONET events in the Wildfires category; each at its most recent reported point. Event page: https://eonet.gsfc.nasa.gov/api/v3/events/<id>",
        "n_events": len(events),
        "date_range": [min(dates), max(dates)] if dates else None,
        "events": events,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(events)} events, {OUT.stat().st_size / 1e6:.2f} MB, dates {out['date_range']}")


if __name__ == "__main__":
    main()
