# AI session briefs — paste one per session

Each brief is self-contained: paste it as the **first message** of a fresh
session on this repository. Don't add "look around first" — the brief already
says what to read. One session = one brief. Plan in
[`gameplan-2person.md`](gameplan-2person.md).

**Run every session in the PUBLIC repo** (`shishirbhat/emberline`, created at
09:00 Saturday), after the import commit has brought CLAUDE.md and docs/ across.

Every brief ends with the same handoff rule, so a session that runs out of
budget leaves the next one a clean starting point.

**Verified the night before (2026-11-13), so no session needs to re-check:**
the web app builds (5 routes), the 84 ingest tests pass, and
`firms-ingest normalize → aggregate → climatology` runs correctly on real
staged archive *and* NRT files in under a second.

---

## A1 — Pipeline (Person A, Sat 09:30)

```
You are building the offline data pipeline for our NASA Space Apps project in
this repository. Read CLAUDE.md first; obey every hard constraint in it. Then
read docs/data-reference.md and docs/decisions/0001-static-parquet-read-path.md.
Do not read other docs unless stuck.

Data is already staged in data/raw/archive/ (FIRMS country CSVs: modis_YYYY_<Country>.csv
2001-2025, viirs-snpp_YYYY_<Country>.csv 2012-2025) and data/raw/nrt/.
Countries: Portugal, Chile (Australia, Canada may still be downloading).

The ingest library packages/firms-ingest already works on these files
(verified): `firms-ingest normalize`, `aggregate`, `climatology`. Its normalized
schema includes platform (Terra/Aqua/...), pixel_area_km2, source_type, daynight.
The default filters keep daytime, source_type 0, confidence nominal+.

Build scripts/build_tables.py that, for a list of countries, writes to
data/public/:

1. detections_<Country>.parquet — normalized point detections (default filters),
   with an added column lst_hours = local solar time = (UTC hour + lon/15) mod 24,
   computed PER DETECTION.
2. cell_day.parquet — H3 res 5, cell x day x sensor x platform. KEEP PLATFORM
   SEPARATE (Terra, Aqua, Suomi-NPP): the fit needs Aqua alone, and the existing
   aggregate command merges platforms, so aggregate yourself or extend it.
   Columns: h3, h3_parent (res 2), acq_date, year, month, doy, sensor, platform,
   n_detections, frp_sum_mw, frp_mean_mw, frp_max_mw, mean_pixel_area_km2,
   mean_lst_hours.
   SORT by h3_parent, then acq_date. Row groups ~50k rows. This sort order is
   required for the browser's HTTP range reads.
3. calendar_raw.parquet — per country AND per h3_parent: year x month raw
   detection counts and FRP sums, by sensor. This is the uncorrected calendar.

Then produce one chart, docs/figures/raw_counts_<Country>.png: annual raw
vegetation-fire counts, MODIS vs VIIRS, 2001-2025. It must show the 2012 jump.

Do NOT fit thresholds, correction factors or any harmonization model in this
session. That is session A2.

Verify: row counts reconcile against data/raw/MANIFEST.tsv after filters;
files are sorted as stated; the chart shows the jump. Run the ingest tests.

Before you run low on budget, or when done: write docs/session-notes.md
(append a dated section: done / not done / exact next step / any number you
produced and how), commit with a clear message, and push.
```

---

## B1 — App foundations (Person B, Sat 09:30)

```
You are building the web app for our NASA Space Apps project in web/ in this
repository. Read CLAUDE.md first; obey every hard constraint. Then read
web/AGENTS.md (Next.js rules — follow them), docs/decisions/0001-static-parquet-read-path.md,
and docs/challenge-statement.md (requirements R1-R12). Nothing else unless stuck.

Stack: Next.js App Router, TypeScript, Tailwind, MapLibre GL (not Mapbox),
hand-rolled SVG for the calendar, hyparquet for reading Parquet in the browser.
The app currently builds (5 routes) but reads Supabase. We have decided: NO
database, NO API server.

Do, in this order, committing after each:

1. Remove Supabase from the read path. Delete web/src/lib/supabase.ts, replace
   web/src/lib/useRpc.ts with a hook that range-reads Parquet via hyparquet,
   rewrite web/src/lib/queries.ts against it. Keep queries.ts as the ONLY place
   that touches hyparquet; pages consume queries.ts. Until real data exists,
   queries.ts reads web/src/lib/fixtures.ts behind the same interface.
2. Calendar heatmap (home page): MONTH x YEAR grid (12 columns x 2001-2025
   rows), cell = hotspot count. Accessible sequential colour ramp (colour-blind
   safe, readable in light and dark), named in a small legend. A Raw/Harmonized
   toggle that, until a fit exists, shows Harmonized as unavailable and every
   cell flagged "uncorrected" — never present a raw number as corrected.
3. AOI selection: draw a box on a MapLibre map AND type lat/lon bounds. Plus a
   date-range picker. Both feed queries.ts.
4. CSV export: hotspots for current AOI + date range, and the calendar matrix,
   each with a provenance header (AOI bounds, date range, sensors, filters,
   harmonization version or "uncorrected", retrieval date).
5. Deploy to Vercel from the public repo; confirm the deployed URL works logged-out on a phone. No NASA logos anywhere in the app.

Data contract (Person A is building these, in data/public/ → served from
web/public/data/): cell_day.parquet sorted by h3_parent (H3 res 2) then
acq_date, with columns h3, h3_parent, acq_date, year, month, doy, sensor,
platform, n_detections, frp_sum_mw; calendar_raw.parquet with year x month
counts per country and h3_parent. Filter range reads on h3_parent: H3 ids for a
map area are NOT a contiguous range, so never range-filter on raw h3.

Verify: `npx next build` passes; lint passes; the deployed page loads on a phone.

Before you run low on budget, or when done: write docs/session-notes.md
(append a dated section: done / not done / exact next step), commit, push.
```

