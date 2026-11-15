# Data reference

Quick-access reference for the fire data we work with. **Schemas below were
verified empirically** against real downloaded files on 2026-10-29 — see
"Verified access" for how, and `scripts/probe_firms_archive.sh` to reproduce.

## Verified access: the country archive needs no API key

This is the single most useful operational fact in this document.

```
https://firms.modaps.eosdis.nasa.gov/data/country/csv/{SOURCE}/{YEAR}/{SOURCE}_{YEAR}_{COUNTRY}.csv
```

Served as **static CSV over plain HTTPS, no MAP_KEY, no Earthdata login.**

| Source slug | Sensor | Verified year range |
|---|---|---|
| `modis` | MODIS (Terra + Aqua, C6.1) | 2000 – 2024+ |
| `viirs-snpp` | VIIRS Suomi-NPP | 2012 – 2024+ |

Examples that return HTTP 200:

```bash
curl -O https://firms.modaps.eosdis.nasa.gov/data/country/csv/modis/2001/modis_2001_Chile.csv
curl -O https://firms.modaps.eosdis.nasa.gov/data/country/csv/viirs-snpp/2012/viirs-snpp_2012_Chile.csv
```

**A MAP_KEY is only needed for the near-real-time `api/area/...` endpoints.**
That matters for the live layer (View C) and nothing else. The entire 25-year
historical pipeline can be built with no credentials at all.

**NOAA-20 / NOAA-21 archives (updated 15 Nov).** FIRMS now lists standard
(archive) products for NOAA-20 and NOAA-21 as well as Suomi-NPP; NOAA-20 was
verified in the country archive under slug `viirs-jpss1` (see below). Verify the
start dates of each before relying on them. Several guessed slugs
(`viirs-noaa20`, `j1-viirs-c2`, `noaa-20-viirs-c2`, `suomi-npp-viirs-c2`) return
404 on the country endpoint; a 404 arrives as a JSON error document, not a CSV,
so check the first byte for `{` before parsing. Emberline's historical VIIRS
record uses Suomi-NPP only (2012 onward, the overlap partner for Aqua); NOAA-20/21
appear only in the live layer, labelled as a different platform.

### Download-size expectations

Measured, Chile:

| File | Rows | Size |
|---|---|---|
| `modis_2000_Chile.csv` (Nov–Dec only) | ~200 | 16 KB |
| `modis_2001_Chile.csv` | ~1,400 | 122 KB |
| `modis_2023_Chile.csv` | ~16,500 | 1.3 MB |
| `viirs-snpp_2012_Chile.csv` | ~20,000 | 1.7 MB |
| `viirs-snpp_2023_Chile.csv` | ~54,900 | 4.4 MB |

So a mid-size country is a few tens of MB for the full record. A handful of
demo countries is entirely tractable on a laptop. Global is not — use the
global archive request service for that.

## FIRMS CSV schemas

Both verified against real headers. Note **both** carry `instrument` and
**both** carry `type`, contrary to some third-party schema mirrors.

### MODIS columns (verified)

Header, exactly as served:

```
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type
```

| Column | Type | Description |
|---|---|---|
| `latitude` | float | Pixel center, decimal degrees (WGS84) |
| `longitude` | float | Pixel center, decimal degrees (WGS84) |
| `brightness` | float | Channel 21/22 brightness temperature, Kelvin |
| `scan` | float | Along-scan pixel size, km (grows toward swath edge) |
| `track` | float | Along-track pixel size, km (grows toward swath edge) |
| `acq_date` | string | Acquisition date, YYYY-MM-DD |
| `acq_time` | string | Acquisition time UTC, HHMM (zero-padded, e.g. `0300`) |
| `satellite` | string | `Terra` or `Aqua` (verified: both present) |
| `instrument` | string | `MODIS` |
| `confidence` | int | 0–100 |
| `version` | string | Collection, e.g. `6.2` (2001 files), `61.03` (2023 files) |
| `bright_t31` | float | Channel 31 (11 µm) brightness temperature, Kelvin |
| `frp` | float | Fire Radiative Power, megawatts |
| `daynight` | string | `D` (day) or `N` (night) |
| `type` | int | 0 = vegetation fire, 1 = volcano, 2 = other static land, 3 = offshore |

