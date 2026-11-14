# Results — harmonization fit

Fit version `v1-20261114T0630`. Generated from `web/public/data/params.json` by session A2; every number below is computed by `scripts/fit_harmonization.py` on NASA FIRMS data. Re-run the script to reproduce.

**Unit:** Aqua-MODIS-equivalent daytime vegetation-fire detections. **Train:** 2012–2018. **Held-out test:** 2019–2021. **Drift era (never fitted):** 2022–2025. **Match rule:** same UTC date, H3 res-7 cell or its 6 neighbours.

## Validation on held-out years (H3 res-5 cell × month, vs observed Aqua MODIS)

| Country | Model R² (95% CI) | Model bias (95% CI) | Raw VIIRS R² | Single-threshold R² | Cell-months |
|---|---|---|---|---|---|
| Portugal | **0.27** (0.04–0.42) | -11.7% (-18.2 to -2.7) | -6.8 | -0.05 (T=40 MW) | 1,649 |
| Chile | **0.60** (0.49–0.69) | +0.4% (-4.3 to +5.2) | -7.7 | 0.49 (T=40 MW) | 7,474 |
| Australia | **0.81** (0.80–0.83) | +1.4% (+0.6 to +2.1) | -21.4 | 0.39 (T=30 MW) | 82,756 |
| Canada | **0.78** (0.72–0.83) | -13.5% (-16.1 to -10.8) | -31.9 | 0.59 (T=75 MW) | 18,091 |

A negative R² means worse than predicting the mean. Raw VIIRS counts fail badly everywhere; the detection-probability model beats both baselines in every country.

## Detection probability (fitted 2012–2018)

| Country | FRP at P=0.5 (95% CI) | κ (Aqua detections per Σp) | Training match rate | Training detections |
|---|---|---|---|---|
| Portugal | **7.3 MW** (7.2–7.5) | 0.503 | 58.7% | 26,736 |
| Chile | **9.3 MW** (9.2–9.4) | 0.570 | 50.1% | 100,714 |
| Australia | **4.6 MW** (4.5–4.7) | 0.313 | 58.7% | 4,819,951 |
| Canada | **2.8 MW** (2.7–2.9) | 0.219 | 66.4% | 1,021,749 |

Sanity check against the literature: MODIS "thresholds of FRP detection" are reported at 9–11 MW (Laurent et al. 2019, citing Roberts & Wooster 2008 and Schroeder et al. 2010). Our fitted P=0.5 points sit in the same order of magnitude. They are not the same quantity — ours is the FRP of a VIIRS detection at which Aqua also detects that fire — so close agreement is a sanity check, not a target.

## Null control: the 2012 step

Ratio of mean annual count 2012–2014 to mean 2009–2011. A value near the Aqua-only ratio means no artificial step.

| Country | Raw spliced (MODIS→VIIRS) | Aqua only (unchanged sensor) | Harmonized |
|---|---|---|---|
| Portugal | **1.50×** | 0.79× | 0.68× |
| Chile | **2.40×** | 0.91× | 0.81× |
| Australia | **3.69×** | 1.07× | 1.08× |
| Canada | **6.60×** | 1.43× | 1.68× |

## Drift era: observed Aqua ÷ predicted, with Aqua's mean local solar overpass time

Frozen-orbit years show the normal year-to-year scatter; the drift years are compared against it. Never used in fitting.

**Portugal** — frozen era 2012–2021 obs/pred range 0.82–1.26, Aqua LST 13.10–13.20 h

| Year | Observed Aqua | Predicted | Obs/pred | Aqua LST (h) |
|---|---|---|---|---|
| 2022 | 724 | 598 | 1.21 | 13.24 |
| 2023 | 450 | 366 | 1.23 | 13.38 |
| 2024 | 667 | 1,438 | 0.46 | 13.65 |
| 2025 | 1,595 | 2,061 | 0.77 | 14.40 |

**Chile** — frozen era 2012–2021 obs/pred range 0.82–1.29, Aqua LST 14.00–14.09 h

| Year | Observed Aqua | Predicted | Obs/pred | Aqua LST (h) |
|---|---|---|---|---|
| 2022 | 2,863 | 3,792 | 0.76 | 14.08 |
| 2023 | 5,857 | 6,705 | 0.87 | 14.22 |
| 2024 | 2,558 | 2,713 | 0.94 | 14.59 |
| 2025 | 3,197 | 3,767 | 0.85 | 15.01 |

**Australia** — frozen era 2012–2021 obs/pred range 0.93–1.06, Aqua LST 13.78–13.84 h

| Year | Observed Aqua | Predicted | Obs/pred | Aqua LST (h) |
|---|---|---|---|---|
| 2022 | 82,633 | 86,540 | 0.95 | 13.83 |
| 2023 | 173,969 | 174,584 | 1.00 | 14.07 |
| 2024 | 113,512 | 100,963 | 1.12 | 14.42 |
| 2025 | 123,569 | 126,314 | 0.98 | 14.99 |

**Canada** — frozen era 2012–2021 obs/pred range 0.67–1.75, Aqua LST 12.73–12.91 h

| Year | Observed Aqua | Predicted | Obs/pred | Aqua LST (h) |
|---|---|---|---|---|
| 2022 | 12,074 | 10,478 | 1.15 | 12.78 |
| 2023 | 103,044 | 100,295 | 1.03 | 12.99 |
| 2024 | 49,384 | 40,056 | 1.23 | 13.30 |
| 2025 | 51,073 | 48,244 | 1.06 | 13.85 |

## Limits — state these, don't hide them

- Fitted per country, which stands in for region; no land-cover stratification yet.
- Matching is spatial-temporal proximity (same UTC date, ~3.5 km), not pixel-footprint overlap.
- Cell-month scores are noisy at ~250 km² resolution; small-fire countries (Portugal) score lowest.
- The harmonized record from 2012 is derived from Suomi-NPP, which did not drift, so it is not exposed to Aqua's orbital drift. The drift-era table shows what a naive Aqua-based record would get wrong.
- Claims are regional; no global step correction is claimed.

## Figures

`docs/figures/fit_annual_<Country>.png` (raw vs harmonized vs observed Aqua), `docs/figures/fit_detection_probability.png`.
