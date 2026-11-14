# Data sources

All inputs are public NASA products. **Nothing in this repository redistributes
them** — the pipeline downloads what it needs, and the archives are gitignored.

## Active fire — the record itself

| Product | Sensor | Platform | Resolution | Period |
|---|---|---|---|---|
| **MCD14ML** | MODIS | Terra + Aqua | 1 km | Nov 2000 – |
| **VNP14IMGML** | VIIRS | Suomi-NPP | 375 m | Jan 2012 – |
| **VJ114IMGML** | VIIRS | NOAA-20 | 375 m | Jan 2018 – |
| **VJ214IMGML** | VIIRS | NOAA-21 | 375 m | 2023 – |

Monthly CSVs from the FIRMS archive download service. Point records, not
imagery — which is why 25 years of global data is a manageable download rather
than terabytes of raster.

Request archive access at
<https://firms.modaps.eosdis.nasa.gov/download/>.

## Near-real-time

The FIRMS **area API** serves recent detections with a short latency:

```
https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{AREA}/{DAY_RANGE}/{DATE}
```

Sources: `MODIS_NRT`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`,
plus `_SP` standard-processing variants. Maximum 10 days per request.

Get a free `MAP_KEY` at
<https://firms.modaps.eosdis.nasa.gov/api/map_key/>.

**Two gotchas**, both handled in `firms_ingest.nrt`:

- The NRT feed omits the `type` field that the archive carries, so
  `source_type` is nullable and the vegetation filter keeps nulls. Dropping them
  would silently discard the most recent data.
- FIRMS answers key and quota errors with **HTTP 200 and a plain-text body**, so
  a status check alone is not enough to trust the payload.

## Supporting products

**MCD12Q1** — annual land cover, IGBP classification. Joined to each detection
so censoring thresholds and correction factors can be fitted per biome. The
17 IGBP classes are seeded into `landcover_class` by the first migration.

**MCD64A1** — monthly burned area, 500 m. Used **only as independent
validation**, never as an input to the fit. It is derived by detecting the burn
scar rather than the active flame, so agreement between it and the harmonized
active-fire series is genuine evidence rather than circular.

## Field notes

- `acq_time` is HHMM, and loses its leading zero when stored as an integer.
  `525` is 05:25.
- MODIS `confidence` is 0–100; VIIRS `confidence` is `l`/`n`/`h`. See
  [`science.md`](science.md) §4.
- MODIS `scan`/`track` give the actual footprint dimensions, which grow
  substantially off-nadir. Use them rather than assuming 1 km².
- The `satellite` column spells the same platform differently between the
  archive and the NRT feed (`N` vs `Suomi NPP`). Both are normalized.

## Attribution

Active fire data from NASA FIRMS. We acknowledge the use of data and imagery
from LANCE FIRMS, operated by NASA's Earth Science Data and Information System
(ESDIS) with funding provided by NASA Headquarters.
