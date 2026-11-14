# Data-contract additions (fit v1-20261114T1240)

Additive only. No fitted coefficient or existing metric changed. Built by
`scripts/build_coverage_validation.py`, checked by `scripts/check_data_contract.py`.
All files live in `web/public/data/`.

## 1. `params_global.json` — new field per country

`countries.<Country>.coef_ci_estimated: boolean` (placed after `kappa_source`).

- `true`: own fit; `logistic.b0_ci95`, `logistic.b1_ci95` and
  `frp_at_p50_ci95_mw` come from bootstrap resampling of the training detections.
- `false`: borrowed (pooled) curve; resampling was skipped, so those three
  "intervals" are the point value twice. **Do not draw them as an interval.**
  Show: "Coefficient uncertainty not estimated for this borrowed model."
  Always equals `fit_source === "pooled"` (41 countries).

`kappa` has no interval for any country. Nothing else in the file changed
(diff is the added lines only).

## 2. `coverage_status.json` — new

```ts
{
  fit_version: string;
  statuses: Status[];                       // the fixed vocabulary, in order
  summary: Record<Status, number>;          // counts, sum = n_countries
  n_countries: 237;
  thresholds: Record<string, string|number>; // exact rule behind each status
  count_definitions: Record<string, string>;
  has_raw_calendar: string;                  // definition
  countries: Record<CountryKey, {
    status: Status;
    fit_source: "own" | "pooled" | null;     // null when not fitted
    kappa_source: "own" | "pooled" | null;
    condition: string | null;                // for failures: the exact code condition
    published_error?: string;                // failures only: the TypeError in params_global `failed`
    reproduced_on_rerun?: boolean;           // failures only: fit_country failed again at the same line
    counts: {
      n_train_viirs: number; n_train_aqua: number;      // 2012–2018 detections
      n_train_viirs_frp_ge_100: number;                 // training Suomi-NPP with FRP ≥ 100 MW
      n_test_viirs: number;  n_test_aqua: number;       // 2019–2021 detections
      n_train_cell_months: number; n_test_cell_months: number; // H3 res-5 × month
      n_test_cell_months_with_aqua: number;
      n_test_cells: number; n_test_cells_with_aqua: number;
      n_modis_2009_2011: number; n_any_2012_2014: number; // null-control windows
    };
    has_raw_calendar: boolean;        // has scope='country' rows in calendar_raw_global.parquet
    has_harmonized_calendar: boolean; // has scope='country' rows in calendar_harmonized_global.parquet
  }>;
}
type Status = "own_fit" | "borrowed_fit" | "insufficient_training_observations"
  | "insufficient_reference_observations" | "insufficient_heldout_variation"
  | "numerical_fit_failure" | "no_observations";
```

`CountryKey` is the same underscore name used in `params_global.json`.

Status meanings (thresholds are the conditions on which `fit_harmonization.py`
actually fails; every failure was re-run and the failing line matched):

| Status | Rule |
|---|---|
| `own_fit` | fitted with its own curve (≥ 5,000 Suomi-NPP training detections) |
| `borrowed_fit` | fitted with the pooled curve (< 5,000); κ also pooled if < 500 Aqua training detections — see `kappa_source` |
| `insufficient_training_observations` | zero Aqua detections 2012–2018 (no training target) and no Suomi-NPP training detection with FRP ≥ 100 MW. The threshold-baseline search (T up to 100 MW) then meets an empty training cell-month table and `np.sqrt(None)` raises. No minimum above zero is coded |
| `no_observations` | no Aqua and no Suomi-NPP detections at all in 2012–2021 |
| `insufficient_reference_observations` | null-control window empty (no MODIS 2009–2011 or nothing 2012–2014; `float(None)` in `mean_years`), or no held-out Aqua 2019–2021 (R² and bias undefined) |
| `insufficient_heldout_variation` | held-out Aqua exists but sits in so few cells that a cell-bootstrap resample has zero variance or zero total; `np.percentile` over a list containing `None` fails |
| `numerical_fit_failure` | reserved: re-run did not fail where the counts predict (0 expected) |

