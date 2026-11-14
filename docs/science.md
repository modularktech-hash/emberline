# The method

Read this twice. If everyone on the team can explain it, the science is safe in
any conversation with a judge or a mentor.

## 1. Why the record is broken

### Two sensor families

**MODIS** flies on Terra (launched 1999) and Aqua (2002). Its active-fire
detection works at roughly **1 km** resolution — the smallest patch of ground it
resolves is about a kilometre across.

**VIIRS** flies on Suomi-NPP (2011) and NOAA-20 (2017). Its fire channels work
at **375 m**, roughly seven times more area-precise.

### The primary problem: sensitivity

A better sensor sees smaller fires. VIIRS routinely detects small agricultural
burns and grass fires that MODIS cannot resolve at all. So from 2012 onward the
detection count rises sharply. **Nothing changed on the ground. Our ability to
see changed.**

Counting detections is therefore scientifically meaningless across the sensor
boundary. A plot of "hotspots per year, 2000–2026" is a chart of satellite
technology history.

### Three secondary problems

1. **Different overpass times.** Each satellite crosses a given point at a fixed
   local solar time. Fires have a strong daily cycle, typically peaking
   mid-afternoon. A satellite passing at 10:30 and one passing at 13:30 see
   genuinely different amounts of fire on the same day, for reasons that have
   nothing to do with resolution.
2. **Different confidence scales.** MODIS reports 0–100. VIIRS reports
   low/nominal/high. These are not interchangeable and there is no official
   conversion.
3. **Non-fire heat sources.** Both sensors detect anything hot — gas flares,
   volcanoes, industrial furnaces. Unfiltered, these appear as permanent fires.

### The lucky break

**Aqua/MODIS and Suomi-NPP/VIIRS have nearly the same local overpass time,
around 13:30.** That removes the diurnal-cycle problem between those two
specifically. And they have flown simultaneously since 2012, giving a long
overlap period in which both instruments observed the same fires.

That overlap is training and validation data. The correction is fitted against
observation, not assumed.

## 2. The core claim

> **Pre-event design, partly superseded.** Sections 2 and 3 below are the plan
> written before the event. The published fit (`v1-20261114T1240`) uses a
> per-country logistic co-detection model instead of land-cover FRP censoring;
> section 2a describes exactly what the code does.

> Do not harmonize counts. Harmonize energy, under a common detection limit.

Every detection carries **Fire Radiative Power** (FRP) in megawatts, estimating
the energy the fire radiates. Energy is a physical quantity that means the same
thing regardless of instrument. A count is not.

Energy alone is still not enough, because VIIRS contributes a population of tiny
fires MODIS never saw. So two things happen together.

### Step 1 — Censoring

Find the minimum FRP above which MODIS and VIIRS agree, and discard everything
below it from the VIIRS record. This artificially degrades VIIRS to
MODIS-equivalent sensitivity.

The threshold is **not one global number**. It is fitted separately per land
cover class, because the size at which a fire becomes detectable differs sharply
between boreal forest, savanna and cropland.

Censoring must happen **before** aggregation, so the pipeline applies it once the
thresholds are known and stores the censored aggregate alongside the raw one
(`frp_sum_censored_mw` in `fire_cell_day`).

### Step 2 — Fitting and validating

On the overlap period, check whether censored VIIRS now agrees with MODIS.
Report **R², bias and RMSE per biome** on spatially aggregated cells — not on
individual detections, which are far too noisy to fit against.

Then derive conversion factors and apply them to the MODIS-only years before
2012, producing one continuous series:

```
harmonized = slope * frp_sum + intercept        (MODIS era)
harmonized = frp_sum_censored                   (VIIRS era)
```

### Step 3 — Proving we did not cheat

Two independent checks:

- **Holdout years.** Fit on some overlap years, test on others the model never
  saw. A large gap between fit R² and holdout R² means the fit is memorizing.
- **An independent product.** Cross-check against **MCD64A1**, a burned-area
  dataset derived by a completely different method — detecting the burn scar
  left behind rather than the active flame. If the harmonized active-fire series
  tracks burned area, the correction is measuring something real.

### Step 4 — Cleanup that shows we read the documentation

Three cheap details that raise credibility a lot:

1. **Filter the `type` field** to keep vegetation fires (0) and drop volcanoes
   (1), static land sources such as gas flares (2), and offshore detections (3).
