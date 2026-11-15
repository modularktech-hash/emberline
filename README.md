# Emberline

**A burning activity calendar on a fire record that holds still across the MODIS → VIIRS sensor change.**

Live: **https://emberline-ten.vercel.app/**

Built for the **NASA Space Apps Challenge 2026**, challenge *MODIS and VIIRS hot spots*.
Not affiliated with or endorsed by NASA. No NASA logos or insignia are used.

## The problem in one comparison

In 2012 the fire satellites changed, and the counts jumped. The fires did not.
Canada, mean yearly detections in 2012–14 divided by 2009–11:

| Record | Step across 2012 |
|---|---|
| Raw, MODIS joined to VIIRS (what a naive download shows) | **×6.60** |
| Aqua MODIS alone, a sensor that did not change | **×1.43** |
| Emberline, harmonized | **×1.68** |

The same test for every fitted country, and where the correction is weakest, is on the
[Method page](https://emberline-ten.vercel.app/method).

## Two joins, both fixed

The fire record has been broken twice, and Emberline repairs both:

1. **2012: MODIS → VIIRS (Suomi-NPP).** The sharper sensor sees small fires MODIS missed. Fixed by
   per-country detection curves, tested on held-out 2019–2021.
2. **Today: Suomi-NPP → NOAA-20.** Suomi-NPP is ageing, and the current data comes from NOAA-20.
   Fixed by a per-country bridge, tested on held-out 2022–2023: 50 of 50 countries pass.

So the calendar runs from 2003 to the present on one scale, and it keeps working as MODIS retires
and VIIRS moves to newer satellites.

## Use it in three steps

1. **Pick an area of interest.** A country, a one-click area (New South Wales worked
   example, Amazon basin, Sierra Nevada, Pantanal, Central Africa savanna), a box or polygon
   drawn on the map, or typed latitude and longitude. Then a date range, month to month.
2. **Read the burning activity calendar.** Years down, months across, raw or harmonized,
   coloured by detections or against a usual month (blue below the median of that month,
   orange to red above; colour-blind-safe). Click any month for its **fire report**: a
   verdict ("the highest December in 23 years"), how many times a usual month, its rank, the
   raw count beside it, that country's held-out error, and the years most like it with what
   came next. Below it: the **critical periods** (fire season, peak month, years with the
   highest burning activity, quietest window) and **this month against the historical median**.
3. **Take it with you.** Calendar CSV, a CSV of the hotspots in the area (recent cells, or
   individual detections for chosen dates), chart exports, an evidence brief that opens with
   the findings, a citation, and a link that reproduces the exact view.

Everything is a description of the satellite record. Nothing is a forecast, and a detection
is an active-fire hotspot, not burned area.

## What it is

Satellites have mapped active fires since 2000, but the record is split across two
sensor generations. Suomi-NPP VIIRS (375 m, record from 2012) detects small fires
that MODIS (1 km) misses, so a naive hotspot count jumps in 2012. Much of that jump
reflects improved detection sensitivity rather than an equivalent increase in fire
activity. Emberline fits, country by country, how VIIRS detections map onto what Aqua MODIS
would have recorded (171 countries harmonized: 130 with their own fit, 41 with a pooled fit;
66 shown raw, too few detections to fit), and rebuilds a historical record in one unit, Aqua-MODIS-equivalent daytime
vegetation-fire detections. That reduces, but does not remove, the discontinuity between the
sensor records, and how well it does so varies by country (see the Method page).

On top of it: a month × year calendar for any fitted country or a drawn box (CSV
download), a "is this year unusual?" view, season-timing trends, a two-region
comparison, the method and its validation, calculators for every coefficient, open
data files, and a separate live layer of recent raw detections.

Source archive 2001–2025; the harmonized record is 2003–2025 (Aqua launched in
May 2002, so 2001–2002 have no Aqua reference). **2026 to the latest day** is on the
harmonized scale for countries whose NOAA-20 bridge passed its held-out test (50 passed; the 2026 row is published for those listed in `calendar_2026.json`)
(2022–2023, median monthly miss 7.25%): NOAA-20 VIIRS from the FIRMS API (standard
processing, then near-real-time) goes through the same fit and the country's bridge ratio,
and shows as a provisional 2026 row under the calendar (`calendar_2026.json`,
`scripts/build_2026.py`). Other countries show 2026 only as raw month-to-date counts. The live
globe covers the last 24 h and 7 days of NOAA-20/21 VIIRS plus MODIS near-real-time data:
raw, uncorrected, and not the Suomi-NPP platform the history is built from. Terra/Aqua orbital drift since 2022 is measured
and shown, not corrected: the 2022–2025 values use the frozen-orbit (2012–2018) fit unchanged.

## Headline results

Fit version **`v1-20261114T1240`**, from `web/public/data/params_global.json` and
`docs/results.md`. Trained 2012–2018, scored on held-out 2019–2021 against Aqua
reference observations, per H3 resolution-5 cell (~250 km²) and month. 2022–2025
(Aqua's orbital drift) is never used for fitting.

- **237** FIRMS countries and territories processed; **267,159,561** filtered daytime
  vegetation-fire detections (MODIS + VIIRS, 2001–2025).
- **171** countries harmonized: **130** with their own fit, **41** with a pooled fit (one shared
  curve, for countries with fewer than 5,000 training VIIRS detections of their own); **66** shown
  raw (too few detections to fit), flagged uncorrected: 23 insufficient training observations, 17 insufficient
  reference observations, 18 insufficient held-out variation, 8 no observations
  (`web/public/data/coverage_status.json`).
- Median held-out R² across the 130 own-fit countries: **0.64**. The model beats raw VIIRS
  counts on held-out R² in **171 of 171** fitted countries; **35** still score below 0 and
  are flagged in the Method page table. A best single FRP cut-off has higher held-out R² than
  the model in **21 of 171**.
- Against a stronger baseline, one training-era (2012–2018) Aqua ÷ Suomi-NPP ratio per country,
  the model has higher held-out R² in only **84 of 171** countries (median R² **0.55** for the
  model, **0.59** for the ratio) and lower mean absolute error in **141 of 171**
  (`web/public/data/proof.json`, `docs/results.md`). Most of the gain over raw VIIRS comes from getting the
  overall scale right, which the simple ratio also does.
- One comparison on the same held-out 2019–2021 cell-months for all four methods
  (`proof.json` `headline`, `scripts/build_heldout_errors.py`): median MAE **0.79** Emberline,
  **0.81** ratio, **0.82** FRP cut-off, **4.21** raw VIIRS; lowest MAE in **90**, **15**, **66** and
  **0** countries. The 2012 step lands within ×1.25 of Aqua alone in **146** countries for
  Emberline and **161** for the ratio: the simple ratio removes the step too.
- Typical held-out error of a country's harmonized monthly total (median monthly miss,
  2019–2021; not a confidence interval): **±31%** (median over countries); **±48%** in the third of countries with the fewest fires, **±22%** in the third with
  the most; **±54%** for pooled-fit countries against **±26%** for own-fit ones.
- Canada, the demo example: the raw record steps up **×6.60** from 2009–11 to 2012–14.
  Aqua alone shows **×1.43** over the same years; the harmonized record shows **×1.68**.
  Held-out R² **0.78** (raw VIIRS −31.9), bias −13.5%.

These are regional, per-country fits. No global step correction is claimed, and no claim that
the model is the best choice in every country.

## The method in five lines

1. **Match**: a Suomi-NPP VIIRS detection counts as "seen by Aqua" if Aqua detected fire on the same UTC date in the same H3 res-7 cell or a neighbour (~3.5 km).
2. **Learn**: per country, a logistic curve P(Aqua also detects | log FRP), fitted on 2012–2018.
3. **Scale**: κ = Aqua detections ÷ Σ P on the training years (one MODIS pixel holds several VIIRS pixels); Aqua-equivalent count = κ × Σ P.
4. **Validate**: held-out 2019–2021 R², bias and RMSE against Aqua, against raw VIIRS and a best single FRP cut-off, with bootstrap intervals over cells.
5. **Control**: Aqua alone across the 2012 boundary is the reference; the drift years 2022–2025 are reported, never fitted.

Full method: `/method` on the site, `docs/science.md`, `scripts/fit_harmonization.py`.

### Design choices

- **Counts through a detection curve, not summed fire power.** Fire radiative power is the
  input to the curve (step 2), because it is what decides whether MODIS sees a fire. Summed
  FRP is not used as the unit: the two sensors do not report the same power for the same
  fire, and the challenge asks for a calendar of hotspots.
- **Per-country curves, benchmarked against a single ratio.** A regional MODIS/VIIRS ratio
  from the overlap years is the simplest correction; it is fitted and scored on the same
  held-out data, and the results above say where it wins.
- **Static heat sources.** The historical record keeps vegetation fires only (FIRMS `type`
  0), which leaves out volcanoes, gas flares and other static sources. Near-real-time files
  carry no type, so the live layer and the current month say that they include them.
- **Raw is always one click away.** Every harmonized view has its raw counterpart, and
  countries without a fit are shown raw and labelled uncorrected.

## Carrying the record to today: the NOAA-20 bridge

Suomi-NPP, the satellite the fit was trained on, is ageing, and its near-real-time feed has
gaps. NOAA-20 carries the same VIIRS instrument design about 50 minutes ahead on the same
orbit. Per country, NOAA-20 detections go through the published fit unchanged, then one
ratio lines them up with the harmonized Suomi-NPP record.

- Trained April 2018 (the start of the NOAA-20 archive) to 2021; tested on held-out 2022–2023.
- All 50 countries tested pass (rule: held-out median monthly miss of 25% or less). Median
  monthly miss **7.25%** with the ratio and
  **7.47%** without it: NOAA-20 through the
  fit already matches the record, and the ratio adds little.
- Used for the harmonized current month and the provisional 2026 row
  (`bridge.json`, `calendar_2026.json`, `scripts/build_bridge.py`, `scripts/build_2026.py`).
- Not tested: near-real-time against standard processing of NOAA-20 itself (no near-real-time
  archive exists for the test years).

## Run it

```bash
cd web && npm install && npm run dev          # the app, reads web/public/data/
python3 scripts/check_app_numbers.py          # cross-check app numbers against the files
cd packages/firms-ingest && pip install -e ".[dev]" && pytest
```

Rebuilding the data (no API key needed): `scripts/stage_global.sh` downloads the FIRMS
country archive, `scripts/run_global.py` builds per-country detection tables and calendars,
`scripts/fit_harmonization.py` fits (`EMBERLINE_DATA=data/global_public EMBERLINE_PARAMS=params_global.json EMBERLINE_CAL=calendar_harmonized_global.parquet`),
`scripts/build_insights.py` builds `countries.json`, `season.json` and `drift.json`.

Read path: static Parquet over HTTP range requests (hyparquet). No database, no API server.

## Reproduce in 5 minutes

A committed fixture (`tests/fixtures/portugal_feb_dec/`, 104 KB) holds every FIRMS
archive row for Portugal in February and December 2019–2021 (997 raw rows, MODIS C6.1
and VIIRS 375 m Suomi-NPP, unmodified; cut by `scripts/make_fixture.py`). From a fresh
clone, with Python ≥ 3.10 and pip access:

```bash
git clone https://github.com/modularktech-hash/emberline && cd emberline
./scripts/repro_fixture.sh
```

It creates `.venv-repro/`, installs polars 2.1.0, numpy 2.5.3, pyarrow 22.0.0, h3 4.3.1,
pytest 8.4.2, scikit-learn 1.7.2, httpx 0.28.1 and `packages/firms-ingest`, then
(1) runs the firms-ingest tests, (2) builds detections, H3 cell-day rows and the raw
calendar with the same functions as `scripts/build_tables.py`, (3) compares the Portugal
monthly counts and FRP sums with `tests/fixtures/portugal_feb_dec_expected.json`, and
(4) checks the counts equal the published `web/public/data/calendar_raw_global.parquet`
that the website reads. It ends with `REPRO OK`. Tested with Python 3.13.
The fixture covers ingestion and table building only; the harmonization fit needs
2012–2021 data for a whole country and is not part of it.

## Data, libraries and papers

- NASA FIRMS (Fire Information for Resource Management System): MODIS Collection 6.1 on
  Terra and Aqua, and VIIRS 375 m on Suomi-NPP, country archives 2001–2025 (the historical
  record); VIIRS on NOAA-20 and NOAA-21 and MODIS near-real-time feeds (live layer and
  current month only).
  https://firms.modaps.eosdis.nasa.gov/
- Orbital elements: CelesTrak TLEs via tle.ivanstanojevic.me.
- Natural Earth 1:110m country outlines; OpenFreeMap / OpenMapTiles basemap, © OpenStreetMap contributors.
- Libraries: Next.js, React, Tailwind CSS, Motion, MapLibre GL, h3-js, hyparquet and
  hyparquet-compressors, react-globe.gl / three.js, satellite.js; Python: Polars, NumPy, h3, Matplotlib (figures).
- Papers: Andela et al. (2015), *Atmos. Chem. Phys.* 15, 8831–8846 (fire diurnal cycle,
  illustration only); Laurent et al. (2019), *Biogeosciences* 16, 275–288, for the 9–11 MW
  MODIS "thresholds of FRP detection", citing Roberts & Wooster (2008) and Schroeder et al. (2010).
  Literature values are sanity checks, never results.

## Use of AI and work history

Shishir Bhat and Ridhan Teli have worked on this problem for about a year. Every scientific choice — the method, what to fit, the validation design and how to interpret the results — was made by the team. We used Claude, by Anthropic, through Claude Code to build it under our direction: during the event it wrote the code, ran the data pipeline and the fit we specified, tested the results and drafted documentation; before the event it also assisted with literature research and planning. Before the event we prepared planning and research documents, verified data schemas, the FIRMS ingest package and download scripts, and an empty app scaffold; these were imported into this repository in its first commit at the start of the event. The harmonization, the fit, the validation and the web app were built during the event, 14–15 Nov, as the git history shows. No AI-generated images, video or audio are used.

## Licence

MIT. See [`LICENSE`](LICENSE).
