# Session notes

Running log of AI build sessions. Every number below was computed in this
repository on the date given, by the script named next to it. No literature
values, no placeholders.

## 2026-11-14, session A1 (offline data pipeline)

### Done

- `scripts/build_tables.py` (commit 4356cc2): raw, uncorrected static Parquet
  tables for Portugal and Chile in `data/public/`: `detections_<Country>.parquet`,
  `cell_day.parquet`, `calendar_raw.parquet`, `build_counts.csv`. The two shared
  tables (`cell_day`, `calendar_raw`) are also copied to `web/public/data/`.
- `scripts/plot_raw_counts.py`: `docs/figures/raw_counts_Portugal.png` and
  `docs/figures/raw_counts_Chile.png`, annual raw detection counts, MODIS vs
  VIIRS, 2001-2025, with the 2012 VIIRS start marked and partial years drawn
  hollow. Both figures were opened and checked: before 2012 only the MODIS
  series exists; from 2012 the VIIRS series sits well above MODIS in every
  year, so the total raw record steps up at 2012.
- `packages/firms-ingest` test suite: 84 passed.

### Not done

- No harmonization, no fit, no correction factor, no validation statistic. The
  figures and tables are raw sensor counts only.
- Only Portugal and Chile are built.

### Exact next step: session A2

The fit, per `docs/ai-briefs.md` A2: fit the MODIS-to-VIIRS harmonization on
**2012-2021 only**, Aqua against Suomi-NPP (shared frozen-orbit overpass
time), using `cell_day.parquet` / `calendar_raw.parquet`. Hold out 2022-2025
(Terra/Aqua orbital drift era) for validation; do not fit on it.

### Numbers produced, and how

From `scripts/build_tables.py` (task 1, commit 4356cc2), after the firms_ingest
`standard_pipeline` default filters:

| Country | MODIS detections | VIIRS detections |
|---|---:|---:|
| Portugal | 44,318 | 44,868 |
| Chile | 112,576 | 193,888 |
| **Total** | | **395,650** |

- `cell_day.parquet`: 155,730 rows, 4 row groups, sorted by (h3_parent res 2,
  acq_date); platforms Terra, Aqua, Suomi-NPP.
- Per-file raw vs filtered row counts are in `data/public/build_counts.csv`.

From `scripts/plot_raw_counts.py` (this session), summing `n_detections` of the
country-scope rows of `calendar_raw.parquet` by UTC year. Column sums match
the task 1 totals above exactly.

| Year | Portugal MODIS | Portugal VIIRS | Chile MODIS | Chile VIIRS |
|---|---:|---:|---:|---:|
| 2001 | 937 | | 581 | |
| 2002 | 1,653 | | 880 | |
| 2003 | 3,712 | | 3,898 | |
| 2004 | 2,060 | | 4,794 | |
| 2005 | 5,126 | | 4,952 | |
| 2006 | 1,646 | | 4,336 | |
| 2007 | 1,175 | | 4,684 | |
| 2008 | 854 | | 5,314 | |
| 2009 | 2,328 | | 5,331 | |
| 2010 | 2,432 | | 4,798 | |
| 2011 | 1,953 | | 4,551 | |
| 2012 (VIIRS partial) | 2,286 | 4,128 | 4,560 | 10,700 |
| 2013 | 2,496 | 4,776 | 4,617 | 12,851 |
| 2014 | 481 | 1,160 | 4,351 | 11,697 |
| 2015 | 1,339 | 2,799 | 6,168 | 16,574 |
| 2016 | 2,414 | 5,332 | 4,623 | 12,040 |
| 2017 | 2,870 | 6,943 | 9,194 | 25,003 |
| 2018 | 745 | 1,598 | 3,972 | 11,849 |
| 2019 | 810 | 1,634 | 4,206 | 11,769 |
| 2020 | 695 | 1,462 | 4,298 | 12,039 |
| 2021 | 689 | 1,318 | 3,930 | 10,992 |
| 2022 | 1,119 | 2,001 | 3,827 | 13,267 |
| 2023 | 698 | 1,345 | 7,767 | 21,376 |
| 2024 | 1,387 | 4,540 | 3,172 | 10,195 |
| 2025 | 2,413 | 5,832 | 3,772 | 13,536 |
| **Sum** | **44,318** | **44,868** | **112,576** | **193,888** |

Archive coverage printed by `plot_raw_counts.py` (earliest/latest acq_ts across
both countries): MODIS 2001-01-11 to 2025-12-31; VIIRS 2012-01-20 to
2025-12-31. Earliest Aqua detection: 2002-07-04.

### Caveats

- **Filters drop rows.** The `standard_pipeline` defaults keep vegetation fires
  (source_type 0), confidence nominal or high, daytime only, and drop rows with
  missing or zero FRP. Raw CSV row counts are larger; see `build_counts.csv`.
- **Dates are UTC.** `cell_day.acq_date` and the calendar years are UTC
  calendar dates of `acq_ts`, not local dates. Local solar time is stored per
  detection as `lst_hours`.
