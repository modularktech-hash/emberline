"""Canonical detection schema and per-product column mappings.

Every FIRMS product ships slightly different column names, units and
encodings.  Downstream code should never branch on the product it came
from, so every reader normalizes into the single frame described here.

Canonical columns
-----------------
lat, lon            float64  WGS84 centroid of the detection footprint
acq_ts              datetime UTC acquisition timestamp
sensor              str      "MODIS" | "VIIRS"
platform            str      "Terra" | "Aqua" | "Suomi-NPP" | "NOAA-20" | "NOAA-21"
frp_mw              float64  Fire Radiative Power, megawatts
brightness_k        float64  fire channel brightness temperature, kelvin
                             (MODIS band 21/22, VIIRS I-4)
bright_bg_k         float64  background channel brightness temperature, kelvin
                             (MODIS band 31, VIIRS I-5)
scan_km, track_km   float64  along-scan / along-track footprint dimensions
pixel_area_km2      float64  derived footprint area
frp_density_mw_km2  float64  derived frp_mw / pixel_area_km2
daynight            str      "D" | "N"
confidence_raw      str      product-native confidence, verbatim
confidence_class    str      "low" | "nominal" | "high"  (see confidence.py)
source_type         int      FIRMS type field (see SOURCE_TYPES)

`frp_density_mw_km2` exists because MODIS and VIIRS footprints differ by
roughly an order of magnitude in area.  Comparing raw per-pixel FRP across
sensors compares different amounts of ground; comparing FRP per unit area
does not.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import polars as pl

SENSOR_MODIS = "MODIS"
SENSOR_VIIRS = "VIIRS"

#: FIRMS `type` field. Only 0 is a vegetation fire; the rest are persistent
#: heat sources that would otherwise appear as permanent fires in the record.
SOURCE_TYPES: dict[int, str] = {
    0: "vegetation_fire",
    1: "active_volcano",
    2: "other_static_land_source",
    3: "offshore",
}

VEGETATION_FIRE = 0

CANONICAL_SCHEMA: dict[str, pl.DataType] = {
    "lat": pl.Float64,
    "lon": pl.Float64,
    "acq_ts": pl.Datetime(time_unit="us", time_zone="UTC"),
    "sensor": pl.Utf8,
    "platform": pl.Utf8,
    "frp_mw": pl.Float64,
    "brightness_k": pl.Float64,
    "bright_bg_k": pl.Float64,
    "scan_km": pl.Float64,
    "track_km": pl.Float64,
    "pixel_area_km2": pl.Float64,
    "frp_density_mw_km2": pl.Float64,
    "daynight": pl.Utf8,
    "confidence_raw": pl.Utf8,
    "confidence_class": pl.Utf8,
    "source_type": pl.Int8,
}

CANONICAL_COLUMNS: tuple[str, ...] = tuple(CANONICAL_SCHEMA)

#: Platform codes vary between the archive CSVs and the NRT API for the same
#: satellite, so both spellings map to one canonical name.
PLATFORM_ALIASES: dict[str, str] = {
    "T": "Terra",
    "TERRA": "Terra",
    "MOD": "Terra",
    "A": "Aqua",
    "AQUA": "Aqua",
    "MYD": "Aqua",
    "N": "Suomi-NPP",
    "NPP": "Suomi-NPP",
    "SNPP": "Suomi-NPP",
    "SUOMI NPP": "Suomi-NPP",
    "SUOMI-NPP": "Suomi-NPP",
    "VNP": "Suomi-NPP",
    "1": "NOAA-20",
    "N20": "NOAA-20",
    "NOAA-20": "NOAA-20",
    "NOAA 20": "NOAA-20",
    "J1": "NOAA-20",
    "JP1": "NOAA-20",
    "VJ1": "NOAA-20",
    "2": "NOAA-21",
    "N21": "NOAA-21",
    "NOAA-21": "NOAA-21",
    "J2": "NOAA-21",
    "JP2": "NOAA-21",
    "VJ2": "NOAA-21",
}

#: Nominal local overpass time (decimal hours) of each platform's daytime pass.
#: Aqua and Suomi-NPP share ~13:30, which is why that pair carries the
#: harmonization: the fire diurnal cycle is held roughly constant between them.
OVERPASS_LOCAL_HOUR: dict[str, float] = {
    "Terra": 10.5,
    "Aqua": 13.5,
    "Suomi-NPP": 13.5,
    "NOAA-20": 13.5,
    "NOAA-21": 13.5,
}


@dataclass(frozen=True)
class ProductSpec:
    """How one FIRMS product's raw CSV maps onto the canonical schema."""

    name: str
    sensor: str
    #: raw column name -> canonical column name
    columns: dict[str, str]
    #: canonical column -> literal value, for products where a field is implied
    constants: dict[str, object] = field(default_factory=dict)
    #: nominal nadir footprint area, used when scan/track are absent
    nominal_pixel_area_km2: float = 1.0
    description: str = ""

    def rename_map(self, present: list[str]) -> dict[str, str]:
        """Restrict the column map to the columns actually present in a file."""
        return {raw: canon for raw, canon in self.columns.items() if raw in present}


