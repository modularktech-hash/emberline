# Feature priorities

What we build on Nov 14–15, in what order, and what we deliberately leave out.
Reviewed against outside feedback on Oct 19. **Research round Oct 29 – Nov 2
changed this plan materially — read [`docs/research-findings.md`](research-findings.md)
first; the orbital-drift finding in its §1 is not optional reading.**
**Reconciled against the official challenge statement on Oct 29** — see
[`docs/challenge-statement.md`](challenge-statement.md) for requirements R1–R12
and the five changes it forced. New to this page as a result: CSV export moved
into Tier 0, the calendar became month × year, and the anomaly headline became
the median.

**Nothing on this page is built before the event.** Fire-specific code written
ahead of time is the pre-existing work the rules disqualify. This page is a plan,
not an implementation.

## Rules for every number we show

- **Every number in the demo comes out of our own fit during the event.** No
  placeholder R², RMSE, bias, onset shift or rarity percentile goes on a slide,
  in the README or in the UI, not even as an example. If a number isn't
  computed yet, the slot says so.
- **Claim only what the data supports.** "Preparedness window" is a climatology
  statement ("historically, this AOI enters its peak period in ~N days"), not a
  forecast.

## The pitch line

> Nothing changed on Earth. We corrected what changed in orbit.

## Build order

The irreducible core comes first. Each tier only starts once the one above it
works end to end.

### Tier 0: the irreducible core

One AOI, one harmonized 25-year calendar, one validation number, CSV export.