**Pixel area.** At nadir, scan ≈ track ≈ 1.0 km. At swath edge, scan can reach
~2 km and track ~1.5 km. Pixel area = scan × track (in km²). This is the
`A_pix` in the FRP equation and is critical for the detection-probability model.

### VIIRS columns (verified)

Header, exactly as served:

```
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type
```

| Column | Type | Description |
|---|---|---|
| `latitude` | float | Pixel center, decimal degrees (WGS84) |
| `longitude` | float | Pixel center, decimal degrees (WGS84) |
| `bright_ti4` | float | I-4 channel (3.74 µm) brightness temperature, Kelvin |
| `scan` | float | Along-scan pixel size, km (verified ~0.54 at nadir-ish) |
| `track` | float | Along-track pixel size, km (verified ~0.51) |
| `acq_date` | string | Acquisition date, YYYY-MM-DD |
| `acq_time` | string | Acquisition time UTC, HHMM |
| `satellite` | string | `N` = Suomi-NPP (verified; the only value in snpp files) |
| `instrument` | string | `VIIRS` |
| `confidence` | string | **Single letters `l` / `n` / `h`** (verified) |
| `version` | string | e.g. `2` |
| `bright_ti5` | float | I-5 channel (11.45 µm) brightness temperature, Kelvin |
| `frp` | float | Fire Radiative Power, megawatts |
| `daynight` | string | `D` (day) or `N` (night) |
| `type` | int | **Present.** 0 = vegetation, 1 = volcano, 2 = other static land, 3 = offshore |

**Correction to third-party schema mirrors.** Several widely-copied schema
listings (including a Kaggle mirror and an apis.io schema) claim the VIIRS
archive has no `type` column and spells confidence out as `low`/`nominal`/`high`.
Both are wrong for the country archive: `type` is present, and confidence is
single letters. Verified distribution, Chile 2023 VIIRS, 54,947 rows:

| `type` | Meaning | Count |
|---:|---|---:|
| 0 | Presumed vegetation fire | 50,205 |
| 2 | Other static land source | 4,384 |
| 1 | Active volcano | 258 |
| 3 | Offshore | 100 |

| `confidence` | Count |
|---|---:|
| `n` (nominal) | 45,324 |
| `l` (low) | 4,955 |
| `h` (high) | 4,668 |

Chile is a good demo AOI partly *because* it has real volcano detections —
flipping the `type` filter visibly changes the map.

**Pixel area.** VIIRS scan/track run ~0.5 km in these files rather than the
nominal 0.375 m, because the archive reports the aggregated footprint. VIIRS's
aggregation scheme limits pixel growth toward swath edge much better than MODIS.

### Key differences between the two schemas

| Property | MODIS | VIIRS |
|---|---|---|
| Brightness channel | `brightness` (Ch 21/22, 4.0 µm) | `bright_ti4` (I-4, 3.74 µm) |
| Thermal channel | `bright_t31` (Ch 31, 11.0 µm) | `bright_ti5` (I-5, 11.45 µm) |
| Confidence | Integer 0–100 | Letters `l` / `n` / `h` |
| Satellite values | `Terra`, `Aqua` | `N` |
| Type field | Present (0–3) | Present (0–3) |
| Nominal resolution | 1 km | 375 m |

Column *order* and *count* match (15 each) but three column *names* differ, so
normalize on read rather than positionally.

### Confidence mapping

MODIS confidence 0–100 maps to three classes. The exact thresholds are not
published in the archive docs; FIRMS groups them roughly as:

| MODIS range | FIRMS label | VIIRS letter |
|---|---|---|
| 0–29 | low | `l` |
| 30–79 | nominal | `n` |
| 80–100 | high | `h` |

**These ranges are approximate and are the mapping to validate, not to trust.**
Build it explicitly, then check on the overlap period whether a MODIS detection
at confidence 85 really behaves like a VIIRS `h`. Write the answer down.

