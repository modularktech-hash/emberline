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