- **Chile includes Easter Island** (longitudes to -109.4). Filter it out if an
  AOI should be mainland only.
- **Partial years.** VIIRS 2012 is partial: the Suomi-NPP record starts
  2012-01-20 in both countries (identical start date in both, so it is the
  archive start, not an absence of fire). MODIS 2001 and January-June 2002 are
  Terra only (Aqua's first detection 2002-07-04); Chile MODIS 2001 (581) and
  2002 (880) are far below 2003 (3,898). 2025 is complete for both sensors: the
  archive runs to 2025-12-31 for both (Chile MODIS and both countries' VIIRS
  have 31 Dec detections). Portugal MODIS 2025 ends 2025-11-28 in the raw CSV
  too; Portugal VIIRS December 2025 has only 5 filtered detections, so an empty
  MODIS December is plausible and is not treated as truncation. The partial-year
  rule in `plot_raw_counts.py` is a heuristic: a coverage edge more than 14 days
  inside a year.
- **Recreate the environment and rerun:**

  ```bash
  python3 -m venv .venv            # Python 3.13.5 was used
  .venv/bin/pip install -e "packages/firms-ingest[dev]" polars h3 duckdb pyarrow matplotlib
  ./scripts/stage_data.sh          # if data/raw/ is empty (resumable, no key)
  .venv/bin/python scripts/build_tables.py Portugal Chile
  .venv/bin/python scripts/plot_raw_counts.py Portugal Chile
  ```

  Versions used: polars 2.1.0, h3 4.5.0, duckdb 2.0.0, pyarrow 26.0.1,
  matplotlib 3.11.2.

## 2026-11-14, session "app build" (web app, B1+B2)

**Done (on `main`)**

- **Data layer** (`df5d25d`). Supabase removed. `web/src/lib/queries.ts` is the
  only file that imports hyparquet (`hyparquet` + `hyparquet-compressors`,
  because the Parquet files are ZSTD). Exports `getParams`, `listCountries`,
  `listParentCells`, `listCellDayParents`, `getCalendar({scope, keys, mode})`,
  `getCellDay({parents, dateFrom, dateTo})`. Hook: `web/src/lib/useParquet.ts`.
- **Calendar home page** (`f5c4c25`). Month x year SVG grid, country selector
  from `listCountries()`, raw vs harmonized toggle (the only Framer Motion use),
  Magma ramp on a square-root scale shared by both modes, light and dark mode,
  annual totals, table view. Shared state in `components/AreaProvider.tsx`
  (`useArea()`), matrix in `lib/calendarMatrix.ts`.
- Checked against the files: Portugal raw annual totals 2011 = 1953,
  2012 = 4128; harmonized 2012 = 1162.7 (same values from polars).

**Things the data does that the UI has to respect**

- Raw before 2012 is MODIS Terra+Aqua; harmonized is Aqua-equivalent, so the
  toggle lowers pre-2012 levels as well as removing the 2012 jump.
- Harmonized starts July 2002; earlier months are drawn as "no data", not 0.
- Harmonized omits zero months; inside its coverage an absent month is 0.
- `cell_day.parquet` has 4 large row groups, so a one-parent read fetches
  about 1 MB. Smaller row groups in `build_tables.py` would help.

**Not done yet:** area selection (map box, typed bounds, date range), CSV
export, `/method` page, Vercel deploy. No Vercel project exists yet (team
"Modulark Tech" has none named emberline). No live URL yet.

**Exact next step:** step 3, area selection in `web/src/components/` using
`setArea({scope: "h3_parent", keys, label})`; `AoiMap.tsx` and `lib/aoi.ts`
are leftovers kept for it.

### Update, 2026-11-14 (later): steps 3–5 done

- **Area selection** (`51b6a9f`). Country selector, a box drawn on the MapLibre
  map or typed as S/W/N/E bounds; a box resolves to every
  H3 res-2 parent it touches and the calendar reports which are unprocessed.
  Verified in a headless browser: typed and drawn boxes update the inputs, the
  map and the calendar.
- **CSV export** (`7b4904f`). "Download CSV" writes the calendar on screen
  (area, series, date range) with a commented provenance header. Verified by
  downloading Portugal harmonized and reading the file.
- **`/method`** (`40a9646`). Plain-language method, held-out validation, the
  2012 step and the drift era, with the four annual fit figures and the
  detection-probability figure. Verified: page renders, all 5 images load.
  Literature box now says our P=0.5 points sit in the same order of magnitude
  as the 9–11 MW thresholds, a sanity check, not a target (as `docs/results.md`).
- MapLibre 6 looks for its worker next to its module; `web/scripts/copy-maplibre-worker.mjs`
  (run by `predev`/`prebuild`) copies it to `web/public/vendor/`.
- Polish pass: OpenFreeMap basemap now verified (positron + dark styles both
  200, tiles render, fallback notice only when the host is blocked), map no
  longer built twice in dark mode, initial view capped at 75°N so Arctic
  Canada shows, attribution no longer duplicated. Smoke: Portugal raw 2011 =
  1953, 2012 = 4128; CSV downloads; `next build` and lint pass.

**Not done:** Vercel deploy. Project creation returned 403 for this session's
Vercel connector, so the owner must create/import the project: repo
`modularktech-hash/emberline`, root directory `web`, framework Next.js,
production branch `main`. No live URL yet.

**Also:** the global data download was re-started in this session because the
data-host session ran out of usage.

### 14 Nov — live URL

https://emberline-tan.vercel.app/ (Vercel project created by the owner; deploys
`modularktech-hash/emberline` `main`, root `web`, on every push). Checked
logged-out with Playwright, iPhone 13 emulation and 1280 px desktop: `/` shows
the Portugal calendar with raw 2011 = 1,953 and 2012 = 4,128, `/method` renders
its tables, `/data/calendar_raw.parquet` answers range requests with 206, no
console errors, no horizontal overflow. Not yet checked on a physical phone.