## Near-real-time feeds (also keyless)

```
https://firms.modaps.eosdis.nasa.gov/data/active_fire/{source}/csv/{NAME}_{REGION}_{WINDOW}.csv
```

Verified 200 with same-day data, no key:

| Path | Size |
|---|---|
| `modis-c6.1/csv/MODIS_C6_1_Global_24h.csv` | 0.8 MB |
| `suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv` | 5.5 MB |
| `noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv` | 5.3 MB |
| `noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv` | 5.7 MB |
| `modis-c6.1/csv/MODIS_C6_1_Global_7d.csv` | 6.0 MB |
| `suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_7d.csv` | 36 MB |
| `modis-c6.1/csv/MODIS_C6_1_South_America_7d.csv` | 1.4 MB |
| `modis-c6.1/csv/MODIS_C6_1_Europe_24h.csv` | 6.6 KB |

**The archive stops at the last complete year.** Verified 2026-11-13: the
archive covers **2001–2025**, and 2025 is complete (dates run to 2025-12-31);
`modis/2026/...` and `viirs-snpp/2026/...` are not published.

Region names are exact and unforgiving. Confirmed working: `Global`,
`South_America`, `Europe`. Confirmed 404: `North_America`, `Africa`,
`SouthAmerica` (no underscore). Verify a name before relying on it.

### The 2026 gap, and it affects requirement R5

The archive ends at 2025. NRT serves only **24h and 7d** windows. So **nothing
keyless covers Jan–early Nov 2026.** R5 asks for "the current month against the
historical median", and that span is unreachable without a MAP_KEY.

Two ways out:
- **Reframe (recommended, no key):** compare the **last 7 days** against the
  climatology for those same days of year. Defensible, and arguably closer to
  what an emergency responder actually wants.
- **Get a MAP_KEY** (free, instant) so the area API can serve longer recent
  ranges. Worth having as insurance; don't let the demo depend on it, and don't
  commit it.

### Suomi-NPP NRT is returning zero rows

Verified 2026-11-13. Both `SUOMI_VIIRS_C2_Global_24h.csv` and `..._7d.csv` come
back as **112 bytes — header only, no detections at all.** A global 24-hour feed
cannot genuinely contain zero fires, so this is an outage or a retirement, not a
quiet day. On the same day:

| Feed | Rows (24h) |
|---|---|
| `J1_VIIRS_C2_Global_24h` (NOAA-20) | 74,976 |
| `J2_VIIRS_C2_Global_24h` (NOAA-21) | 74,131 |
| `MODIS_C6_1_Global_24h` | 14,414 |
| `SUOMI_VIIRS_C2_Global_24h` | **0** |

**Consequence, and it is awkward:** the historical VIIRS record is Suomi-NPP
(the only VIIRS in the archive), but the working live feeds are NOAA-20/21. So
"now vs history" compares different platforms. Use NOAA-20/21 for the live layer
and **label it as not harmonized to the historical series**; calibrate
NOAA-20 → Suomi-NPP-equivalent from concurrent NRT days only if there is time.
Never silently mix them.

Re-check on the day — it may come back.

### NRT schema differs from the archive. Four silent traps.

NRT, 13 columns:
```
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight
```

| # | Field | Archive | NRT | Consequence |
|---|---|---|---|---|
| 1 | `type` | present (0–3) | **absent** | Cannot filter volcanoes / flares the archive way |
| 2 | `instrument` | present | **absent** | Infer from the feed fetched |
| 3 | MODIS `satellite` | `Terra` / `Aqua` | **`T` / `A`** | A name join silently drops everything |
| 4 | VIIRS `confidence` | `l` / `n` / `h` | **`low` / `nominal` / `high`** | Same trap, reversed |

`version` also differs: archive `6.2` / `61.03`, NRT `6.1NRT`.

**Normalize by column name, never by position**, and map all four of these.

### Three response cases, and only one is an error

A naive "is the file non-empty" check ingests error documents. Distinguish:

| Case | How it looks | Meaning |
|---|---|---|
| JSON error | first byte is `{` | Not published. **This is the only error.** |
| Header-only CSV | 1 line, starts `latitude,longitude` | **Valid.** No detections — legitimate for a small country in a quiet year, or a feed outage. |
| CSV with data rows | 2+ lines | Good |

`scripts/stage_data.sh` implements exactly this in its `classify()`.

### Rate limiting: keep parallelism low

The host **resets connections under parallel load**. A reset surfaces as curl
exit 35 or HTTP `000`, which is easy to misread as a 404. Keep concurrent
downloads at **3 or fewer** and retry with exponential backoff; the same URL
succeeds on retry. The agent proxy's `recentRelayFailures` shows
`ws_closed_mid_exchange` when this is happening.

For trap 1, build a persistent-hotspot mask from archive `type ∈ {1,2}`
detections (volcanoes and static industrial sources recur in the same place)
and apply it spatially to NRT.

**NOAA-20 IS in the country archive** under slug `viirs-jpss1` (verified 14 Nov
2026, `viirs-jpss1_<year>_<Country>.csv`, from 2018-04-01, with a `type` column;
the host often resets this path, so retry). Other slugs tried return 404 JSON.
See `docs/current-month.md`.

## Overpass drift: the record is still changing

Terra and Aqua left their frozen orbits around 2022. Measured mean **local
solar time** of daytime vegetation-fire detections
(`scripts/measure_overpass_drift.py`):

| Country | Sensor | 2015 | 2021 | 2025 | Δ 2021→2025 |
|---|---|---|---|---|---|
| Chile | Terra | 10.14h | 10.10h | **9.12h** | −0.98h |
| Chile | Aqua | 14.02h | 14.05h | **15.01h** | +0.96h |
| Portugal | Terra | 11.06h | 10.98h | **9.85h** | −1.13h |
| Portugal | Aqua | 13.20h | 13.14h | **14.40h** | +1.26h |
| Australia | Terra | 10.34h | 10.29h | **9.13h** | −1.16h |
| Australia | Aqua | 13.79h | 13.78h | **14.99h** | +1.21h |

Flat to 2021, then diverging in lockstep on three continents. Fires peak near
**13:00 local solar time with σ ≈ 1 hour** (Andela et al. 2015), so an hour of
drift is roughly a full standard deviation off the peak.

**Consequence: fit on 2012–2021 only.** Aqua no longer shares Suomi-NPP's
overpass. Full detail, the Gaussian model and its per-land-cover parameters are
in [`research-findings.md`](research-findings.md) §1–2.

**Always compute local solar time per detection** (`UTC + longitude/15`).
Averaging UTC across a wide-longitude AOI wraps across midnight.

## The raw artifact, measured

Full series from `scripts/probe_firms_archive.sh Chile`, counting `type==0`
(presumed vegetation fire) rows only. Verified 2026-10-29.

| Year | MODIS | VIIRS | Ratio |
|---|---:|---:|---|
| 2001 | 1,044 | — |  |
| 2002 | 1,596 | — |  |
| 2003 | 4,858 | — |  |
| 2004 | 5,670 | — |  |
| 2005 | 6,205 | — |  |
| 2006 | 5,123 | — |  |
| 2007 | 5,821 | — |  |
| 2008 | 6,452 | — |  |
| 2009 | 6,717 | — |  |
| 2010 | 5,794 | — |  |
| 2011 | 5,707 | — |  |
| 2012 | 5,927 | 14,623 | 2.47× |
| 2013 | 5,576 | 16,811 | 3.01× |
| 2014 | 5,972 | 18,763 | 3.14× |
| 2015 | 8,341 | 28,498 | 3.42× |
| 2016 | 5,961 | 18,614 | 3.12× |
| 2017 | 15,479 | 49,051 | 3.17× |
| 2018 | 4,691 | 17,297 | 3.69× |
| 2019 | 5,447 | 19,502 | 3.58× |
| 2020 | 5,885 | 21,745 | 3.69× |
| 2021 | 4,850 | 18,100 | 3.73× |
| 2022 | 5,302 | 23,993 | 4.53× |
| 2023 | 13,819 | 50,205 | 3.63× |
| 2024 | 4,011 | 17,787 | 4.43× |

