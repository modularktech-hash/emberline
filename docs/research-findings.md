# Research findings

Deep research round, 2026-10-29 to 2026-11-02. Three findings change the
project materially. Read §1 even if you read nothing else.

Everything here is either measured from free public data with a script in
`scripts/`, or cited to a source. **Nothing here is a result of our
harmonization** — that is still unbuilt, by design.

---

## 1. Terra and Aqua have left their frozen orbits. Measured.

### What the documentation says

Terra and Aqua both began drifting around **2022**. NASA's own figures:

| Satellite | Nominal | Drifting to | By |
|---|---|---|---|
| Terra | 10:30 descending | **08:30** | late 2026 |
| Aqua | 13:30 ascending | **15:30** | late 2026 |

Terra's altitude is also falling, ~715 km → ~702 km. Perigee-lowering
manoeuvres were planned for Aqua in July 2026 and Terra in 2027.

**End of science operations** (sources conflict — verify before quoting):
NASA Science gives Terra February 2027 and Aqua September 2027; NASA's April
2025 MODIS-to-VIIRS transition document gives Aqua ~August 2026 and Terra
~January 2027. Either way, **MODIS ends within months of this event.**

Sources: [NASA AGU 2024 poster](https://ntrs.nasa.gov/api/citations/20250000522/downloads/AGU24_Terra_25years_MODIS_geometry_poster_GLin.pdf),
[MODIS STM 2023 geometric calibration](https://modis.gsfc.nasa.gov/sci_team/meetings/202305/presentations/cal/08_Lin_MODISGEO.pdf),
[Terra: The End of An Era](https://science.nasa.gov/science-research/earth-science/terra-the-end-of-an-era/),
[LAADS MODIS→VIIRS transition](https://ladsweb.modaps.eosdis.nasa.gov/learn/modis-to-viirs-transition/MODIS-VIIRS_Transition.pdf).

### We measured it ourselves, on three continents

`scripts/measure_overpass_drift.py <Country>`. Mean **local solar time** of
daytime vegetation-fire detections, per satellite per year. Local solar time is
computed per detection as `UTC + longitude/15`.

**Aqua** (nominal 13:30):

| Country | 2015 | 2021 | 2023 | 2025 | Δ 2021→2025 |
|---|---|---|---|---|---|
| Chile | 14.02h | 14.05h | 14.22h | **15.01h** | **+0.96h** |
| Portugal | 13.20h | 13.14h | 13.38h | **14.40h** | **+1.26h** |
| Australia | 13.79h | 13.78h | 14.07h | **14.99h** | **+1.21h** |

**Terra** (nominal 10:30):

| Country | 2015 | 2021 | 2023 | 2025 | Δ 2021→2025 |
|---|---|---|---|---|---|
| Chile | 10.14h | 10.10h | 9.74h | **9.12h** | **−0.98h** |
| Portugal | 11.06h | 10.98h | 10.50h | **9.85h** | **−1.13h** |
| Australia | 10.34h | 10.29h | 9.86h | **9.13h** | **−1.16h** |

Flat to 2021 on all three continents, then diverging in lockstep. Chile's
Terra–Aqua separation goes from **3.90h (pre-2022) to 5.52h (2024+)**.

This is an orbital fact, so it applies to every AOI on Earth.

### Why this is the most important thing in this document

**Our entire method rested on "Aqua and Suomi-NPP share the ~13:30 overpass, so
the diurnal-cycle problem cancels."** That was true for 2012–2021. It is false
now and getting worse every month. By 2025 Aqua is ~1.2h later than Suomi-NPP.

Three consequences:

1. **The fitting window is 2012–2021, not 2012–present.** Fitting on drifted
   years bakes the drift into the correction factors.
2. **2022+ needs its own treatment.** Either model the drift (see §2) or label
   those years as lower-confidence. Do not silently extend the 2012–2021 fit.
3. **The pitch changes tense.** "MODIS is being retired" is not a future
   concern. MODIS is *already degrading in a measurable way*, and we can show
   it on stage from public data.

### This also partly explains the ratio growth

`docs/data-reference.md` records Chile's VIIRS/MODIS count ratio rising from
2.47× (2012) to 4.43× (2024). The drift pushes MODIS away from the diurnal
peak, lowering its counts, which inflates that ratio.

**But the drift cannot be the whole story.** The ratio was already climbing
2012→2021 (2.47 → 3.73) while the orbits were still frozen. So there is a
second cause, still unidentified. Candidates:

- Collection/algorithm version changes (archive `version` differs across years:
  `6.2` in 2001 files, `61.03` in 2023 files).
- Genuine increase in small-fire activity that only VIIRS can see.
- Changes in the VIIRS processing baseline.

**One hypothesis is now dead:** NOAA-20 joining in 2018 is *not* the cause,
because NOAA-20 is not in the country archive at all (§3). The `viirs-snpp`
files are Suomi-NPP only, verified — `satellite` has the single value `N`.

Do not claim the drift explains the whole ratio growth. It does not.

---

## 2. The fire diurnal cycle is narrow, published, and parameterized

This is what turns the drift from a fatal limitation into a correctable effect.

**Andela, N., Kaiser, J. W., van der Werf, G. R., Wooster, M. J. (2015).** "New
fire diurnal cycle characterizations to improve fire radiative energy
assessments made from MODIS observations." *Atmospheric Chemistry and Physics*,
15, 8831–8846. doi:10.5194/acp-15-8831-2015. Open access.

### The model

Fire radiative power over the day is a Gaussian on local solar time:

```
ρ(t) = ρ_base + (ρ_peak − ρ_base) · exp( −(h_t − h_peak)² / (2σ²) )
```

| Symbol | Meaning |
|---|---|
| `h_t` | local solar time at time `t` |
| `h_peak` | local hour of daily FRP maximum |
| `ρ_peak` | daily maximum FRP |
| `ρ_base` | baseline (nighttime) FRP |
| `σ` | spread, i.e. fire duration over the day |

`h_peak` is defined as the hour by which 50% of the day's fire radiative energy
has been emitted (valid when `ρ_base ≪ ρ_peak`).

### Table 1, reproduced — per-land-cover parameters

Means with SD in parentheses, FRE-weighted, cloud-free days excluded.
`ρ_peak/MODISmean` is the ratio of peak FRP to mean daytime FRP at MODIS
detection opportunities.

| Land cover | σ (h) | ρ_peak (MW) | ρ_base (MW) | h_peak (h) | ρ_peak/MODISmean |
|---|---|---|---|---|---|
| Temperate forest | 1.14 (0.55) | 846 (392) | 24.2 (12.7) | 13.31 (4.50) | 3.17 |
| Tropical forest | 0.85 (0.45) | 1364 (863) | 27.3 (19.6) | 13.34 (2.57) | 3.03 |
| Woody savanna | 0.94 (0.50) | 1501 (934) | 21.1 (16.8) | 13.21 (2.08) | 3.07 |
| Savanna | 1.09 (0.53) | 1711 (899) | 39.0 (25.5) | 13.08 (2.58) | 2.88 |
| Shrubland | 1.35 (0.63) | 3079 (1552) | 108.9 (56.9) | 13.16 (4.46) | 2.87 |
| Grassland | 1.06 (0.53) | 1642 (863) | 37.3 (21.1) | 12.95 (4.44) | 3.08 |
| Cropland | 0.95 (0.48) | 1259 (705) | 23.9 (16.0) | 13.33 (3.22) | 2.94 |

**Read two things off this table.**

1. **`h_peak` is ~13.0–13.3 for every land cover.** Remarkably stable. Suomi-NPP
   at 13:30 sits essentially on the peak. That is why the Aqua↔Suomi-NPP pairing
   worked so well while Aqua was frozen — and why losing it matters so much.
2. **`σ` is only ~0.85–1.35 hours.** The peak is *narrow*. An overpass shifting
   by an hour moves roughly a full standard deviation off the peak.

### First-order estimate of the drift's effect

With `σ = 1.0 h`, `h_peak = 13.2`, ignoring `ρ_base`:

| Aqua local time | Offset | Fraction of ρ_peak sampled |
|---|---|---|
| 13.14h (Portugal 2021) | −0.06σ | ~1.00 |
| 14.40h (Portugal 2025) | +1.20σ | **~0.49** |

So Aqua's sampled fire energy roughly **halves** on drift alone, with nothing
changing on the ground. Terra, already far out on the morning limb, loses more
in relative terms.

**Four caveats, and they matter.**

- Andela fit `σ` on SEVIRI at **0.1°, hourly, over Africa and Europe**. The
  paper explicitly warns the cycle gets wider and flatter at coarser
  aggregation: *"When moving to a coarser spatiotemporal resolution, the shape
  of the diurnal cycle likely becomes wider, with less pronounced peaks."* At
  H3 res 4–5 and daily aggregation, σ will be larger and the effect smaller.
- `h_peak` SD is large (2.1–4.5 h), so per-cell behaviour varies a lot.
- A Gaussian is an approximation; the paper notes real activity is somewhat
  skewed into the afternoon, and other work reports a secondary evening peak.
- We have **not** verified the halving against detection counts. See below.

**Treat "~halves" as a mechanism estimate to be refit, not a result.**

### Why we could not confirm it from counts directly, and what to do instead

The obvious test — does Terra/Aqua detection count fall as they drift apart? —
is confounded two ways:

- **Real fire activity varies.** Portugal 2025 was a heavy fire year
  (n = 1631 vs 399 in 2021), which swamps a sensitivity change.
- **Censoring biases mean FRP upward.** As a sensor loses sensitivity it
  detects only the largest fires, which *raises* its mean FRP. Chile's
  Terra/Aqua mean-FRP ratio and Australia's move in opposite directions for
  this reason.

Chile's Terra/Aqua *count* ratio does drop sharply in the drift era
(0.348 in 2021 → 0.191 in 2025), but Portugal and Australia are noisier.

**The clean event-day test:** hold the fire population fixed by conditioning on
Suomi-NPP. For cells and days where Suomi-NPP saw fire, ask what fraction Aqua
also saw, as a function of Aqua's local solar time for that overpass. Suomi-NPP
has not drifted, so it is a stable reference. That isolates the diurnal
sensitivity curve from real fire variability.

---

## 3. The data access picture is better and weirder than we thought

### No API key is needed for anything, including live data

Already recorded for the archive. Also true for near-real-time:

```
https://firms.modaps.eosdis.nasa.gov/data/active_fire/{source}/csv/{NAME}_{REGION}_{WINDOW}.csv
```

Verified HTTP 200, keyless, carrying same-day data (2026-10-28/29):

| Feed | Size |
|---|---|
| `modis-c6.1/csv/MODIS_C6_1_Global_24h.csv` | 0.8 MB |
| `suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv` | 5.5 MB |
| `noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv` | 5.3 MB |
| `noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv` | 5.7 MB |
| `modis-c6.1/csv/MODIS_C6_1_Global_7d.csv` | 6.0 MB |
| `suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_7d.csv` | 36 MB |

Regional subsets work and are much smaller — `MODIS_C6_1_South_America_7d.csv`
(1.4 MB), `MODIS_C6_1_Europe_24h.csv` (6.6 KB). **Prefer a regional subset for
the demo.**

**So the whole project can be built with zero credentials.** No MAP_KEY, no
Earthdata login, nothing to leak, nothing to expire mid-demo. Say this on
stage — it is a real reliability argument.

### The archive stops at the last complete year

`modis/2026/...` and `viirs-snpp/2026/...` are **404**. The country archive is
per-complete-year. So:

- Historical record: country archive, through 2025.
- Current year, including "this month" for requirement R5: **only** the NRT
  feeds.

R5 ("compare the current month against the historical median") therefore
*depends* on the NRT feed. The live layer is not an optional garnish — it is
load-bearing for a stated requirement. It stays, and it is keyless, so there is
no reason to drop it.

### The NRT schema differs from the archive schema. Four silent traps.

NRT header (13 columns):
```
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight
```
Archive header (15 columns):
```
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type
```

| # | Field | Archive | NRT | Consequence |
|---|---|---|---|---|
| 1 | `type` | present (0–3) | **absent** | **Cannot filter volcanoes / gas flares on the live layer the archive way.** |
| 2 | `instrument` | present | **absent** | Infer from the feed you fetched. |
| 3 | MODIS `satellite` | `Terra` / `Aqua` | **`T` / `A`** | A join on satellite name silently drops everything. |
| 4 | VIIRS `confidence` | `l` / `n` / `h` | **`low` / `nominal` / `high`** | Same trap, opposite direction. |

Also `version` differs: archive `6.2` / `61.03`, NRT `6.1NRT`.

**Mitigation for trap 1, and it is a nice feature in its own right:** build a
*persistent hotspot mask* from the archive's `type ∈ {1,2}` detections —
volcanoes and static industrial sources are, by definition, in the same place
every year — then apply that mask spatially to the NRT feed. Chile 2023 alone
has 258 volcano and 4,384 static-land detections to seed it from.

### NOAA-20 and NOAA-21 are NRT-only

Both appear in the NRT feeds but **not** in the country archive. Tried and
404ed: `viirs-noaa20`, `noaa-20-viirs-c2`, `noaa-21-viirs-c2`, `j1-viirs-c2`,
`suomi-npp-viirs-c2`, `modis-c6.1`. Archive slugs are `modis` and
`viirs-snpp` only.

So: **the harmonized historical record is MODIS + Suomi-NPP.** That is fine —
Suomi-NPP is the correct overlap partner for Aqua anyway — but it means the
live layer sees platforms the history does not. Label that in the UI rather
than mixing them.

### A gotcha for wide-longitude AOIs

Australia spans UTC+8 to UTC+11. A naive mean of `acq_time` in UTC wraps across
midnight as Terra drifts earlier and produces nonsense (we got "07:55" for
Terra 2025 that way). **Always convert to local solar time per detection before
averaging.** `scripts/measure_overpass_drift.py` does this; the earlier
shell one-liner did not.

---

## 4. Competitive landscape: the field is NOT empty

An earlier assumption in the briefing — that the word "harmonization" would
scare teams off and our competition would be thin — **is wrong.** At least six
public repositories target this exact challenge. Two are serious.

| Project | Approach | Notable |
|---|---|---|
| [flare-chronos](https://github.com/the-aris-club/flare-chronos) | Footprint reconstruction from scan angle (MODIS bow-tie, VIIRS 3-zone), fractional H3 allocation with energy conservation, SZA day/night reclassification, SAA spike filter, 2-stage FRP calibration (scan-angle operator + stratified quantile mapping Aqua→SNPP), fire episodes τ=60min, **effort normalization Ω(year, latitude)**, 26yr × 73-pentad calendar | Very complete engineering: DuckDB/Parquet, H3, Deck.gl, CI, 77 commits. **Reports no accuracy metrics against independent ground truth.** |
| [nasa-flame-sense](https://github.com/Adedamola18/nasa-flame-sense/pull/2) | Quantile mapping per biome×season + LightGBM (Tweedie, 37 features, monotone constraints). Temporal holdout: fit 2012–2020, test 2021–2024 | Validated against **three** national burned-area products: NBAC (Canada), MTBS (USA), MapBiomas (Brazil). Placebo break years, bootstrap intervals. Cell-month r: 0.966 ML / 0.937 QM / 0.871 raw MODIS |
| [firelens](https://github.com/shahmirkhan106/firelens) | ~1 km H3 lattice, per-region regression on the 2012 overlap | |
| [Chronofire](https://github.com/shahedrayhan23/Chronofire) | Stated as removing the sensor-transition step change | |
| [FireChronicle](https://github.com/bhavishyaone1/FireChronicle) | Interpretable burning activity calendar | |
| [project-stardust-firewatch](https://github.com/ImLWChuen/project-stardust-firewatch) | Resolution normalization, orbit dedup, sensitivity calibration | |

### The single most useful thing in their work

**nasa-flame-sense hit the Aqua drift and it broke their model.** From their
own PR: ML is *excluded* after 2012 because Aqua's orbit drift puts late-day
overpasses (58% of 2024 detections after 14:00) outside the training range.

So the drift is not our secret. But note *how* they handled it: as a limitation
that forced them to drop data. **Correcting through the drift, rather than
excluding the drifted years, is the differentiator that remains.**

### Their other honest findings, which we should not have to rediscover

- **Global continuity shows only a −4.3% step, within normal 3-year Aqua
  variability.** Meaning: at global scale the sensor break may not be
  detectable above natural variation. **The value of this work is regional, not
  global.** Say so; do not oversell a global claim.
- Brazil's 0.80 step at 2012 **also appears in unchanged Aqua data**, so it is
  not a harmonization artifact — a good reminder to always run the
  unchanged-sensor control.
- US interannual agreement got *worse* with their ML model (0.79 vs 0.90 raw).
  MTBS covers only large fires, includes prescribed burns, and ends in 2023.
- Neither project quantifies uncertainty on the published record.

### Where that leaves our differentiation

Four gaps, in order of how defensible they are:

1. **Correct through the drift instead of excluding it.** Put local solar time
   in the model as a covariate and use Andela's Gaussian to normalize every
   detection to a reference hour. Competitors drop the drifted years.
2. **Quantified uncertainty.** Bootstrap the fit; publish per-cell confidence.
   Neither serious competitor does this.
3. **Honest scale framing.** State up front that the correction matters
   regionally and sits within noise globally. Judges reward that; competitors
   are missing it.
4. **Zero credentials.** Fully keyless historical *and* live. A demo that
   cannot fail on an expired key.

What we should *not* try to out-build: flare-chronos's footprint
reconstruction and engineering breadth. We will not beat 77 commits of
pipeline in 48 hours. Compete on the correction being *right* and *honestly
bounded*, not on feature count.

---

## 5. Other literature worth having

| Paper | Why |
|---|---|
| Andela et al. 2015, *ACP* 15, 8831–8846, doi:10.5194/acp-15-8831-2015 | The diurnal Gaussian and Table 1. Core to §2. |
| Giglio, Schroeder, Justice 2016, *RSE* 178, 31–41, doi:10.1016/j.rse.2016.02.054 | MODIS C6 algorithm and FRP retrieval. |
| Schroeder et al. 2014, *RSE* 143, 85–96 | VIIRS 375 m algorithm. Commission error < 1.2% at nominal confidence; 3× day / 25× night detection gain vs the 750 m product (**vs VIIRS 750 m, not vs MODIS** — do not misquote this). |
| Laurent et al. 2019, *Biogeosciences* 16, 275–288 | FRP↔fire-size relationship varies by biome. Source of the 9–11 MW figure. |
| Wooster et al. 2003, *RSE* 86, 83–107 | The MIR-radiance FRP method. |
| [MDPI *Remote Sensing* 18(10), 1650](https://doi.org/10.3390/rs18101650) | FRP correction + spatiotemporal fusion of MYD14/VNP14IMG — closest peer-reviewed analogue to our task. **Could not retrieve (403); get it during prep.** |

Reported fire-peak timing from other sources, for cross-checking `h_peak`:
GOES-16/Himawari-8 work puts typical activity near **13:00 local**, with a
secondary evening peak 18:00–20:00 accounting for ~36.6% of detections; another
study spans daytime emissions 10:00–19:00 with seasonal shift. The secondary
evening peak is not in Andela's single-Gaussian model — a known limitation.

---

## 6. What this changes in the plan

Concrete edits, all reflected in `docs/priorities.md`:

1. **New Tier 1 item: diurnal/drift correction.** Compute local solar time per
   detection; normalize to a reference hour using a Gaussian fitted per land
   cover (Andela as prior, refit on our data). This is now the project's
   scientific centerpiece alongside detection probability.
2. **Fitting window is 2012–2021.** Hard constraint. Reserve 2022–2025 as the
   drift-era test set — a genuinely independent holdout.
3. **Live layer is load-bearing, not optional.** R5 needs current-month data
   and only NRT has it. It is keyless. It stays.
4. **Add the persistent-hotspot mask.** Needed because NRT has no `type`
   field; doubles as a visible feature.
5. **Add the unchanged-sensor control** to validation. Suomi-NPP has not
   drifted; any step we "remove" must not appear in Suomi-NPP alone.
6. **Frame claims regionally.** Do not claim a global step correction.
7. **Normalize schemas on read**, by name, handling all four NRT/archive traps.

### Pitch, updated

> Nothing changed on Earth. We corrected what changed in orbit.

Then, with the drift table on screen:

> And it is still changing. Terra and Aqua left their frozen orbits in 2022 —
> here it is, measured on three continents from public data. Terra has moved an
> hour earlier, Aqua an hour later, away from the 13:00 peak when fires burn
> hardest. MODIS switches off within months. Every baseline built on it is
> drifting right now, and nobody watching a dashboard would know.