UI: anything other than `own_fit` / `borrowed_fit` has no harmonized series —
show raw only, flagged uncorrected, and only if `has_raw_calendar`.

## 3. `validation_points.json` — new

```ts
{
  fit_version: string; test_years: [2019, 2021]; train_years: [2012, 2018];
  unit: string; points_format: string; sampling: string;
  baseline_definition: string; metric_definitions: string;
  summary: { model_beats_baseline: number; baseline_beats_or_ties_model: number; undefined: number };
  countries: Record<CountryKey, {            // the 171 fitted countries
    fit_source: "own" | "pooled";
    model: Metrics;                           // r2 equals params_global r2 (|Δ| ≤ 1e-6)
    baseline_multiplicative: (Metrics & { ratio: number }) | null;
    model_beats_baseline_r2: boolean | null;  // strict model.r2 > baseline.r2
    n_points_total: number;                   // held-out cell-months before sampling
    points: [number, number][];               // [observed Aqua, model prediction], ≤ 300
  }>;
}
type Metrics = { r2: number|null; bias_pct: number|null; mae: number; rmse: number; n_cell_months: number };
```

Points are held-out H3 res-5 cell × month values (2019–2021), the same table the
published R² uses, including cell-months where Aqua saw nothing. The baseline
is one country-wide ratio, Aqua ÷ Suomi-NPP detections over 2012–2018, applied
to each held-out cell-month's raw Suomi-NPP count.

## 4. Proposed Method-page copy — evaluation population (for the web builder to place)

> **What the scores are computed on.** Each held-out score compares, for every
> H3 resolution-5 cell (~250 km²) and month in 2019–2021, the number of Aqua
> MODIS detections with the model's Aqua-equivalent estimate. A cell-month is
> included when Aqua or Suomi-NPP VIIRS saw at least one fire there; months when
> neither saw anything are left out, so the scores describe agreement where at
> least one record saw fire, not across every square kilometre. Cell-months
> where only VIIRS saw fire count as an observed zero. Counts are compared as
> they are (no log), and R² is measured against the average of this table, so a
> negative R² means the estimate did worse than that average. The intervals
> resample whole cells and describe the uncertainty of the score, not of any
> single month's count. Raw VIIRS, the FRP cut-off and the single-ratio baseline
> are scored on exactly the same cell-months.

## 5. Proposed Method-page copy — borrowed curves (for the web builder to place)

> **Borrowed curves.** 41 countries have too few training detections (under
> 5,000 Suomi-NPP detections in 2012–2018) for a curve of their own. They borrow
> one shared curve whose two coefficients, and κ, are the averages of 61 larger
> countries' fitted values, each weighted by how many training detections that
> country had. This is an average of coefficients, not a model fitted to all
> those detections at once. No uncertainty is estimated for a borrowed curve.
> Because none of these 41 countries helped build the curve, their 2019–2021
> scores show how well it transfers: median held-out R² −0.09 (24 of 41 below
> zero) against 0.64 for countries with their own curve. Treat borrowed-curve
> results as experimental.

## 6. `season.json` — incomplete fire years (additive)

```ts
// per country, per entry of years[]
partial?: ("raw" | "harm")[];   // series whose fire-year window is not fully inside the record
// top level
partial_note: string;
```

A fire year starts at the country's quietest month. Label: start month 1 → the calendar year;
2–6 → the year it starts in; 7–12 → the year it ends in. A window that runs past 31 Dec 2025
(start months 2–6, label 2025), or starts before a series has data (harmonized = Aqua from
4 Jul 2002, so start month 7, label 2003), is listed in `partial`; that series' onset, peak, end,
length and total are null and the year is excluded from the trend. The app should show such a
year as "incomplete", not as a low or missing season. Checked by `scripts/check_seasons.py`.