**Read three things off this table.**

1. **MODIS is flat.** Roughly 4,000–6,700 a year, apart from 2017 (15,479) and
   2023 (13,819), which were genuinely catastrophic fire years in Chile. Both
   sensors agree those years were extreme — a good sign, and a thing the
   harmonization must *preserve* rather than smooth away.
2. **VIIRS is several times higher from 2012.** This is the artifact the whole
   project exists to remove, now a measured number rather than a claim.
3. **The ratio grows: 2.47× in 2012 to 4.43× in 2024.** It nearly doubles over
   thirteen years. **A single global correction factor is therefore wrong**, and
   demonstrably so. Likely causes to separate during the fit: NOAA-20 joining in
   2018 adding a second VIIRS platform, algorithm collection changes, and
   genuine change in small-fire activity. Whatever the cause, this is the
   strongest available argument for fitting a detection-probability curve rather
   than applying a constant.

Re-measure for whichever AOI the demo uses; do not quote Chile's numbers for
another region.

## Products we use

| Product | What it is | Resolution | Period |
|---|---|---|---|
| **MCD14ML** | MODIS active fire (Terra + Aqua) | 1 km | Nov 2000 – |
| **VNP14IMGML** | VIIRS active fire (Suomi-NPP) | 375 m | Jan 2012 – |
| **VJ114IMGML** | VIIRS active fire (NOAA-20) | 375 m | Jan 2018 – |
| **VJ214IMGML** | VIIRS active fire (NOAA-21) | 375 m | 2023 – |
| **MCD12Q1 v6.1** | Land cover type, annual | 500 m | 2001 – |
| **MCD64A1** | Burned area, monthly | 500 m | Nov 2000 – |

### MCD12Q1 IGBP land cover classes (LC_Type1)

| Value | Class |
|---:|---|
| 1 | Evergreen Needleleaf Forests |
| 2 | Evergreen Broadleaf Forests |
| 3 | Deciduous Needleleaf Forests |
| 4 | Deciduous Broadleaf Forests |
| 5 | Mixed Forests |
| 6 | Closed Shrublands |
| 7 | Open Shrublands |
| 8 | Woody Savannas |
| 9 | Savannas |
| 10 | Grasslands |
| 11 | Permanent Wetlands |
| 12 | Croplands |
| 13 | Urban and Built-up Lands |
| 14 | Cropland/Natural Vegetation Mosaics |
| 15 | Permanent Snow and Ice |
| 16 | Barren |
| 17 | Water Bodies |

**Verify against the MCD12Q1 v6.1 User Guide Table 1 before coding.** The
class names above are from the IGBP standard; the User Guide is the
authoritative source for the product.

For per-biome harmonization fits, group into ~5–7 super-classes to keep sample
sizes large enough:

| Super-class | IGBP values |
|---|---|
| Forest | 1–5 |
| Shrubland | 6–7 |
| Savanna / grassland | 8–10 |
| Cropland | 12, 14 |
| Other vegetated | 11 |
| Non-vegetated (exclude) | 13, 15, 16, 17 |

## Satellite overpass times

| Satellite | Sensor | Ascending node (local solar time) |
|---|---|---|
| Terra | MODIS | ~10:30 |
| Aqua | MODIS | ~13:30 |
| Suomi-NPP | VIIRS | ~13:30 |
| NOAA-20 | VIIRS | ~13:30 |
| NOAA-21 | VIIRS | ~13:30 |

**Aqua and Suomi-NPP share the ~13:30 overpass.** This is the overlap pair for
harmonization. Terra's 10:30 overpass sees a different part of the daily fire
cycle and should be handled separately or excluded from the primary fit.

## FRP retrieval (MODIS C6)

The MIR-radiance method (Wooster et al. 2003), as implemented in Giglio et al.
(2016):

