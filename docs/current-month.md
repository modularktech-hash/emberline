# Current-period comparison (Plan Combat E07)

Status: **prototype, scoped**. No validated harmonized current anomaly exists.
What exists: a same-platform comparison of a recent NOAA-20 window against
NOAA-20's own history for the same calendar days. Output:
`web/public/data/current_month.json`, built by `scripts/build_current_month.py`
(data fetched by `scripts/fetch_noaa20_archive.sh`), 14 Nov 2026.

## Decision

- The harmonized history is **Aqua-equivalent**, fitted on 2012–2021 only.
  After 2021 Aqua drifts (`docs/research-findings.md` §1), so "Aqua-equivalent
  in Nov 2026" has no fixed definition. We do not extend it to now.
- A NOAA-20 → Suomi-NPP → Aqua bridge is not built: Suomi-NPP's NRT feed is
  empty since 13 Nov 2026, so there is no current overlap to validate a bridge on.
- **Defensible target: raw NOAA-20 vs NOAA-20-only history**, same filters,
  same calendar window, same country membership test. No cross-sensor step.
- It is **not month-to-date**: the keyless NRT feed reaches back 7 days. The
  window is the complete UTC days inside it (8–13 Nov 2026, 6 days).

## Evidence: historical series vs live layer

| | Historical harmonized series | Live layer (`build_live.py`) |
|---|---|---|
| Platform | Aqua MODIS (+ Suomi-NPP mapped to Aqua-equivalent), 2003–2025 | NOAA-20, NOAA-21 VIIRS + MODIS (Terra+Aqua) NRT |
| Filters | type 0 only, confidence nominal/high, daytime, FRP > 0 | day **and night**, no confidence filter |
| Thermal source type | vegetation only (type 0) | NRT has **no `type` column**: volcanoes, gas flares, static industry included |
| Processing | standard (science) archive | NRT (2.0NRT), provisional |
| Country | FIRMS country files | none (0.5° global grid) |
| Overpass | Aqua 13:30 frozen to 2021, drifting after | NOAA-20/21 ~13:30, stable |

Every row is an incompatibility; dividing a live total by the harmonized median
would be wrong.

Data found today:
- NOAA-20 **is** in the FIRMS country archive under slug `viirs-jpss1`
  (earlier docs said NRT-only). Starts 2018-04-01, has `type`. Fetched
  2018–2025 for Canada, Portugal, Chile, Australia (32 files, sequential).
- NRT `J1_VIIRS_C2_Global_7d`: 2026-11-07 00:56Z to 2026-11-14; first and last
  days partial, so 8–13 Nov kept.

## What the prototype does

Both sides: NOAA-20, daytime, confidence nominal/high, FRP > 0, **no type
filter** (because NRT cannot be filtered), point-in-polygon against
`web/public/geo/countries.geojson`. History: same 8–13 Nov window in each of
2018–2025 (n = 8). Reported per country: count, per-year history, median, IQR,
absolute deviation, ratio (median > 0 only), percentile (mid-rank vs 8 years),
polygon capture of FIRMS's own country assignment, and the type ≠ 0 share of
the history window. All values are in the JSON; none are copied here.

Checks shown by the run: polygon capture is ≥ 0.97 for Canada, Chile and
Australia but **0.84 for Portugal** (110 m outline misses coastal points), so
Portugal's count is low-biased on both sides equally but should be labelled.
Type ≠ 0 share in history is about 10% for Chile (static sources), ≤ 1.3%
elsewhere — the size of the contamination the current count cannot remove.

## What is missing, and what closes it

1. **Month-to-date**: a FIRMS MAP_KEY (area API, ≤10 days per call, chained)
   for day 1 to today. Then the same script with a longer window.
2. **NRT vs standard validation**: NRT and archive differ in processing. A
   period with both NRT and standard NOAA-20 files for the same days would
   quantify it; we have none archived.
3. **Type filter on NRT**: a static-source mask built from archive type 2/3
   locations, applied spatially to NRT (and to history for symmetry).
4. **Finer polygons** (Natural Earth 10 m) for small/coastal countries.
5. **A harmonized "now"**: needs a validated NOAA-20 ↔ Suomi-NPP overlap
   (2018–2025 archive exists for both; not fitted) and a definition of the
   target that does not depend on drifting Aqua.

## UI card spec (for the UI session; fields only)

Title: "Recent NOAA-20 activity vs NOAA-20's own past" — badge "Provisional · not harmonized".
- Area (country name)
- Window: `window_utc[0]`–`window_utc[1]`, `elapsed_days` days; acquisition cutoff `acquisition_cutoff_utc`
- Count this window: `count_to_date`
- Same window, `reference_years` range: median `history_median`, IQR `history_iqr`, n = `n_years`
- Difference: `abs_deviation`; ratio `ratio` (hide when null)
- Percentile vs past years: `percentile_vs_history` (say "of 8 years")
- Coverage: `completeness`; `month_to_date_note`
- Caveats line: `filters`; history non-vegetation share `history_nonveg_type_share_mean`; polygon capture `history_polygon_capture_mean` (warn below 0.95)
- Footer: "Different platform from the harmonized calendar. Describes observed detections, not fire spread or risk."
Do not place this card's numbers on the harmonized calendar scale.

## Submission wording

> For recent days we show a separate, provisional comparison: NOAA-20 VIIRS
> near-real-time detections for the last complete days, against NOAA-20's own
> standard archive for the same calendar days in 2018–2025, with identical
> daytime, confidence and FRP filters. It is not harmonized to the Aqua-based
> calendar, it is not month-to-date (the keyless feed covers seven days), and it
> cannot exclude volcanoes and industrial heat sources because the real-time
> files do not label them. We have not built a validated bridge from today's
> sensors to the 2003–2025 harmonized record; closing that needs a fitted
> NOAA-20/Suomi-NPP overlap and a target that does not depend on Aqua's
> post-2021 orbital drift.