## 7. `manifest.json` v2 — named, versioned datasets (E16)

`manifest.json` now has `manifest_version: 2` and a `datasets` object. Each
dataset (`world`, `fallback_four_country`, `live`) lists its member files with
their sha256, its single `fit_version`, its `params_file`, and `consistent` /
`problems`. `mixing_rule` states the rule in words.
`scripts/check_data_contract.py` fails if any member's fit version differs
from its dataset's, if a member hash differs from its file entry, or if a
dataset's harmonized calendar country set differs from its params file's
fitted countries. The fallback files are kept.

**Which files may be combined** (read from `web/src/lib/queries.ts`, `data.ts`):

| Set | Files | Fit |
|---|---|---|
| world | `params_global.json`, `calendar_raw_global.parquet`, `calendar_harmonized_global.parquet`, `countries.json`, `season.json`, `drift.json`, `coverage_status.json`, `validation_points.json` | v1-20261114T1240 |
| fallback_four_country | `params.json`, `calendar_raw.parquet`, `calendar_harmonized.parquet`, `cell_day.parquet` | v1-20261114T0630 |
| live | `live.json`, `tle.json` | none (raw) |

**Mixing paths found in the current code (reproduced by reading, not in a browser):**

1. `queries.ts` `getParams()` (≈l.234–252) and `openTable()` (≈l.341–352,
   used by `loadRaw` and `loadHarmonized`) each walk `FILESETS` **independently**.
   If `params_global.json` fails but the calendars load, the world calendars
   are shown with the four-country fit (and vice versa); if only
   `calendar_harmonized_global.parquet` fails, raw is world and harmonized is
   four-country.
2. `Explorer.tsx:289` labels the files from `data.raw.dataset` only, so case 1
   is labelled "world" while params/harmonized came from the fallback.
3. `data.ts` `getSeason`, `getCountryTable`, `getDrift` (l.70–72) are world-only
   with no fallback; when params/calendars have fallen back, these still show
   world v1-20261114T1240 values beside four-country v1-20261114T0630 values.

**Hand-off to the UI session (web/src, not edited here):**

- `queries.ts`: resolve the dataset **once**. Add `let datasetPromise: Promise<DataSet>`
  and `resolveDataset()`: try all three world files (`params_global.json` +
  the two `_global` parquet footers); if any fails, use `"four"` for all three.
  Make `getParams()` and `openTable(kind)` take the file name from
  `FILESETS[kind][dataset === "world" ? 0 : 1]` instead of looping. After load,
  assert `params.fit_version` equals the fit version for that dataset in
  `manifest.json` (`datasets[<world|fallback_four_country>].fit_version`);
  on mismatch throw (refuse) rather than render.
- Export `currentDataset(): Promise<{ dataset: DataSet; fitVersion: string }>`
  and use it for `Explorer.tsx:289` and `:367` instead of `data.raw.dataset` / `p.dataset`.
- `data.ts`: `getSeason`, `getCountryTable`, `getDrift` and the coverage /
  validation readers must refuse (show "unavailable with the fallback data")
  when `currentDataset()` is `"four"`, and must check their own `fit_version`
  equals the world dataset's.
- Show the fallback status visibly in a site-wide banner (not only Explorer's
  footnote): "World data failed to load — showing the four-country fallback
  (fit v1-20261114T0630)". Verify by blocking `params_global.json` in DevTools
  (Network → Block request URL): every page must show the banner, and no page
  may show world summaries.

## 8. Trend uncertainty and monthly precision (E31, E32) — additive

Built by `scripts/build_insights.py` (rebuilt with
`EMBERLINE_DETECTIONS=data/public:data/global_public EMBERLINE_KEEP_RESOLUTION=<copy of published season.json>`;
every pre-existing field is byte-for-byte unchanged, checked by stripping the new keys and comparing).

`season.json`, top level: `trend_note` (the definition below, in words).

`season.json`, per country:

- `trend_stats.{raw,harm}_{onset,peak,end}` (peak = 50% midpoint):
  - `n_years`, `first_year`, `last_year` — usable fire years (non-null, not partial).
  - `slope_per_decade` — identical to `trend_days_per_decade[...]` (asserted).
  - `se_per_decade` — OLS slope standard error × 10.
  - `ci95` — `[slope − t·se, slope + t·se]`, t = Student-t 0.975 quantile with n−2 df.
  - `drop_first3`, `drop_last3` — slope after dropping the first / last 3 **usable**
    years; null if fewer than 8 usable years remain.
  - `sensitivity_range` — `[min, max]` of full, drop_first3, drop_last3.
  - All null except `n_years` when fewer than 8 usable years (no trend published).
- `trend_approximate` — true for the five monthly-resolution countries
  (Barbados, Estonia, Mauritius, Slovenia, Solomon_Islands): their dates are
  interpolated within months, not observed.

`countries.json`, per row: `onset_trend_raw_ci95`, `onset_trend_harm_ci95`,
`onset_trend_harm_n_years`, `onset_trend_harm_sensitivity`, `onset_trend_approximate`.

**These are descriptive.** The CI assumes independent, homoscedastic residuals
and a linear trend; none is tested. Wording to use: "descriptive least-squares
trend; 95% interval assumes independent years". A CI that spans zero, or a
sensitivity range that changes sign, must not be read as a shift.

**Hand-off to the UI session:** `TrendsPage.tsx` (trend cells, country table)
— show `ci95` and `n_years` beside each slope, and the sensitivity range on
hover/detail; label the column "descriptive"; for `trend_approximate` prefix
dates with "≈" and say "monthly estimate". Types to add in `lib/data.ts`:
`trend_stats?: Record<string, TrendStats>`, `trend_approximate?: boolean` on the
season country, and the five `onset_trend_*` fields on `CountryRow`.

## 9. `live.json` — explicit FRP-sum metadata (E36) — additive

Reproduced from `scripts/build_live.py`: each 0.5° cell's `frp_sum_mw` is the
sum of the `frp` column over **every detection from every listed platform and
overpass in the window** (24 h: NOAA-20 + NOAA-21 + MODIS; 7 d: NOAA-20 +
MODIS). A cell seen on several overpasses is counted several times, so the
value is neither instantaneous power nor energy. "Hottest cells" are ranked by
this sum. Nothing in `cells` or `totals` changed.

New fields: top level `field_definitions` (one string per cell column) and
`hottest_cells_rank_by: "frp_sum_mw"`; per window `platforms`,
`detections_total`, `frp_sum_definition`, `window_start_utc`,
`window_end_utc`. The current snapshot (fetched 2026-11-14T11:10Z) was
annotated without a refetch, so its window start/end are `null` with a
`window_span_note`; `python3 scripts/build_live.py` (next refresh) fills them
from the first/last `acq_date`+`acq_time`. Use `--annotate-only` to add the
metadata without fetching.

UI wording (Globe hottest-cells list and tooltip): label the column
"Summed FRP (MW·detections)" or "Σ FRP", with the note **"sum of reported FRP
across detections in this window — not instantaneous power or energy"**; show
`detections`, `frp_max_mw` and `satellites` beside it; show the window as
start–end UTC when present, else the `dates` list.

## 10. `harmonized_uncertainty.json` — coefficient-only intervals (E27) — new

Per country: `status` ("estimated" | "not estimated" for pooled curves),
`annual` {year: [point, lower, upper]} and `monthly` {"YYYY-MM": [...]} from
2012 on, in Aqua-equivalent detections; `covers.included` / `covers.not_included`
lists what the interval does and does not contain. Display as a thin band or
"95% coef. interval" beside harmonized totals. Required label: **"Range from
fit-coefficient uncertainty only — excludes κ, model-form, matching-rule and
drift uncertainty."** Never call it a confidence interval of the fire count.
Pooled countries: show "uncertainty not estimated". Method in `docs/science.md` §2a.
