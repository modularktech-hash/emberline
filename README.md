# Emberline

**25 years of fire. One unbroken line.**

A harmonized record of satellite-detected burning activity from 2000 to today,
combining the long MODIS record with the finer detail of VIIRS so the sensor of
origin no longer matters, presented as a burning activity calendar for any area
you select.

Built for the **NASA Space Apps Challenge 2026** — challenge: *MODIS and VIIRS
hot spots*.

## The problem

Satellites have detected active fires from orbit since 2000, but the record is
split across two sensor generations. VIIRS (from 2012, 375 m) sees small fires
that MODIS (1 km) cannot, so a naive plot of hotspot counts shows burning
jumping in 2012. Nothing changed on the ground; the instrument did. And since
2022 the MODIS satellites Terra and Aqua have been drifting out of their
original orbits, which changes what they see again.

## Data

NASA open data from [FIRMS](https://www.earthdata.nasa.gov/data/tools/firms):
the MODIS Collection 6.1 and VIIRS 375 m active-fire archives (country
downloads, 2001–2025) and the near-real-time feeds. No API key is needed for
any of it.

## Status

Being built during the event, 14–15 November 2026. Method, results and every
reported number are added here as they are produced.

## Pre-event preparation

The first commit imports work prepared before the event: planning documents and
research notes (`docs/`), a generic FIRMS ingestion library
(`packages/firms-ingest/`, MIT), data staging and inspection scripts
(`scripts/`), and an application scaffold (`web/`). No harmonization method,
fitted parameter or result was produced before the event; those are built here.

## License

[MIT](LICENSE)
