# firms-ingest

Normalize NASA FIRMS active-fire detections across MODIS and VIIRS.

MODIS (1 km, from 2000) and VIIRS (375 m, from 2012) describe the same
phenomenon with different column names, different confidence encodings,
different footprint sizes and — critically — different sensitivities. This
package turns both into one canonical frame, removes the non-fire heat sources,
collapses duplicate observations into fire events, and aggregates onto a hex
grid.

It deliberately **stops short of harmonization itself**. Deciding *how* to
correct for the sensitivity difference is a scientific claim that belongs in an
analysis with its validation numbers attached. This is the plumbing underneath
it.

MIT licensed. Extracted from a NASA Space Apps project on fire record
harmonization, and useful on its own to anyone working with FIRMS archives.

## Install

```bash
pip install -e ".[all]"     # polars, numpy, scikit-learn, h3, httpx
pip install -e ".[dev]"     # the above plus pytest
```

Optional extras keep the base install light: `[cluster]` for event clustering,
`[grid]` for H3 aggregation, `[nrt]` for the near-real-time client.

## What it does

### One canonical schema

```python
from firms_ingest import read_archive

detections = read_archive("fire_archive_M-C61_2019.csv", "MCD14ML")
viirs      = read_archive("fire_archive_SV-C2_2019.csv", "VNP14IMGML")

import polars as pl
both = pl.concat([detections, viirs])   # same columns, same dtypes
```

Supported products: `MCD14ML`, `VNP14IMGML`, `VJ114IMGML`, `VJ214IMGML`.

Two details that are easy to get wrong and are handled here:

- `acq_time` is HHMM with the leading zero dropped when the file stores it as
  an integer, so `525` means 05:25. Zero-padding before parsing is what keeps
  early-morning overpasses out of the wrong hour.
- MODIS footprints grow from ~1 km at nadir to several km at the swath edge.
  The reported `scan`/`track` dimensions are used to derive `pixel_area_km2`
  and `frp_density_mw_km2`, so an off-nadir MODIS pixel is comparable to a
  nadir VIIRS one.

### Two incompatible confidence scales

MODIS reports 0–100. VIIRS reports low/nominal/high. There is no official
conversion. This package projects **both** onto the coarser three-class scale
using published FIRMS breakpoints (0–29 low, 30–79 nominal, 80–100 high), and
refuses to go the other way — inventing a 0–100 number for a VIIRS class would
manufacture precision the product does not carry.

```python
from firms_ingest import at_least
confident = detections.filter(at_least("nominal"))
```

### Non-fire heat sources

Both sensors detect anything hot: gas flares, volcanoes, industrial furnaces,
offshore platforms. Because they burn continuously they appear as cells that
are on fire every day for 25 years, and they dominate any long-run series of a
region that contains one. FIRMS labels them in the `type` field.

```python
from firms_ingest import standard_pipeline
clean = standard_pipeline(detections)   # vegetation fires, nominal+, daytime, FRP > 0
```

Each step is individually optional, so the effect of every filter can be
reported rather than hidden behind one opaque "cleaned" number.

### Detections to fire events

One fire burning for an afternoon is observed separately by Terra, Aqua,
Suomi-NPP and NOAA-20, and by several adjacent pixels within each overpass.
Counting raw detections counts satellites and pixels — and counts them
*differently* before and after 2012.

```python
from firms_ingest import assign_events, summarize_events

labelled = assign_events(clean, eps_km=1.5, eps_hours=12)
events   = summarize_events(labelled)
```

Coordinates are projected to 3D Cartesian kilometres on a sphere rather than
treated as a flat plane, so clustering does not distort near the poles or tear
at the antimeridian — both of which contain real fire activity. Time becomes a
fourth axis, rescaled so `eps_hours` costs the same as `eps_km`.

For continental runs, `partition_by=` clusters within coarse spatial blocks to
keep DBSCAN tractable; partition on a scale far larger than `eps_km`, since an
event straddling a boundary is split.

### Gridding and climatology

```python
from firms_ingest import aggregate_cell_day, day_of_year_climatology

cells = aggregate_cell_day(clean, resolution=4)       # cell x day x sensor
clim  = day_of_year_climatology(cells, smoothing_days=15)
```

Hexagons rather than a lat/lon grid because square cells shrink toward the
poles. The climatology window wraps around the new year — otherwise January and
December get a systematically thinner sample, which in the Southern Hemisphere
is the middle of the fire season.

### Near-real-time

```python
from firms_ingest import FirmsClient

client = FirmsClient()                      # reads FIRMS_MAP_KEY
recent = client.fetch_area("VIIRS_SNPP_NRT", west=130, south=-16,
                           east=137, north=-11, day_range=7)
```

Responses normalize through the same path as the archive files, so the live
layer and the historical record are directly comparable. FIRMS answers key and
quota errors with HTTP 200 and a plain-text body, which is detected rather than
parsed as CSV.

Get a free MAP_KEY at <https://firms.modaps.eosdis.nasa.gov/api/map_key/>.

## Command line

```bash
firms-ingest normalize   PATHS... --product MCD14ML -o out.parquet
firms-ingest aggregate   PATHS... --product MCD14ML -r 4 -o cells.parquet
firms-ingest climatology cells.parquet -o climatology.parquet
firms-ingest nrt --source VIIRS_SNPP_NRT --day-range 7 -o recent.parquet
```

`--bbox WEST SOUTH EAST NORTH` clips any of them; `--no-filter` emits the raw
normalized frame.

## Canonical columns

| Column | Meaning |
|---|---|
| `lat`, `lon` | WGS84 centroid of the detection footprint |
| `acq_ts` | UTC acquisition timestamp |
| `sensor` | `MODIS` or `VIIRS` |
| `platform` | `Terra`, `Aqua`, `Suomi-NPP`, `NOAA-20`, `NOAA-21` |
| `frp_mw` | Fire Radiative Power, megawatts |
| `brightness_k`, `bright_bg_k` | Fire and background channel brightness temperature |
| `scan_km`, `track_km`, `pixel_area_km2` | Footprint dimensions and derived area |
| `frp_density_mw_km2` | `frp_mw / pixel_area_km2` |
| `daynight` | `D` or `N` |
| `confidence_raw`, `confidence_class` | Product-native value and the harmonized class |
| `source_type` | FIRMS `type`: 0 vegetation, 1 volcano, 2 static land, 3 offshore |

## Tests

```bash
pytest          # 84 tests, no network required
```

## Licence

MIT.