_MODIS_COLUMNS = {
    "latitude": "lat",
    "longitude": "lon",
    "brightness": "brightness_k",
    "bright_t31": "bright_bg_k",
    "scan": "scan_km",
    "track": "track_km",
    "frp": "frp_mw",
    "confidence": "confidence_raw",
    "daynight": "daynight",
    "satellite": "platform",
    "type": "source_type",
}

_VIIRS_COLUMNS = {
    "latitude": "lat",
    "longitude": "lon",
    "bright_ti4": "brightness_k",
    "bright_ti5": "bright_bg_k",
    "scan": "scan_km",
    "track": "track_km",
    "frp": "frp_mw",
    "confidence": "confidence_raw",
    "daynight": "daynight",
    "satellite": "platform",
    "type": "source_type",
}

PRODUCTS: dict[str, ProductSpec] = {
    "MCD14ML": ProductSpec(
        name="MCD14ML",
        sensor=SENSOR_MODIS,
        columns=_MODIS_COLUMNS,
        nominal_pixel_area_km2=1.0,
        description="MODIS Collection 6.1 monthly active fire, Terra + Aqua, 1 km",
    ),
    "VNP14IMGML": ProductSpec(
        name="VNP14IMGML",
        sensor=SENSOR_VIIRS,
        columns=_VIIRS_COLUMNS,
        constants={"platform": "Suomi-NPP"},
        nominal_pixel_area_km2=0.140625,  # 375 m x 375 m
        description="VIIRS 375 m monthly active fire, Suomi-NPP",
    ),
    "VJ114IMGML": ProductSpec(
        name="VJ114IMGML",
        sensor=SENSOR_VIIRS,
        columns=_VIIRS_COLUMNS,
        constants={"platform": "NOAA-20"},
        nominal_pixel_area_km2=0.140625,
        description="VIIRS 375 m monthly active fire, NOAA-20",
    ),
    "VJ214IMGML": ProductSpec(
        name="VJ214IMGML",
        sensor=SENSOR_VIIRS,
        columns=_VIIRS_COLUMNS,
        constants={"platform": "NOAA-21"},
        nominal_pixel_area_km2=0.140625,
        description="VIIRS 375 m monthly active fire, NOAA-21",
    ),
}


def product(name: str) -> ProductSpec:
    """Look up a product spec by name, case-insensitively."""
    key = name.strip().upper()
    if key not in PRODUCTS:
        known = ", ".join(sorted(PRODUCTS))
        raise KeyError(f"unknown FIRMS product {name!r}; known products: {known}")
    return PRODUCTS[key]


def empty_frame() -> pl.DataFrame:
    """An empty frame carrying the canonical schema.

    Useful as a concat target so that a month with no detections still has
    the right columns and dtypes.
    """
    return pl.DataFrame(schema=CANONICAL_SCHEMA)