---

## A2 — The fit and validation (Person A, Sat ~15:00)

```
You are fitting the MODIS/VIIRS harmonization for our NASA Space Apps project.
Read CLAUDE.md (every hard constraint applies — especially: fit on 2012-2021
only; local solar time per detection; Terra vs Aqua is not a null control).
Then read docs/session-notes.md, docs/research-findings.md sections 1-2, and
docs/priorities.md Tier 0 item 2 and Tier 1 items 5-6.

Inputs: data/public/cell_day.parquet and detections_*.parquet from session A1.

Do, in this order. Commit after each step. If a step fails, stop there and
ship what validated — a validated simple model beats an unfinished complex one.

1. BASELINE (must exist before anything else): one global FRP threshold.
   For Aqua MODIS vs Suomi-NPP VIIRS, daytime, 2012-2021, matched on the same
   H3 res-5 cell and date: find the FRP threshold T such that VIIRS detections
   with frp >= T best match Aqua counts per cell-day. Report R2, bias, RMSE.
2. HOLDOUT: refit on 2012-2018, test on 2019-2021. Report the same numbers.
3. NULL CONTROL: show Suomi-NPP alone has no step at 2012 that our correction
   claims to remove (it can't - but run the check across years for stability),
   and Aqua against itself 2012-2021 is stable.
4. PER LAND COVER thresholds if land cover is available; otherwise skip — do
   not block on it.
5. DETECTION PROBABILITY: logistic P(Aqua detects) =
   sigmoid(b0 + b1*log FRP + b2*log pixel_area) on matched VIIRS detections,
   2012-2021. Harmonized count per cell-day = sum of P_i over VIIRS detections.
   Bootstrap 200x for intervals. Report the FRP at P=0.5 and compare with the
   9-11 MW range reported in the literature (cite it as "thresholds of FRP
   detection", Laurent et al. 2019 citing Roberts & Wooster 2008 and Schroeder
   et al. 2010 — not Giglio).
6. DRIFT-ERA TEST: apply the 2012-2021 model to 2022-2025 and report how it
   degrades. If time allows, add lst_hours as a covariate and show whether it
   recovers. If not, state plainly that 2022+ is lower confidence.

Outputs:
- web/public/data/params.json: fit_version, method, coefficients, thresholds,
  intervals, fit_years, holdout_years, and every validation metric.
- data/public/calendar_harmonized.parquet (same shape as calendar_raw).
- docs/figures/: before/after calendar or annual-count chart; distribution
  overlap before vs after; detection-probability curve.
- docs/results.md: every number, how it was computed, on which years.

Every number must come from this fit. No placeholders. If something isn't
computed, write "not computed" — never invent.

Before you run low on budget, or when done: append to docs/session-notes.md,
commit, push.
```

---

## B2 — Wire it up and polish (Person B, Sun 09:00)

```
You are finishing the web app for our NASA Space Apps project. Read CLAUDE.md,
then docs/session-notes.md (what the earlier sessions did), then
docs/results.md and web/public/data/params.json (the real fitted numbers).

Do, in this order, committing after each:

1. Point queries.ts at the real Parquet files in web/public/data/ instead of
   fixtures. Confirm range reads only fetch the needed row groups (log bytes).
2. Raw/Harmonized toggle: load params.json, show harmonized counts. Animate the
   switch with Framer Motion — the ONLY animation in the app. The 2012 step
   should visibly vanish.
3. /method page: render numbers FROM params.json (never hard-coded): R2, bias,
   RMSE per fit and on holdout years, the null-control result, the
   detection-probability curve, the before/after distribution overlap, and the
   drift-era result with its honest caveat.
4. Anomaly view: last 7 days (NRT, NOAA-20/21 — labelled "not harmonized to the
   historical record") vs the historical median for those days of year.
5. A "Use this data" box with a ~15-line Python and JS snippet that range-reads
   our Parquet directly (filter on h3_parent). It must actually work — test it.
6. Empty states, loading states, mobile layout. Then `npx next build`, deploy,
   check the URL on a phone.

Do not invent numbers anywhere. Anything not in params.json shows "not
computed".

Before you run low on budget, or when done: append to docs/session-notes.md,
commit, push.
```

---

## Emergency brief (the reserve reset)

```
Our NASA Space Apps demo is in a few hours and something is broken. Read
CLAUDE.md and docs/session-notes.md. The problem: <DESCRIBE EXACTLY WHAT YOU
SEE, the URL, and the error text>. Fix only this. Do not refactor, do not add
features. Verify the fix with `npx next build` and by loading the deployed URL.
Commit and push.
```
