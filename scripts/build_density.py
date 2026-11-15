#!/usr/bin/env python3
"""G6c: approximate fire density per area, added to web/public/data/countries.json.

For each fitted country:
  land_area_km2              geodesic area of its Natural Earth 1:110m outline
                             (web/public/geo/countries.geojson), WGS84 ellipsoid,
                             pyproj.Geod.geometry_area_perimeter. 1:110m outlines are
                             coarse, so areas are approximate.
  harm_per_10k_km2_yr        harm_mean_2003_2025 / land_area_km2 * 10,000
                             (harmonized Aqua-MODIS-equivalent detections per
                             10,000 km2 per year, 2003-2025 mean). Approximate.
Names are joined through an explicit FIRMS -> Natural Earth table (NE_NAME below,
the same table as web/src/lib/hotspots.ts); anything else must match after
underscores become spaces. Unmatched countries get null, and are listed.

Only these two fields are added or replaced; everything else in countries.json is
left byte-for-byte as it was parsed (values unchanged).

Usage: python3 scripts/build_density.py
"""
from __future__ import annotations

import json
from pathlib import Path

from pyproj import Geod
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
GEO = ROOT / "web" / "public" / "geo" / "countries.geojson"

NE_NAME = {
    "Democratic_Republic_of_the_Congo": "Dem. Rep. Congo", "Russian_Federation": "Russia", "South_Sudan": "S. Sudan",
    "Central_African_Republic": "Central African Rep.", "United_States": "United States of America", "Lao_PDR": "Laos",
    "Cote_d_Ivoire": "Côte d'Ivoire", "Republic_of_Congo": "Congo", "Dominican_Republic": "Dominican Rep.", "Dem_Rep_Korea": "North Korea",
    "The_Gambia": "Gambia", "Bosnia_and_Herzegovina": "Bosnia and Herz.", "Macedonia_Former_Yugoslav_Republic_of": "Macedonia",
    "Republic_of_Korea": "South Korea", "Equatorial_Guinea": "Eq. Guinea", "Czech_Republic": "Czechia", "Solomon_Islands": "Solomon Is.",
    "Brunei_Darussalam": "Brunei", "Falkland_Islands": "Falkland Is.", "Western_Sahara": "W. Sahara", "Eswatini": "Swaziland",
}

AREA_NOTE = ("geodesic area (WGS84, pyproj) of the Natural Earth 1:110m outline in web/public/geo/countries.geojson; "
             "coarse outlines, so approximate; an outline can include overseas parts (e.g. France includes French Guiana), while FIRMS assigns detections by its own country boundaries")
DENSITY_NOTE = "harm_mean_2003_2025 / land_area_km2 x 10,000: harmonized detections per 10,000 km2 per year, 2003-2025 mean; approximate"


def main() -> None:
    geod = Geod(ellps="WGS84")
    areas = {}
    for f in json.loads(GEO.read_text())["features"]:
        a, _ = geod.geometry_area_perimeter(shape(f["geometry"]))
        areas[f["properties"]["NAME"]] = abs(a) / 1e6
    path = DATA / "countries.json"
    table = json.loads(path.read_text())
    unmatched = []
    for row in table["countries"]:
        name = NE_NAME.get(row["country"], row["country"].replace("_", " "))
        area = areas.get(name)
        if area is None:
            unmatched.append(row["country"])
            row["land_area_km2"] = None
            row["harm_per_10k_km2_yr"] = None
            continue
        row["land_area_km2"] = round(area, 0)
        mean = row.get("harm_mean_2003_2025")
        row["harm_per_10k_km2_yr"] = None if mean is None else round(mean / area * 1e4, 3)
    table["land_area_note"] = AREA_NOTE
    table["density_note"] = DENSITY_NOTE
    path.write_text(json.dumps(table, separators=(",", ":")))
    n = len(table["countries"])
    print(f"{n - len(unmatched)} of {n} fitted countries matched; unmatched (null): {', '.join(unmatched) or 'none'}")
    top = sorted((r for r in table["countries"] if r["harm_per_10k_km2_yr"] is not None), key=lambda r: -r["harm_per_10k_km2_yr"])[:3]
    print("highest density:", [(r["country"], r["harm_per_10k_km2_yr"]) for r in top])
    canada = next((r for r in table["countries"] if r["country"] == "Canada"), None)
    if canada:
        print("Canada area km2", canada["land_area_km2"], "(sanity: Natural Earth 1:110m, approximate)")


if __name__ == "__main__":
    main()