1. **Raw ↔ Harmonized switch** on the burning activity calendar (R1–R4). The
   2012 step vanishes. This is the centerpiece of the demo and the only Framer
   Motion animation in the app.
   - **Layout is month × year** (~12 × 26 cells), because R4 asks "which month
     and years had the highest fire activity." Day-of-year is a drill-down for
     a selected year, not the primary grid.
   - **The cell value is a harmonized hotspot count** (R3 asks for "the number
     of hotspots"), computed as `Σ P_i` — the expected number a MODIS-class
     sensor would have recorded. Harmonized FRP sum is the secondary measure.
   - **Accessible colour ramp** (R10). Sequential, colour-blind safe, and
     readable in both themes. State the ramp's name in the UI.
2. **Validation on `/method`**: R², bias, RMSE on the overlap period, holdout
   years, and the MCD64A1 burned-area cross-check. Shown prominently in the
   demo, not buried.
   - **Unchanged-sensor control, mandatory.** Any step we claim to remove must
     *not* appear in Suomi-NPP alone, which has not drifted. A public
     competitor found Brazil's apparent 2012 step also present in unchanged
     Aqua data — i.e. it was never a sensor artifact. Run this control before
     believing any correction.
   - **Terra vs Aqua is NOT a null control.** It is tempting ("same
     instrument, so differences must be sensor-side") and it is wrong: Terra
     sits near 10:30 local and Aqua near 13:30, and with `h_peak` ≈ 13.2 and
     `σ` ≈ 1h they sample wildly different parts of the diurnal cycle. A
     Terra/Aqua difference confounds instrument with time of day, so it cannot
     test whether a correction distorts the baseline. Valid null controls are
     Suomi-NPP across the 2012 boundary, or Aqua against itself within the
     frozen-orbit era.
   - **But repurpose Terra vs Aqua for something better.** The pair is a free
     two-point sample of the diurnal cycle at every location and date in the
     whole archive. That is how `h_peak` and `σ` can be fitted from FIRMS
     alone, without needing geostationary data, using Andela's Table 1 only as
     a prior. Two points cannot identify three Gaussian parameters on their
     own — fix `ρ_base` from night detections, or pool across days within a
     cell and season. With NOAA-20/21 in the NRT feed there are more sample
     times available for recent years, which is a way to check the fitted
     shape.
   - **Cross-era adversarial validation.** Test a drift-era anomaly against a
     climatology built *only* from pre-2012 MODIS, passed through the
     correction. If it agrees with the anomaly computed from the full
     harmonized record, the correction is carrying real signal across the
     boundary. Two honest caveats: agreement could also mean the anomaly
     metric is insensitive, so state the test's power; and pre-2012-only
     baselines are noisier, so expect wider intervals. **This is a validation
     test, not the production anomaly engine** — see item 9.
   - **Frame results regionally, not globally.** The same competitor measured
     only a −4.3% global step, within normal 3-year Aqua variability. The
     sensor break may be undetectable above natural variation at global scale.
     Claim regional value; don't oversell a global correction.
   - **Show convergence, not just scores.** The statement's bar is that "the
     sensor of origin no longer matters," so show that directly: the MODIS and
     VIIRS distributions for the same cells and days, before and after the
     correction, overlaid. Two histograms sliding into each other is a more
     convincing argument than an R² and it is the same computation. Add R²,
     bias and RMSE per land cover beside it.
   - **Ship the fitted parameters as a file the app loads.** A small versioned
     JSON of coefficients (per land cover: thresholds, logistic betas,
     diurnal `h_peak`/`σ`/`ρ_base`, bootstrap intervals), fetched by the
     browser and applied client-side. Three things follow for free: the
     correction is auditable, `/method` can render the actual numbers rather
     than hard-coded prose, and the raw→harmonized toggle becomes a real
     computation instead of two precomputed series.
   - **Do NOT fit the model in the browser.** Tempting as a "zero-trust"
     flex, but the fit needs the pooled 2012–2021 overlap to have usable
     sample sizes per land cover. Refitting from one AOI's slice gives an
     unstable or meaningless curve, and it burns event hours for a worse
     result. Ship the parameters, apply them live, show the raw streams
     converge — that is auditable and reproducible, which is the part that
     actually earns the credit. Say "verifiable", not "fitted in your
     browser", and the claim stays true.
3. **Export engine** (R9, R12). Explicitly requested, so it is core, not a
   nicety. Trivial now that the read path is static Parquet — the bytes are
   already in the browser.
   - hotspots for the current AOI + date range, with a header row;
   - the calendar matrix itself;
   - a provenance block in each file — AOI bounds, date range, sensors,
     filters applied, harmonization version, retrieval date — so a downloaded
     file can be traced back to the run that produced it.
   - **CSV first.** It is what the statement names and what a land manager
     opens. Parquet and JSON are a few extra lines once CSV works; do them
     after. Print-ready SVG of the calendar is cheap because the calendar is
     already hand-rolled SVG — save the DOM node, don't build a renderer.
   - **The "static data protocol" flex.** Because the files are plain Parquet
     at stable URLs, publish a short copy-pasteable snippet (Python and JS)
     that range-reads the same data directly, with no key, no API and no
     account. Genuinely useful for a field pipeline, costs about half an hour,
     and it is honest — it is exactly what our own app does. Include the sort
     key and the coarse-parent filter in the snippet or it will be slow for
     whoever copies it.
4. **AOI by drawn box *or* typed lat/lon, plus a date range** (R7, R8, R11).
   Both input methods are named in the statement; typed coordinates are the
   cheaper one and must not be skipped.

### Tier 1: the science that makes us stand out

5. **Overpass-drift / diurnal correction.** The project's scientific
   centerpiece, alongside item 6. Terra and Aqua left their frozen orbits in
   2022; measured drift is Terra ≈ −1.0h and Aqua ≈ +1.2h between 2021 and
   2025, consistent on three continents
   (`scripts/measure_overpass_drift.py`). Fires peak near 13:00 local solar
   time with σ ≈ 1h, so an hour of drift moves a sensor roughly a full
   standard deviation off the peak.
   - Compute **local solar time per detection** (`UTC + longitude/15`). Never
     average UTC over a wide-longitude AOI — it wraps and gives nonsense.
   - Normalize each detection to a reference hour with the Andela et al.
     (2015) Gaussian, `ρ(t) = ρ_base + (ρ_peak − ρ_base)·exp(−(h_t − h_peak)²/2σ²)`,
     using their Table 1 per-land-cover values as the prior and refitting on
     our own data. Table reproduced in `docs/research-findings.md` §2.
   - **Hard constraint: fit on 2012–2021 only.** Reserve 2022–2025 as the
     drift-era holdout — a genuinely independent test set.
   - Isolate the sensitivity curve by **conditioning on Suomi-NPP**, which has
     not drifted: for cells/days where Suomi-NPP saw fire, what fraction did
     Aqua also see, as a function of Aqua's local solar time? That holds the
     fire population fixed. Do not try to read the effect off raw counts or
     mean FRP — both are confounded (real fire variability, and censoring
     *raises* mean FRP as sensitivity drops).
   - **This is the differentiator.** A public competitor hit this same drift
     and had to *exclude* post-2021 data because of it. Correcting through it
     is the gap that remains. See `docs/research-findings.md` §4.
   - **Fallback:** if the diurnal fit doesn't validate, restrict the whole
     product to 2000–2021 and say plainly why the drift era is excluded. An
     honest 22-year record beats a quietly wrong 26-year one.
6. **Detection probability instead of a fixed threshold.** On the 2012+
   overlap, label each daytime VIIRS detection 1 if Aqua MODIS also saw a fire
   there, else 0, and fit

   `P(MODIS detects) = σ(β0 + β1·log FRP + β2·log A_pixel + β_landcover)`

   The harmonized value is the expected energy MODIS would have seen,
   `Σ P_i · FRP_i`. The fixed threshold is a special case of this curve.
   - **Swath geometry is a first-class term, not a footnote.** MODIS pixels
     grow from ~1 km at nadir to roughly 2 km x 5 km at swath edge; VIIRS grows
     far less because of its aggregation scheme. `scan` and `track` are in both
     CSVs, so pixel area is directly available — use `log A_pixel` and report
     the fitted coefficient. A judge can check this one.
   - Output: detection-probability curves vs FRP, one per land cover class,
     and a second family of curves against pixel area.
   - Outside check: compare our fitted 50%-detection FRP against the 9–11 MW
     range reported in the literature. **Cite it correctly:** that range is
     described in its source as "thresholds of FRP detection," not as a
     50%-probability value, and it traces to Roberts & Wooster (2008) and
     Schroeder et al. (2010), not to Giglio. See `docs/data-reference.md`.
   - Uncertainty bands by bootstrapping the fit.
   - **Fallback (Sat 21:00 checkpoint):** if the logistic fit isn't validated,
     ship one global FRP threshold. A validated simple model beats an
     unfinished complex one.
7. **Season-shift detection, raw vs harmonized.** For each AOI and year: first
   significant burn, peak day, last significant burn. Plot the onset trend from
   the raw record next to the harmonized one. VIIRS sees small early-season
   crop burns MODIS can't, so the raw record can show a season starting earlier
   that is only a sensor artifact. **Season shift is a question you can't
   answer without harmonizing.** If raw and harmonized disagree, that is the
   headline finding. Report the trend with its uncertainty, whichever way it
   points.
8. **Per-cell confidence.** High / medium / low per H3 cell, from overlap
   sample size and fit residuals we compute anyway. Shown as a map layer and
   alongside every harmonized value.

### Tier 2: making it operational

9. **Preparedness windows.** View B, renamed (R5, R6). **The headline is
   this month against the historical median for this month**, in plain
   language, because that is the literal ask.
   - **The production baseline uses the full harmonized record (2000–2025),
     not a single-sensor era.** A cross-era baseline is a good *validation*
     test (item 2) but a bad *product*: restricting the climatology to
     pre-2012 MODIS throws away half the record and widens every interval, so
     real anomalies stop being detectable. Use everything; report the
     per-cell confidence from item 8 alongside. The percentile bands stay —
   they are what makes "unusual" mean anything — but they are the supporting
   detail, not the lead. Above the 90th percentile is flagged. Copy uses
   "historically" framing (see rules above).
10. **Live layer (View C).** FIRMS NRT for the last 24 hours and 7 days
   against climatology. **Load-bearing, not a garnish:** the country archive
   stops at the last complete year (2026 is 404), so the NRT feed is the only
   source of current-month data — which R5 explicitly requires. It is also
   keyless. Prefer a regional subset feed over the global one.
   - **The NRT schema differs from the archive in four ways that fail
     silently** (no `type`, no `instrument`, MODIS `satellite` is `T`/`A`, and
     VIIRS `confidence` is spelled out). Normalize on read, by name. See
     `docs/research-findings.md` §3.
   - **Persistent-hotspot mask.** Because NRT has no `type` field, build a
     spatial mask from the archive's `type ∈ {1,2}` detections (volcanoes and
     static industrial sources sit in the same place every year) and apply it
     to the live feed. Doubles as a visible UI toggle.
   - NOAA-20 and NOAA-21 appear in NRT but **not** in the archive, so the
     live layer sees platforms the history does not. Label that; don't mix.
11. **Counterfactual viewer**, one demo AOI, one day. Draw each VIIRS point
   with opacity equal to its P(MODIS detects): small fires fade until both
   sensors agree. Requires the point-level demo-AOI data and Tier 1 item 6.
12. **"Why is this unusual?" explainer.** Plain-language breakdown of an
   anomaly into its parts: more events than normal, larger fires (mean FRP),
   earlier onset. Precomputed, shown as text. No equations first.

### Tier 3: only if someone is idle on Sunday morning

13. **Event summaries** from DBSCAN clusters: duration, peak FRP, historical
    rarity for the AOI. No spread direction.
14. **Fire Pulse** radial calendar. It shows the same data as View A in a form
    that's harder to read. Memorable, but redundant.

## Degradation order

What we sacrifice first if time runs short (Sun 14:00 is feature freeze):

Tier 3 → counterfactual viewer → explainer → live layer → anomaly percentiles →
per-biome factors (fall back to one global fit) → multi-AOI support.

If the diurnal fit doesn't validate, restrict the product to 2000–2021 and
say plainly why the drift era is excluded, rather than extending a
frozen-orbit fit into the drift era.

Never sacrificed: the switch, the validation number, the CSV export, and
AOI + date-range selection. The last two are explicit requirements (R7–R9),
so dropping them forfeits points no matter how good the science is.

## Deliberately not building

| Idea | Why not |
|---|---|
| Spread direction for events ("expansion: East") | A separate project; duration and peak FRP come free from DBSCAN. |
| Time Machine slider | The calendar already shows every year at once. |
| Protected areas, watersheds, indigenous territories as AOIs | Licensing, large boundary files, and real sensitivity if wrong on stage. Countries and states (Natural Earth) plus a drawn box cover the demo. |
| Offline-first / service worker | A demo-day failure mode. Static files and HTTP caching give most of the benefit. |

## Decided: read path is static Parquet

**Settled 2026-11-03** — see
[`docs/decisions/0001-static-parquet-read-path.md`](decisions/0001-static-parquet-read-path.md).

No database, no API server. The app reads precomputed Parquet over HTTP range
requests. `db/migrations/` stays as a schema specification only.

Governing layout constraint, because it keeps being misread: **H3 cell indices
for a contiguous map area are not a contiguous range.** Sort by *coarse H3
parent cell* (res 2–3) then day, and filter on the parent. Sorting by raw cell
ID does not cluster an AOI and the reader fetches most of the file. Do not
partition by continent/country.

Keep all range-read code behind `web/src/lib/queries.ts`. Do not let
`hyparquet` calls leak into page components.

## Legitimate prep before Nov 14

- [x] Read Giglio (MODIS C6 active fire) and Schroeder (VIIRS 375 m). Note
      reported detection thresholds — see **Reference numbers** below.
- [x] Confirm the FIRMS archive CSVs carry `scan` and `track` (needed for pixel
      area in the detection-probability model). **Confirmed** — both MODIS and
      VIIRS schemas include them. See `docs/data-reference.md`.
- [x] Verify archive download access. **Done — no API key needed** for the
      country archive; MODIS 2000+, VIIRS Suomi-NPP 2012+. See
      `docs/data-reference.md` and `scripts/probe_firms_archive.sh`.
- [x] Measure the raw artifact on a real AOI. **Done** — Chile, MODIS flat vs
      VIIRS 2.47× (2012) rising to 3.42× (2015). The ratio is not constant.
- [x] Read the official challenge statement and reconcile this page against it.
      **Done Oct 29** — see `docs/challenge-statement.md`.
- [ ] Stage the archive on disk for the demo AOIs: MODIS 2000–2025 and
      VIIRS Suomi-NPP 2012–2025 for 3–4 countries, plus MCD12Q1, MCD64A1 and
      Natural Earth admin boundaries.
- [ ] Find the NOAA-20 country-archive source slug (optional; four plausible
      names 404 — see `docs/data-reference.md`).
- [ ] Decide the read path: Supabase vs static Parquet (above).
- [x] Verify NRT/live data access. **Done — also keyless.** All four global
      feeds plus regional subsets return 200 with same-day data.
- [x] Check Terra/Aqua orbital status. **Done — both drifting since 2022,
      measured on three continents.** See `docs/research-findings.md` §1 and
      `scripts/measure_overpass_drift.py`.
- [x] Survey the competitive field. **Done — six public repos, two serious.**
      Our earlier "nobody will pick this challenge" assumption was wrong. See
      `docs/research-findings.md` §4.
- [ ] Pick the accessible colour ramp (R10) and write its name down.
- [ ] Retrieve MDPI *Remote Sensing* 18(10) 1650 (FRP correction + MYD14/
      VNP14IMG fusion) — closest peer-reviewed analogue, blocked by 403.
- [ ] Confirm the official MODIS end-of-science dates; NASA sources conflict
      (Terra Feb 2027 vs Jan 2027; Aqua Sep 2027 vs Aug 2026).

## Reference numbers from the literature

Use these as sanity checks for your own fitted curve. **Do not present them as
your results.**

### MODIS detection thresholds

> "Thresholds of FRP detection vary between 9 and 11 MW"
> — Laurent et al. (2019), citing Roberts & Wooster (2008) and Schroeder et al.
> (2010).

Source: Laurent, P., Mouillot, F., Moreno, M. V., Yue, C., and Ciais, P.:
"Varying relationships between fire radiative power and fire size at a global
scale," *Biogeosciences*, 16, 275–288, 2019.
<https://bg.copernicus.org/articles/16/275/2019/>

**Caveat:** Laurent et al. call this "thresholds of FRP detection," not a 50%
probability of detection. Treat 9–11 MW as the range where MODIS sensitivity
drops off, not as a precise P(detect)=0.5 value. Your logistic fit (Tier 1,
item 3) will produce the actual curve.

### MODIS C6 FRP retrieval

Giglio, L., Schroeder, W., and Justice, C. O. (2016): "The Collection 6 MODIS
Active Fire Detection Algorithm and Fire Products," *Remote Sensing of
Environment*, 178, 31–41. DOI: 10.1016/j.rse.2016.02.054.

Key numbers from Giglio et al. (2016):

| Quantity | Value |
|---|---|
| FRP method | MIR-radiance (Wooster et al. 2003), replacing C5 empirical |
| Primary band | Band 21 (3.96 µm, high gain); band 22 as fallback |
| Empirical constant *a* | 3.0 × 10⁻⁹ W m⁻² sr⁻¹ µm⁻¹ K⁻⁴ |
| Atmospheric transmittance τ₄ (Level-2 swath) | Set to 1 |
| Mean FRP, fires detected by both C5 and C6 | 47.7 MW (C6) vs 56.9 MW (C5), ~16% decrease |
| Global Terra daytime commission error | 1.2% (C6) vs 2.4% (C5) |
| ASTER validation scenes | 2,466 (including 140 nighttime) |

### VIIRS 375 m validation

Schroeder, W., Oliva, P., Giglio, L., and Csiszar, I. A. (2014): "The New
VIIRS 375 m active fire detection data product: Algorithm description and
initial assessment," *Remote Sensing of Environment*, 143, 85–96.

(Read this paper and add key numbers here during prep.)