2. **Build an explicit, documented mapping** between the two confidence scales
   instead of pretending they are the same. Both are projected onto the coarser
   three-class scale; the reverse direction is refused.
3. **Cluster detections into fire events.** One real fire is detected separately
   by Terra, Aqua, Suomi-NPP and NOAA-20 on the same day, so raw detections
   overcount — and overcount *differently* on either side of 2012. Space-time
   DBSCAN collapses them into single events, which is also the unit a land
   manager actually counts in.

## 2a. What the published fit does (`scripts/fit_harmonization.py`, fit `v1-20261114T1240`)

### Held-out evaluation population

Every published R², bias, RMSE (and the MAE in `validation_points.json`) is
computed on one table per country, built in `fit_country.evaluate()`:

- **Unit:** one row per H3 resolution-5 cell × calendar month (UTC year and
  month of the detection), held-out years 2019–2021. The cell is the res-5
  parent of each detection's location; only that country's FIRMS archive is
  used, so a cell straddling a border holds only the detections assigned to
  this country.
- **Rows included:** the full outer join of four cell-month aggregates —
  observed Aqua detections, model prediction (Σ κ·P over Suomi-NPP
  detections), raw Suomi-NPP count, and the Suomi-NPP count above the
  threshold-baseline cut-off. In practice a cell-month is in the table if
  **Aqua or Suomi-NPP recorded at least one filtered detection there**
  (daytime, vegetation type, same filters as the calendar). Missing values in
  the join are filled with 0.
- **Rows excluded:** cell-months where neither sensor detected anything. These
  are not in the denominator at all; the table is not every possible cell-month
  of the country. Including the (many) both-zero cell-months would raise R²
  mechanically and shrink RMSE/MAE, so the scores are conditional on activity
  in at least one record.
- **Zeros that are included:** cell-months with Suomi-NPP detections but no
  Aqua detection enter with observed = 0, and Aqua-only cell-months enter with
  prediction = 0. In the published validation sample (`validation_points.json`,
  ≤ 300 cell-months per country, 48,645 in all) 63.7% of sampled cell-months
  have observed Aqua = 0 (per-country median 65%, range 30–95%) and 5.4% have
  Aqua > 0 with no Suomi-NPP detection. These shares come from the sample,
  which weights each country equally; they are not population totals.
- **Scale:** counts per cell-month, untransformed and unweighted, pooled across
  all cells and the 36 held-out months. R² = 1 − SS_res/SS_tot with SS_tot
  around the mean of this table, so a negative R² means worse than predicting
  that mean for every row; it is not a percentage of fires detected.
  bias_pct = 100·(Σpred − Σobs)/Σobs over the table. RMSE and MAE are per
  cell-month, in detections.
- **Intervals:** the 95% intervals on held-out R² and bias resample H3 res-5
  cells with replacement (200 draws), each drawn cell carrying all its
  cell-months; they describe the spread of the score, not an interval on any
  month's count.
- **Same table for every baseline:** raw VIIRS, the FRP threshold and the
  training-only ratio baseline (`scripts/build_coverage_validation.py`) are
  scored on the identical rows. Note that the threshold and ratio baselines,
  like the model, predict zero exactly where Suomi-NPP saw nothing.

## 3. Things that will go wrong

- **Fitting on individual detections instead of aggregated cells.** Detection-level
  matching between a 1 km and a 375 m sensor is a pixel-overlap problem, not a
  fire problem. Aggregate first.
- **One global threshold.** Defensible as a fallback, but report it as one. Do
  not present a global fit as a per-biome one.
- **Including night detections in the fit.** Night detections come from a
  different point in the diurnal cycle and a different orbit geometry. The
  overpass-time argument only holds for the daytime pass.
- **Forgetting that the correction is an aggregate claim.** It is fitted on
  seasonal aggregates over cells. Applying it to a single afternoon's detections
  implies a precision it does not have — which is why the live view shows raw
  hotspots and says so.

## 4. Degradation order

If the science is slipping, drop in this order. A validated simple model beats
an unfinished complex one every time.

1. Live near-real-time layer
2. Anomaly percentile bands
3. Per-biome factors → fall back to one global threshold
4. Multi-area support

**The irreducible core:** one area of interest, one harmonized 25-year calendar,
one validation number. That alone is competitive.

## Reading

- Giglio et al., MODIS Collection 6 active fire product — the MODIS vocabulary
- Schroeder et al., VIIRS 375 m active fire validation — the VIIRS vocabulary