### 14 Nov — data-contract additions after external review (session "app build")

`scripts/build_coverage_validation.py` (additive; no coefficient or published metric changed):

- `params_global.json`: `coef_ci_estimated` per country; `false` for the 41 pooled fits whose
  coefficient "intervals" are the point value twice. File otherwise byte-identical.
- `coverage_status.json`: reason-coded status for all 237 built countries. The 66 published
  `TypeError`s come from three lines of `fit_harmonization.py` (threshold-baseline `np.sqrt(None)`,
  31; null-control `float(None)`, 9; bootstrap `np.percentile` over `None`, 26). Each was re-run and
  the failing line matched the status derived from the counts. Result: 23 insufficient training,
  17 insufficient reference, 18 insufficient held-out variation, 8 no observations, 0 numerical.
  5 of the 66 (American Samoa, Antarctica, Maldives, Marshall Islands, South Georgia) have no raw calendar rows.
- `validation_points.json`: ≤300 held-out cell-month [observed, predicted] pairs per fitted country
  and a training-only multiplicative baseline. Model R² recomputed from the published b0/b1/κ matches
  the published R² to 1.8e-15. Model beats the scalar baseline on held-out R² in 84 of 171; does not
  in 87 (see `docs/results.md`). Lower MAE in 141 of 171.
- Contract for the web builder: `docs/data-contract-additions.md`. Check: `scripts/check_data_contract.py`.

## 14 Nov ~18:20 UTC — "app build" session: regression QA after the world-data switch

- **Done.** Perf/polish rules from `docs/handoff-web-ui.md` re-checked in `web/src` after `7a1b6ce..a1cd9ea`: no Lenis, custom cursor, progress bar or serif; one `backdrop-filter` (nav pill, inside `@supports`); scroll-linked code uses motion values or a rAF-throttled flag (SiteNav); `data-perf="low"` and reduced-motion rules intact; footer "Made by Modulark" → modularktech.com; hyparquet only in `queries.ts`. All held, nothing to fix.
- Routes (`/`, `/explorer`, `/seasons`, `/trends`, `/compare`, `/lab`, `/method`, `/satellites`, `/globe`, `/data`, `/about`, 404) at 390×844 and 1440×900, local build and live: correct status, 0 console errors, no sideways scroll, no NaN/undefined/null text.
- Explorer: Canada (own), Afghanistan (pooled, "pooled fit" pill), Spain and Egypt (flagged), Iceland (failed: "raw only · uncorrected" pill, harmonized view shows "No harmonized record here", no calendar). CSV header block present; CSV year sums equal the on-screen busiest-year values (e.g. Canada raw 2023 685,341; harmonized 100,295).
- **Defect fixed:** the 47 suspicious fits (`docs/results.md`) were shown with no warning. `web/src/lib/fitFlags.ts` ports the rules of `scripts/report_global.py`; Explorer shows a "check this fit" pill and the reasons; the harmonized CSV header gets `fit_flags` (`074b6ae`).
- **Defect fixed:** Explorer first calendar was 11.7 s on the world files (baseline 8.1 s on the four-country files; same harness, Fast-3G-like + 4x CPU, cold cache, median of 3). `queries.ts` now prefetches only the column chunks it decodes (raw `frp_sum_mw` skipped) and reads a 40 KB tail: 9.3 s (+15% vs baseline) (`7e2ff24`).
- Home headline numbers checked against `params_global.json` with a script: median own-fit R² 0.64 over 130, best Montenegro 0.93 (raw −10.1), beats raw VIIRS 171/171, four-country R²/raw values and Canada step ratios — all match.
- Light/dark: site is light-only (`color-scheme: light`); with dark OS preference it renders identically, readable.
- **Not done / next step:** the Explorer load is still bound by `params_global.json` (147 KB transferred) and the 349 KB harmonized country row groups; a further cut would need smaller country row groups in the published parquet (a data-file change, not done here). Live URL: https://emberline-tan.vercel.app/