```
FRP (MW) = (A_pix × σ × τ₄) / (a × 10⁶) × (L₄ − L̄₄)
```

| Symbol | Value / meaning |
|---|---|
| A_pix | Pixel area, m² (= scan × track × 10⁶) |
| σ | Stefan–Boltzmann constant, 5.6704 × 10⁻⁸ W m⁻² K⁻⁴ |
| τ₄ | Atmospheric transmittance at 4 µm; set to 1 in Level-2 |
| a | 3.0 × 10⁻⁹ W m⁻² sr⁻¹ µm⁻¹ K⁻⁴ |
| L₄ | Fire-pixel 4 µm radiance |
| L̄₄ | Background 4 µm radiance (from contextual window) |

**Key implication:** FRP scales linearly with pixel area. At swath edge, a MODIS
pixel can be ~2× larger, so the same fire has a different FRP depending on where
in the swath it was observed. This is why the detection-probability model needs
`log(A_pixel)` as a predictor.

## Detection thresholds (literature values)

| Quantity | Value | Source |
|---|---|---|
| MODIS FRP detection threshold range | 9–11 MW | Laurent et al. (2019), citing Roberts & Wooster (2008) and Schroeder et al. (2010) |
| MODIS C6 mean FRP, fires detected by both C5 and C6 | 47.7 MW (C6) vs 56.9 MW (C5) | Giglio et al. (2016) |
| MODIS C6 global Terra daytime commission error | 1.2% (down from 2.4% in C5) | Giglio et al. (2016) |
| VIIRS 375 m commission error (nominal confidence) | < 1.2% | Schroeder et al. (2014) |
| VIIRS 375 m detection gain vs 750 m baseline | 3× daytime, 25× nighttime | Schroeder et al. (2014) |

**Caveat:** The 9–11 MW value is described as "thresholds of FRP detection," not
a 50% probability of detection. Our logistic fit will produce the actual
P(detect) curve.

## Key papers

| Short name | Full citation |
|---|---|
| **Giglio 2016** | Giglio, L., Schroeder, W., Justice, C. O. (2016). The Collection 6 MODIS Active Fire Detection Algorithm and Fire Products. *Remote Sensing of Environment*, 178, 31–41. DOI: 10.1016/j.rse.2016.02.054 |
| **Schroeder 2014** | Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment. *Remote Sensing of Environment*, 143, 85–96. |
| **Laurent 2019** | Laurent, P., Mouillot, F., Moreno, M. V., Yue, C., Ciais, P. (2019). Varying relationships between fire radiative power and fire size at a global scale. *Biogeosciences*, 16, 275–288. |
| **Wooster 2003** | Wooster, M. J., Zhukov, B., Oertel, D. (2003). Fire radiative energy for quantitative study of biomass burning. *Remote Sensing of Environment*, 86, 83–107. |

## Laurent 2019: FRP vs fire size by region

Key finding: the relationship between FRP and fire size (from MCD64A1 burned
area) varies strongly by biome. Relevant to our per-biome harmonization:

| Pattern | Regions |
|---|---|
| Humped (FS peaks at low-mid FRP, then declines) | NH Africa, Equatorial Asia, SE Asia |
| Peak at ~75–125 MW, gradual decline | Central America, NH South America, SH Africa, SH South America, Australia, Boreal Asia |
| Monotonic increase with plateau | Boreal North America (~196 MW), Temperate North America (~215 MW), Europe (~240 MW), Central Asia (~277 MW) |

FRP/fire-size slope (pre-threshold): Australia 9.0 ha/MW; other regions
0.6–4.4 ha/MW.

## Sources

- FIRMS CSV schema: <https://apis.io/schemas/nasa-firms/fire-detection/>
- FIRMS vector archive: <https://gee-community-catalog.org/projects/firms_vector/>
- Laurent et al. 2019: <https://bg.copernicus.org/articles/16/275/2019/>
- MCD12Q1: <https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/MCD12Q1>
- FIRMS download: <https://firms.modaps.eosdis.nasa.gov/download/>
