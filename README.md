# Emberline

**A burning activity calendar on a fire record that holds still across the MODIS → VIIRS sensor change.**

Live: **https://emberline-tan.vercel.app/**

Built for the **NASA Space Apps Challenge 2026**, challenge *MODIS and VIIRS hot spots*.
Not affiliated with or endorsed by NASA. No NASA logos or insignia are used.

## What it is

Satellites have mapped active fires since 2000, but the record is split across two
sensor generations. Suomi-NPP VIIRS (375 m, record from 2012) detects small fires
that MODIS (1 km) misses, so a naive hotspot count jumps in 2012. Much of that jump
reflects improved detection sensitivity rather than an equivalent increase in fire
activity. Emberline fits, per country, how VIIRS detections map onto what Aqua MODIS
would have recorded, and rebuilds a harmonized record in one unit, Aqua-MODIS-equivalent
daytime vegetation-fire detections. That reduces the discontinuity between the sensor records.

On top of it: a month × year calendar for any fitted country or a drawn box (CSV
download), a "is this year unusual?" view, season-timing trends, a two-region
comparison, the method and its validation, calculators for every coefficient, open
data files, and a separate live layer of recent raw detections.

Source archive 2001–2025; harmonized record 2003–2025 (Aqua launched in May 2002, so
2001–2002 have no Aqua reference). The live layer is NOAA-20/21 VIIRS plus MODIS near-real-time
data: raw, uncorrected, and not the Suomi-NPP record the history is built from.

## Headline results

Fit version **`v1-20261114T1240`**, from `web/public/data/params_global.json` and
`docs/results.md`. Trained 2012–2018, scored on held-out 2019–2021 against Aqua
reference observations, per H3 resolution-5 cell (~250 km²) and month. 2022–2025
(Aqua's orbital drift) is never used for fitting.

- **237** FIRMS countries and territories processed; **267,159,561** filtered daytime
  vegetation-fire detections (MODIS + VIIRS, 2001–2025).
- **171** countries fitted: **130** with their own curve, **41** on a pooled curve
  (too few training matches of their own). **66** are too sparse to fit: raw record only,
  shown as uncorrected.
- Median held-out R² across the 130 own-fit countries: **0.64**. The model beats raw VIIRS
  counts on held-out R² in **171 of 171** fitted countries; **35** still score below 0 and
  are flagged in the Method page table.
- Canada, the demo example: the raw record steps up **×6.60** from 2009–11 to 2012–14.
  Aqua alone shows **×1.43** over the same years; the harmonized record shows **×1.68**.
  Held-out R² **0.78** (raw VIIRS −31.9), bias −13.5%.

These are regional, per-country fits. No global step correction is claimed.

## The method in five lines

1. **Match**: a Suomi-NPP VIIRS detection counts as "seen by Aqua" if Aqua detected fire on the same UTC date in the same H3 res-7 cell or a neighbour (~3.5 km).
2. **Learn**: per country, a logistic curve P(Aqua also detects | log FRP), fitted on 2012–2018.
3. **Scale**: κ = Aqua detections ÷ Σ P on the training years (one MODIS pixel holds several VIIRS pixels); Aqua-equivalent count = κ × Σ P.
4. **Validate**: held-out 2019–2021 R², bias and RMSE against Aqua, against raw VIIRS and a best single FRP cut-off, with bootstrap intervals over cells.
5. **Control**: Aqua alone across the 2012 boundary is the reference; the drift years 2022–2025 are reported, never fitted.

Full method: `/method` on the site, `docs/science.md`, `scripts/fit_harmonization.py`.

## Run it

```bash
cd web && npm install && npm run dev          # the app, reads web/public/data/
python3 scripts/check_app_numbers.py          # cross-check app numbers against the files
cd packages/firms-ingest && pip install -e ".[dev]" && pytest
```

Rebuilding the data (no API key needed): `scripts/stage_global.sh` downloads the FIRMS
country archive, `scripts/run_global.py` builds per-country detection tables and calendars,
`scripts/fit_harmonization.py` fits (see `STATUS.md` for the exact environment variables),
`scripts/build_insights.py` builds `countries.json`, `season.json` and `drift.json`.

Read path: static Parquet over HTTP range requests (hyparquet). No database, no API server.

## Data, libraries and papers

- NASA FIRMS: MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi-NPP) country
  archives, 2001–2025; NOAA-20/21 VIIRS and MODIS near-real-time feeds (live layer only).
  https://firms.modaps.eosdis.nasa.gov/
- Orbital elements: CelesTrak TLEs via tle.ivanstanojevic.me.
- Natural Earth 1:110m country outlines; OpenFreeMap / OpenMapTiles basemap, © OpenStreetMap contributors.
- Libraries: Next.js, React, Tailwind CSS, Motion, MapLibre GL, h3-js, hyparquet and
  hyparquet-compressors, react-globe.gl / three.js, satellite.js; Python: Polars, NumPy, h3, Matplotlib (figures).
- Papers: Andela et al. (2015), *Atmos. Chem. Phys.* 15, 8831–8846 (fire diurnal cycle,
  illustration only); Laurent et al. (2019), *Biogeosciences* 16, 275–288, for the 9–11 MW
  MODIS "thresholds of FRP detection", citing Roberts & Wooster (2008) and Schroeder et al. (2010).
  Literature values are sanity checks, never results.

## Work before and during the event

Before the event (13 Nov and earlier) the team prepared planning documents, research
notes, verified data schemas and download scripts, and an empty app scaffold
(`docs/`, `scripts/stage_data.sh`, `packages/firms-ingest`). No harmonization, fit,
validation number or app feature existed then. Everything else (the global download
and build, the fit and validation, every number, the web app) was built during the
event, 14–15 Nov; the git history shows it.

## Use of AI

We used Anthropic's Claude (Claude Code; Claude Opus models) as a coding and research
assistant: for literature research and planning before the event, and during it for
writing and debugging the data pipeline and this web application, and for drafting
documentation. The scientific choices (the harmonization approach, the 2012–2021
frozen-orbit window with training 2012–2018 and testing 2019–2021, the validation design)
and every reported number come from our own analysis of NASA FIRMS data, run and checked
by the team. No AI-generated images, video or audio are used.

## Licence

MIT. See [`LICENSE`](LICENSE).
