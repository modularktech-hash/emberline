# Plan Combat — Emberline review and execution handoff

## START HERE — bounded-context instructions for Claude

This file preserves the full detailed review plus the 59-item backlog. It is a durable reference, not a prompt to load everything into context at once.

**User goal:** use the review to improve Emberline's scientific credibility, challenge alignment, usability, and competition readiness. This handoff itself changes documentation only. Follow the user's current authorization and repository instructions when implementing; this document does not authorize deployment or submission beyond that scope.

**Review snapshot:** 14 November 2026, final route sweep at 22:23 IST (16:53 UTC), with targeted checks afterward. The reviewed source moved from `60f39187530f986bad9f295056d7d1539f2eda38` to `f0222b3e76585c97e44a0e0be8e81008a83ce195`. Published fit: `v1-20261114T1240`. The repository may have advanced since then. Reproduce a finding against current code before editing. Do not undo fixes already present.

### How to work without another compaction loop

1. Read this START HERE section and the progress ledger only.
2. Read applicable repository instructions. Inspect current branch/status and preserve concurrent work.
3. Use the section index below to read only the relevant review section and one backlog item. Never repeatedly dump this entire file into a tool response.
4. Choose one small, coherent task. Confirm its evidence, implement it, and run checks appropriate to the change.
5. Update its checkbox/status with files changed, evidence, and verification. Distinguish implemented from verified. Mark stale findings as already resolved, with evidence.
6. Before pausing or compaction, update the progress ledger with exact next action and any unresolved hypothesis. Resume from the ledger, not the full conversation.
7. Scientific extensions require validation; do not manufacture metrics, hide poor results, select models on the test set and still call it untouched, or implement an incompatible current/historical ratio merely to complete a checkbox.

Useful bounded reads (quote the filename because it contains a space):

```bash
rg -n '^## |^### E[0-9]+|^<!-- REVIEW_SECTION_' 'plan combat.md'
sed -n '1,100p' 'plan combat.md'
# Then use the line numbers above to read a specific task/section with sed.
```

### Progress ledger — update at every stopping point

- Current task: trust-critical batch E01-E05 plus E10. E01 and E02 done and browser-verified; E03-E05 UI wiring next.
- Implementation status: E10 done. E01 done (f339b28). E02 done (cd3641f). E03/E04/E05 data published, UI wiring pending.
- Last completed action: cd3641f on main - complete H3 res-2 enumeration for boxes (E02), after f339b28 coordinate validation (E01).
- Current branch / HEAD: shishir/admiring-pascal-8ymvmc = origin/main (see `git log -1`).
- Files changed in current task: web/src/lib/aoi.ts, web/src/components/Explorer.tsx, web/src/components/AoiMap.tsx, web/src/lib/queries.ts (Set bookkeeping only), web/scripts/check-aoi-coverage.ts (new). Nothing uncommitted.
- Checks run / results: `npx tsc --noEmit` + `npm run build` pass; Playwright (Chromium, `next start`) E01 matrix 8/8 pass; `node --experimental-strip-types web/scripts/check-aoi-coverage.ts` 14/14 boxes agree with brute-force reference (0 missing, 0 extra); Canada/Portugal country results on screen identical to the live site.
- Remaining uncertainty / blocker: model does not beat the scalar ratio baseline on R2 in 87 of 171 countries - copy must say so (E06, E11). Res-2 cells are still coarse for local use (review section 6, not in E02 scope). Nothing on the website is to be deleted (owner instruction).
- Next action: wire coverage_status.json and coef_ci_estimated into Lab/Method/Data (E03-E05 UI), then E06.

### Recommended work sequence

- **Trust-critical fixes:** E01 invalid coordinates; E02 complete geographic enumeration; E03 false pooled intervals; E04–E05 failure/coverage statuses.
- **Interpretation and workflow:** E06 selected-region quality; E08 URL state; E09 evidence export; E14–E15 exact spatial provenance.
- **Scientific proof:** E10–E13 and E24–E32 as relevant; preserve test independence and identify research work explicitly.
- **Challenge completion:** E07 compatible current month-to-date comparison. Scope honestly if the calibration bridge cannot be validated.
- **Presentation and release:** E16–E19, documentation, reproducibility, public links, current submission requirements.
- **Already resolved at review time:** Done items in the backlog. Retain as regression checks rather than reimplementing.

### Key findings to preserve

- 171 fitted countries: 130 own curves and 41 borrowed curves.
- 35 countries had negative held-out model R²; 21 had a better threshold baseline; 42 had absolute held-out bias above 20%.
- All 41 borrowed curves published zero-width coefficient intervals; the live Lab displayed 15.4–15.4 MW for the Republic of Korea.
- 66 failed-fit entries contained TypeErrors. Only 61 had raw calendars. Do not equate all numerical failures with proven insufficient data.
- The browser accepted latitude 100–110 degrees and returned a result.
- The rectangle algorithm sampled at most 225 positions, omitting cells in large rectangles. Showing selected outlines does not fix enumeration.
- Historical harmonized coverage ended in 2025. The separate recent feed had incompatible platform/filter characteristics for a direct anomaly ratio.
- Several wording, chart, mobile, accessibility, and fallback issues were fixed DURING the review. They are explicitly marked Done below.

### Evidence and scope

The report below is preserved in full. Evidence statements are a point-in-time audit, not assertions that every issue remains in HEAD. Published data and fixed source links are in review section 20. The original local screenshot/archive artifacts are not committed here; their filenames are provenance references, not expected repository files. Reproduce tests or ask the owner for those artifacts if needed. The report includes exact inputs, algorithms, and acceptance checks for the major findings.

This file includes the full review and the complete actionable checklist. It intentionally excludes large generated HTML/PDF/images and runtime dependencies from the repository.

## Full review — section index

- REVIEW_SECTION_01: Overall judgment
- REVIEW_SECTION_02: What I inspected, and what this review does not establish
- REVIEW_SECTION_03: Alignment with the supplied challenge
- REVIEW_SECTION_04: What is already working well
- REVIEW_SECTION_05: The scientific findings that deserve immediate attention
- REVIEW_SECTION_06: Geographic selection: the most important functional defect
- REVIEW_SECTION_07: The current-month comparison that would most improve challenge relevance
- REVIEW_SECTION_08: Page-by-page review
- REVIEW_SECTION_09: Visual design, interaction, accessibility, and performance
- REVIEW_SECTION_10: Positioning and originality
- REVIEW_SECTION_11: Ideas ranked by value
- REVIEW_SECTION_12: Judging strategy grounded in actual guidance
- REVIEW_SECTION_13: A stronger submission package
- REVIEW_SECTION_14: Demo and presentation blueprint
- REVIEW_SECTION_15: Questions judges may ask, and honest answers to prepare
- REVIEW_SECTION_16: User research and proof of impact
- REVIEW_SECTION_17: Practical implementation order
- REVIEW_SECTION_18: Acceptance tests worth retaining
- REVIEW_SECTION_19: Release and evidence hygiene
- REVIEW_SECTION_20: Source notes
- REVIEW_SECTION_21: What success would look like

---

# Full original review: Emberline product, science, and Space Apps readiness

Review date: 14 November 2026. Final route sweep completed 16:53 UTC; targeted checks continued afterward. Website: https://emberline-tan.vercel.app. Challenge reference: the full brief supplied by the user, corresponding to Harmonization of MODIS and VIIRS Hot Spots. This is an independent review, not a NASA assessment or prediction of an award.

**Read this version instead of the earlier audit.** The deployment changed while I inspected it. I initially reviewed commit `60f39187530f986bad9f295056d7d1539f2eda38`, then incorporated the deployed fixes associated with `f0222b3e76585c97e44a0e0be8e81008a83ce195`. Numerical findings below refer to published fit `v1-20261114T1240`. Earlier screenshots in the evidence folder are historical evidence, not necessarily current defects. Final captures have a `final-` prefix. I made no changes to the website or its repository.

<!-- REVIEW_SECTION_01 -->
## 1. Overall judgment

Emberline has a credible, distinctive foundation: it addresses the discontinuity between MODIS and VIIRS rather than merely placing fire points on a globe. It combines a real fitted model, held-out evaluation, a useful calendar, downloadable data, an inspectable scientific explanation, and a coherent visual identity. These are substantial strengths for a Space Apps project.

Its largest remaining weakness is the distance between **a scientifically interesting prototype** and **a dependable tool for interpreting a particular place and period**. Broad coverage does not imply reliable calibration everywhere. A drawn rectangle does not currently produce an exact rectangle query. Historical anomalies do not provide the requested current-month comparison. Attractive plots need uncertainty and provenance to support decisions.

The highest-value next step is to make one complete workflow convincing: select a region, understand the quality of its correction, compare a period against an appropriate baseline, see the actual geographic coverage, and export evidence another person can reproduce. A judge should understand both the benefit and the limits without searching several pages.

There is no honest way to guarantee an award, assign a meaningful probability of winning, or predict competitor quality from this website. My assessment is that its scientific idea and presentation merit serious attention, but the geographic-selection defects and model-quality communication are more important than additional animation or another dashboard.

<!-- REVIEW_SECTION_02 -->
## 2. What I inspected, and what this review does not establish

I inspected all eleven public routes: Home, Explorer, Compare, Seasons, Season Shift, Satellites, Method, Lab, Data, Globe, and About. I captured desktop and 390-pixel layouts, then retested changes arriving during the review. I also checked the Explorer at 320 pixels, country selection, raw/harmonized switching, a one-year selection, CSV download, refresh persistence, invalid coordinate entry, Lab input handling, mobile menu Escape behavior, and automated accessibility on six analytical pages.

I examined the public source for the fit, data preparation, query layer, custom-area selection, charts, navigation, and relevant documentation. I independently summarized the published country-validation JSON and reproduced the geographic sampling issue using the same H3 library version. I researched NASA FIRMS interpretation guidance and Space Apps submission/judging sources.

This is not an independent rerun of the entire satellite archive, a scientific peer review, a complete penetration test, or a real-device Safari/Android certification. Reported model scores are recalculated summaries of the published results, not independently reproduced fits. Browser measurements came from headless Chromium in this environment. The map timed out here and the latest implementation displayed an actionable retry/typed-coordinate fallback. This establishes the fallback behavior, not proof that every user's browser fails. No field interviews or operational trials were performed.

The newest source and deployment were moving during the review. Freeze a release before acting on the backlog and recheck any changed component. Repeatedly auditing a changing target can otherwise generate contradictory reports.

<!-- REVIEW_SECTION_03 -->
## 3. Alignment with the supplied challenge

| Challenge expectation | Current evidence | Assessment and next action |
|---|---|---|
| Harmonize MODIS and VIIRS | FRP-based logistic model, country scaling, held-out evaluation | Substantial implementation. Qualify weak countries and borrowed fits; improve baselines and uncertainty. |
| Calendar over a long historical period | Monthly calendar, comparable record 2003–2025 | Strong historical coverage. Starting in 2003 is defensible for full-year Aqua coverage; explain the distinction from the archive's 2001 start. |
| Select an area | Country picker plus typed/drawn rectangle | Present but materially limited by coarse whole-cell aggregation and an incomplete sampling algorithm. |
| Select a date range | From/to year controls | Useful but not an arbitrary month/day interval. Add month boundaries if practical and explicitly define present granularity. |
| Understand historical patterns | Calendars, comparisons, annual series, season timing | Strong breadth. Improve interpretation, uncertainty, and cross-page continuity. |
| Identify anomalies/critical periods | Historical median/spread and upper-percentile flags | Good statistical foundation. Latest wording appropriately avoids equating rarity with emergency severity. |
| Compare current month with historical median | Historical Seasons page ends in 2025; separate raw recent globe | Major remaining gap. No validated current-month historical comparison was demonstrated. |
| Download analytics and visualizations | Working monthly CSV and downloadable files | Analytics are accessible. Add a clean chart/report export with metadata; an ordinary screenshot is weaker. |
| Accessible visual encoding | Sequential palette, explicit labels, improving mobile controls | Strong direction. Keyboard efficiency, table interactions, and meaningful chart alternatives still need work. |
| Optional raw detections CSV | Aggregate calendar CSV verified | Aggregate monthly counts are not the same as selected hotspot records. Label the export and implement point export only if feasible. |
| Relevant users | Regional analyst use case now explicit | Better focus than promising operational response. Show one realistic task and a concrete decision supported. |

The brief does not require pretending to provide complete global coverage, exact 2001 harmonization, predictive firefighting, or a large AI system. Honest scope strengthens relevance. It also does not justify marking the current-month requirement complete because a separate globe contains recent detections.

<!-- REVIEW_SECTION_04 -->
## 4. What is already working well

**A recognizable product identity.** The cream background, warm fire palette, dark typography, rounded surfaces, and restrained navigation look intentional. The site feels related across pages. Preserve that coherence rather than replacing it with a generic dark dashboard.

**A comprehensible scientific problem.** The raw-versus-harmonized comparison makes sensor discontinuity tangible. It is much easier to explain why harmonization matters with a visible change than with an equation alone.

**A real scientific pipeline.** Training and held-out years are separated. Raw VIIRS and an FRP threshold are evaluated alongside the proposed model. Regional differences and poor scores are published. The method includes a continuing-sensor comparison and post-2021 diagnostics. These are meaningful foundations, not decorative technical claims.

**Inspectable data.** Static Parquet and JSON, a public repository, downloadable tables, and a named fit version make review possible. Requiring no sign-in or API key for the public app lowers friction for judges and users.

**Useful existing analysis.** Leave-one-year-out monthly baselines avoid comparing a historical year partly against itself. Shared scales in the raw/harmonized calendar help users see differences honestly. Compare offers indexed and absolute views. Season-year handling recognizes that southern-hemisphere seasons cross calendar boundaries.

**Improvements verified during this review.** Coverage language now distinguishes archive, harmonized period, and live layer. The season median is called midpoint. The month axis and single-year chart have been corrected. Lab input rejection is explained. Inputs have accessible names. Mobile targets are larger; Escape closes the menu. Credits now link to sources. Method includes κ and more error metrics. These should be retained as regression checks.

<!-- REVIEW_SECTION_05 -->
## 5. The scientific findings that deserve immediate attention

### 5.1 Publish the distribution of model quality, not just a favorable summary

From the current published parameters:

| Result | Count / value |
|---|---:|
| Fitted countries/territories | 171 |
| Own detection curve | 130 |
| Borrowed pooled curve | 41 |
| Negative held-out model R² | 35 of 171 |
| Negative held-out R² among own fits | 11 of 130 |
| Threshold baseline has higher held-out R² | 21 of 171 |
| Absolute held-out bias greater than 20% | 42 of 171 |
| Borrowed fits with zero-width coefficient intervals | 41 of 41 |
| Entries in the failed-fit dictionary | 66 |
| Those entries with an available raw calendar | 61 |

The website already discloses the 35 negative scores in Method. The improvement is to bring that information into the selected-country workflow, where it affects interpretation. A user should not have to discover later that the selected correction performs poorly on the published validation target.

Examples: the United States has model R² about 0.380 versus 0.689 for the threshold baseline. China has about −0.104 versus −0.030. Spain has about −7.188 versus −0.507. These do not erase the project's strong results elsewhere. They do invalidate an unqualified impression that the proposed model is the best choice everywhere.

A negative R² means the sum of squared errors exceeds that of predicting the evaluation sample's mean under the standard definition. It is not “negative accuracy,” and R² 0.64 does not mean 64% of fires were detected correctly. Country-aggregated behavior may be better than small-cell behavior; evaluate it explicitly rather than assuming either equivalence or failure at every scale.

**Recommended interface:** place a compact quality card beside the selected result: fit origin, evaluation period, spatial/temporal evaluation unit, R², bias, RMSE, sample size, and a plain-language interpretation. Mark a result “experimental correction—poor agreement at cell-month scale” where warranted. Keep raw data accessible. Define any quality categories prospectively and document them; do not invent thresholds solely to make the current distribution look better.

**Acceptance check:** selecting China or Spain reveals its limitation without visiting Method. Selecting a strong-fit country shows the same fields. The quality label follows the country into Compare, Seasons, exports, and shared URLs.

### 5.2 A fixed borrowed model must not appear to have perfect certainty

Every pooled fit publishes identical lower and upper bounds for its logistic coefficients. The latest live Lab also visibly renders the Republic of Korea interval as “15.4–15.4 MW,” so this is a user-facing issue as well as a file issue. Its FRP-at-50% interval is also zero-width. For example, the Republic of Korea uses approximately 15.430739 MW for both interval endpoints.

The fit code skips coefficient resampling for pooled models and substitutes repeated copies of the fitted coefficients. A fixed coefficient in the implementation does not mean the coefficient is known without uncertainty. This is distinct from the separately computed held-out score intervals, which should not be dismissed as zero-width merely because the coefficient interval is.

Immediate repair: represent unavailable coefficient uncertainty as null/not estimated and label it that way. Explain that the curve was borrowed. Longer term: resample the source-country fitting procedure, propagate uncertainty through transfer and κ, and assess out-of-country calibration. A valid broad interval is more credible than a falsely precise one.

Also explain how pooling works. The current code uses a detection-weighted average of source-country coefficients, rather than fitting one logistic model to pooled observations. Averaging logistic coefficients is not generally equivalent to averaging predicted probabilities. This can be a pragmatic prototype choice, but name it accurately and evaluate it as its own method.

### 5.3 “Too sparse” and “processing failed” are different statuses

The published `failed` dictionary contains 66 TypeError entries, such as comparisons involving None and conversion of None to float. The interface groups those countries as too sparse to fit. Sparse observations may trigger the errors, but an exception is not a documented sufficiency decision.

Introduce explicit outcomes: no observations; insufficient training observations; insufficient reference observations; insufficient held-out variation; numerical fitting failure; missing input; and valid fit. Store counts and reasons. Handle undefined metrics deliberately. A country may have enough observations for a limited descriptive output but not an R² estimate.

Five of the 66 entries have no available raw calendar, so “66 raw-only countries” is also too broad. The available files indicate 61 with raw calendars and five without one. Derive coverage messaging from the same manifest used by the query layer.

Do not silently turn an exception into a reassuring scientific explanation. Do not make those countries disappear from the coverage page. Show what is available, what is missing, and why.

### 5.4 Add a stronger simple baseline

Raw VIIRS is an intentionally mismatched unit. Beating it is necessary but not sufficient evidence that a logistic FRP model adds value. The existing threshold baseline is useful and should be retained. Add a training-only scalar calibration, for example a constant factor translating VIIRS counts to the reference count scale. Compare it on untouched periods and, where possible, held-out spatial blocks.

Additional candidates are month-specific scaling, a monotonic FRP curve, and partially pooled regional models. Do not implement all of them during the hackathon. The immediate question is whether the chosen complexity improves the calendar people use over a much simpler calibrated count.

Do not choose the best method separately for each country using 2019–2021 and then continue calling those same years an untouched test. If model selection uses them, reserve a new evaluation split or use nested/blocked validation. Post-2021 orbit drift complicates that choice and must be documented.

### 5.5 Define the estimand precisely

The model learns whether an NPP detection has an Aqua detection on the same UTC date in the same or neighboring H3 resolution-7 cell. This estimates a particular co-detection relationship conditional on the selected records. It is not direct knowledge of every fire on the ground.

No match can reflect sensitivity, cloud or smoke, canopy, timing, view geometry, missing acquisition coverage, or spatial matching. A day-and-neighborhood rule may also match unrelated nearby burns. Similar nominal overpass times help but do not make two observations simultaneous everywhere.

Use wording such as “empirical Aqua co-detection model under these matching and filtering rules.” Explain how κ calibrates aggregate counts and why one VIIRS pixel is not one unique fire. Include the actual matching rule near the equation, not only in JSON.

For stronger validation, vary the distance/time rule, inspect matched/unmatched examples, stratify by land cover and season, and where available account for observation opportunities or cloud masks. Show a sensitivity table rather than claiming these uncertainties have already been removed.

### 5.6 Separate sensor adjustment from causal explanation

A raw trend minus a harmonized trend is a model-dependent difference. Calling it the “sensor share” of a shift implies causal attribution the pipeline has not established. Rename it “change in estimated trend after harmonization,” show both slopes, and flag unstable ratios when the raw slope is close to zero.

Similarly, do not aim to flatten the 2012 step to exactly one everywhere. Real activity changed too. The continuing Aqua comparison is useful precisely because it offers a reference for retaining real variation. Canada illustrates this: its harmonized step is about 1.68 while Aqua's is about 1.43. A compelling demonstration can preserve a real increase while reducing the much larger sensor-related discontinuity.

The revised About wording is better than the original absolute claim. Continue this restraint in README, demo narration, social preview, footer, and submission text.

### 5.7 Make uncertainty appropriate to the output

The fit has coefficient intervals and cell-bootstrap test-metric intervals. Those are different uncertainties. A confidence interval for evaluation R² is not an interval around each month's expected count. A coefficient-only interval does not automatically include κ uncertainty, transfer error, observation gaps, or changing fire regimes.

The code uses detection-level resampling for coefficient intervals and cell-level resampling for held-out metrics. Credit the latter's spatial grouping; do not describe all resampling as independent point bootstrap. Investigate residual dependence across nearby cells and time, and explain what each interval covers.

For the calendar, eventually propagate model/scale uncertainty to annual/monthly summaries. For anomalies, report historical spread separately from model uncertainty. For trends, show confidence intervals, usable years, missingness, and sensitivity to start/end years. Describe ordinary least-squares trends as descriptive when inference assumptions are untested.

### 5.8 Check calendar completeness and fire-year boundaries

Zero detections, missing observations, absent files, and an unprocessed area are different states. A filled calendar grid must not make them visually identical without a defensible completeness assumption. Publish source-period coverage and acquisition completeness where available.

For cross-year seasons, explicitly define whether the label refers to the start or end year. Verify that a final July–June season has both halves available; a calendar ending in December 2025 does not automatically contain a complete season starting July 2025. Test leap days and the date conversion used to label cumulative percentiles.

The current season file has 166 daily-resolution countries and five monthly-estimated countries. It reports a median absolute trend difference of roughly 1.29 days/decade and a maximum roughly 37.61 when comparing monthly and daily methods across available comparisons. That maximum matters. Keep the resolution distinction visible and avoid presenting interpolated day estimates as precise observations.

<!-- REVIEW_SECTION_06 -->
## 6. Geographic selection: the most important functional defect

The current `bboxToParents` function samples a rectangle on a 15-by-15 lattice: at most 225 sampled positions. It returns the H3 resolution-2 cells containing those samples. This is not a complete geometric intersection of the rectangle with all touched cells.

I reproduced the calculation and compared it with a denser 201-by-201 sample. The denser sample is a lower bound on touched cells, not an exact intersection oracle:

| Test rectangle, west/south/east/north | Current sampled cells | Denser sample cells | Cells present in dense sample but omitted |
|---|---:|---:|---:|
| India-sized: 68, 6, 97, 36 | 131 | 134 | 3 |
| Australia-sized: 112, −44, 154, −10 | 189 | 218 | 29 |
| Large continent: −20, −35, 55, 38 | 225 | 778 | 553 |
| Near-global: −179, −85, 179, 85 | 215 | 5,872 | 5,657 |

These counts establish missing geometric cells, not the exact number of omitted detections. Some cells contain no relevant data. Nevertheless, saying the query sums every touched cell is incorrect for these examples. The latest cell-outline improvement makes the actual result more visible but does not fix selection completeness.

Replace sampling with a tested polygon-cell intersection/coverage method. A cell-center fill by itself can also miss boundary-only intersections and tiny boxes, so choose the intended intersection semantics explicitly. Validate continental, narrow, tiny, polar, and antimeridian cases. Add documented size limits if complete queries cannot be supported efficiently. Never silently truncate.

Even after fixing enumeration, resolution-2 cells are extremely coarse for a land manager. Summing whole cells introduces activity outside the requested boundary and potentially across national borders. The new effective-coverage display is a good disclosure, but it does not create local precision. For a genuine local workflow, aggregate finer cells or query filtered points. Avoid pretending that fractional cell area provides accurate fire-count weighting without a defensible distribution assumption.

A second confirmed bug: entering west 10, south 100, east 20, north 110 produced an ordinary result for a custom area with ten grid cells. Latitude 100–110° is invalid. No validation error appeared. The underlying library normalizes or maps those values instead of protecting the user.

Require finite coordinates, non-empty values, legal latitude/longitude bounds, correct north/south ordering, and an explicit antimeridian policy. Preserve the user's entry and explain the error beside the field. Blank strings currently pass through Number conversion as zero in the source; test that independently. The ingestion library supports antimeridian bounding boxes, but the browser's ordering check does not, so the system is inconsistent.

For exports, include exact requested coordinates, actual included cell IDs, resolution, selection semantics, fit origins, excluded cells/countries, and completeness. A rounded human-readable area label and cell count are not enough to reproduce a query.

<!-- REVIEW_SECTION_07 -->
## 7. The current-month comparison that would most improve challenge relevance

A good current-month screen would answer: “For this place, through this date, how unusual is observed burning activity relative to comparable historical periods, and how much trust should I place in that comparison?”

The current recent feed uses NOAA-20/21 VIIRS and MODIS; the calibrated history relies on Aqua and Suomi-NPP. The live record also includes thermal sources excluded from the historical vegetation-fire series. A raw recent total cannot be divided by the historical harmonized median and called a valid anomaly.

A defensible implementation needs an explicit platform/filter bridge, duplicate/overlap policy, coverage checks, provisional NRT labeling, and calibration validation. Compare month-to-date with the same elapsed portion of historical months. Comparing fourteen days with a full month's median creates a predictable bias. State the acquisition cutoff in UTC, expected latency, number of reference years, and whether the current period is complete.

If that pipeline cannot be validated before submission, keep the limitation explicit and demonstrate the complete historical analogue. Do not create a misleading current anomaly merely to check a requirement box. In the roadmap, explain exactly what is missing and what data would close it.

A useful card would contain the selected area, period through date, corrected/provisional count, historical median and interquartile range, absolute deviation, ratio where the median is nonzero, percentile, coverage status, and model-quality status. The language should describe unusual observed activity; it should not infer evacuation needs or fire spread from this product alone.

<!-- REVIEW_SECTION_08 -->
## 8. Page-by-page review

### Home

Keep the recognizable visual identity and a single primary calendar CTA. The page's job is to communicate the problem, the product, and one credible reason to trust it within a short scan. A globe is visually effective, but the harmonized calendar is the actual challenge solution.

Place a small raw/reference/harmonized example near the first screen, accompanied by a specific explanation of what changes and what remains. Provide an accessible caption that contains the insight. The latest coverage copy should be consistent with the headline, metadata, footer, and social image. The current visible headline correctly says 23 years; some captured document titles still use the older 25-year wording. Align metadata and social previews with the visible page. Also replace the statement that 2001–2002 have no Aqua reference with the more precise statement that these are not two complete Aqua reference years: Aqua launched during 2002.

The at-a-glance numbers should each have a population, period, unit, and provenance. A median of country R² values is not a global R². A summed fitted-country estimate is not a globally complete total. A 24-hour detection count is not a count of unique incidents.

Reduce the prominence of the live globe if it distracts from the historical product. Offer three guided starting points: understand the sensor break, inspect a historical extreme, and examine a weak-fit country. The last example demonstrates honesty and makes the quality system understandable.

### Explorer

This is the core product and deserves the most attention. The latest compact header, explicit dates, country search, raw/harmonized state, quality metrics, calendar, and CSV create a good foundation. The working export for Canada 2023 contained twelve monthly values and useful product/unit/fit/source metadata.

Remaining improvements: validate coordinates; fix touched-cell enumeration; explain effective geography; persist area/mode/date range in the URL; restore state on refresh and back navigation; offer month-level intervals if required; add a table view; add image/report export; and make fit quality visible before a user interprets the calendar.

The current selected state is not reflected in the URL. Refresh reset my 2023–2023 selection to 2003–2025. A judge cannot reliably open the exact result you demonstrated. A shareable query is unusually valuable here because it supports presentation and reproducibility at once.

Keep the raw/harmonized shared scale for fair toggling. Add an explicitly labeled normalized view only for season-shape questions. Do not silently rescale every mode and make a correction appear larger or smaller. Show all legend breakpoints in an accessible way and explain the square-root scale.

A persistent month detail panel should show value, basis, selected region, fit status, baseline statistics, and links to the relevant method/data. Tapping a cell should work as clearly as hovering. Avoid requiring hundreds of Tab presses to leave the grid: implement roving focus and arrow navigation or provide an equally capable table.

### Compare

The indexed-versus-absolute distinction is valuable. Indexed comparison helps compare relative departures within countries; absolute comparison shows count scale. Neither automatically establishes relative hazard or burned area.

Carry fit origin and quality into both sides. A comparison between an own-fit country and a weak pooled country should not visually imply equal certainty. State that each index uses its own reference mean and identify that period. Handle zero means and missing years explicitly. Offer common-period comparison so incomplete coverage does not distort the index.

Show a concise interpretation generated from deterministic calculations: which selected year is most unusual within each region, which months dominate, and whether the comparison is limited by calibration. Avoid broad statements about one country being safer. Add direct export of the displayed comparison and a shareable URL.

For mobile, a stacked A/B layout is appropriate. Keep labels visible and make the table horizontally scroll within its container. The latest line-end labels improve comprehension and should remain.

### Seasons

The historical median and spread are one of the best matches to the brief. Retain exclusion of the selected historical year from its comparison set. Show the exact baseline years and sample count alongside the chart, especially if years are missing.

Upper-percentile flags should state statistical unusualness. The recent replacement of “critical” wording is appropriate. Add absolute difference as well as ratio: a ratio can be dramatic where the median is tiny. If the median is zero, display a defined state rather than an infinite multiplier.

The radial Fire Pulse is memorable but not as precise as a matrix. Keep it as a secondary overview and pair it with the calendar/table. Outer rings occupy more area, which can make recent years seem more important. Explain the encoding and avoid treating ring area as a quantitative comparison.

Provide a one-click brief: place, selected year, unusual months, peak observed month, total, baseline, quality caveats, and source. This is a practical deliverable an analyst can use beyond the website.

### Season Shift / Trends

The corrected midpoint term and real month ticks remove important errors. Keep the fire-year definition visible and show exact year boundaries. Explain that cumulative 10% and 90% dates describe the central portion of detected activity; they do not prove the first or last fire occurred on those dates.

Add slope uncertainty and sensitivity to the chosen period. Multi-modal burning regimes can have two distinct seasons; a single 10–90% span may bridge a quiet interval. Explain that limitation and consider a seasonal profile beside the span. Distinguish crop-burning patterns from wildfire seasons without claiming the current source class alone can identify management intent.

Rename causal-sounding “sensor share,” particularly where the denominator is small. Provide a comparison of the raw and adjusted estimates with units, rather than an unstable percentage. The all-country table needs keyboard-operable country links/buttons instead of only clickable rows.

### Method & Proof

This is the project's strongest credibility asset. The latest version correctly adds κ, bias, RMSE, bootstrap explanation, fit-origin columns, and limits. Preserve the actual bad results; removing them would reduce trust.

Organize the page into a short explanation followed by inspectable detail: what is estimated, data/filter contract, matching, model/scaling, validation design, results, and known failure modes. A judge should see one useful observed-versus-predicted plot before encountering hundreds of rows.

Add the calibrated constant baseline, an error distribution, residual-by-month/FRP plots, and selected strong/weak examples. Separate training fit from held-out performance. Explain the evaluation population: the code joins cell-months with activity in either selected record, rather than defining every possible observed zero cell-month across the entire country. This is a legitimate evaluation choice if stated, but it changes the interpretation of metrics.

Do not equate a nominally fixed sensor with perfect truth or the continuing-sensor diagnostic with a randomized causal control. Explain orbital drift and data-version changes as possible reasons a frozen calibration may not remain stable.

### Lab

The transparent calculator is a useful differentiator for technical judges. The latest rejection summary correctly says one valid value and three excluded for `abc, -5, 0, 10`. Automated accessibility found no violations in the tested Lab state after the updates.

Now validate numeric ranges, empty strings, non-finite values, reversed periods, zero denominators, and insufficient observations in every calculator. The UI should not silently coerce a blank field to a valid zero. Make units visible on inputs and outputs and explain whether a result is an illustration, a fitted estimate, or a calculation from actual data.

The borrowed-model interval problem is especially visible here. Hide false certainty and explain unavailable uncertainty. Clarify κ as an empirical count-scale calibration; a label implying a physical pixel ratio needs careful justification. The diurnal illustration is useful, but a published average curve does not automatically correct each real biome, season, or orbit-drift effect.

A “load example” control with a documented sample is better than an arbitrary default list. Allow copying the calculation with coefficients and fit version. Keep the Lab secondary to the main analyst workflow.

### Data

The public-data approach is a genuine strength. The page should become the reproducibility hub, with a manifest containing file name, purpose, schema, units, time span, geographic scope, row count, size, content hash, fit version, source collection/version, and update time.

Separate aggregate calendars, raw point detections, fitted parameters, validation summaries, season estimates, and recent uncorrected feeds. Clarify which downloads contain country rows versus H3 rows so a user does not sum both and double-count the same data.

Add a minimal copy-and-run example that produces the same selected output as the website. Include expected output and dependency versions. Make the README sufficient for a new reviewer to run a small fixture before attempting the large archive.

One current automated accessibility finding remains: a scrollable Data region is not keyboard focusable. Fix that region and recheck keyboard scrolling. Also replace pointer-only table-row actions with real links/buttons. Sorting should expose direction accessibly, and all exported tables should use the same sorting/filter semantics stated on screen.

### Satellites

The educational distinction among Terra, Aqua, NPP, NOAA-20, and NOAA-21 supports the scientific story. Retain clear separation of platforms used in calibration and those used only in the recent feed.

Make the accelerated orbital clock unmistakable. Predicted positions from TLEs at simulated time are not a real-time operational tracking service. Display source epoch and freshness. Local solar time is not the user's civil time or timezone.

Detection-weighted average observation times can change with the geographic distribution of fires as well as orbit timing. Keep the plots as diagnostics and avoid attributing every movement solely to the orbit without independent comparison. Link the interpretation to actual platform documentation.

For the competition demo, this page is supporting evidence. It should not consume time needed to explain harmonization, validation, and the calendar.

### Live Globe

The revised title and recent-snapshot wording are more accurate. Retain visible fetch/acquisition timestamps, platform mix, raw status, and the inclusion of non-vegetation thermal sources.

The “hottest cells” ranking uses summed FRP over observations in a time window. That is not instantaneous total fire power and not energy released. Repeated observations and multiple platforms influence the sum. Label it “sum of reported FRP across detections in this window,” or prefer a clearly explained peak/summary statistic. Do not imply that a large spike identifies the most dangerous incident.

Supply a table alternative with coordinates, time window, detection counts, platforms, and FRP statistic. Provide a clear pause/reset view and respect reduced-motion preferences in JavaScript as well as CSS. Use a static fallback when WebGL fails. Cache the last successful snapshot and label staleness rather than presenting an old feed as current.

A globe screenshot can be an excellent opening visual; it is not the project's principal scientific contribution. Avoid adding alerts or evacuation recommendations without an entirely different validated product scope.

### About

The revised regional-analyst task is much stronger than a broad firefighting promise. Keep problem, approach, user task, evidence, limitations, credits, and team visible in that order.

Add the exact official challenge title/link, the public project submission link when available, named team members and roles with consent, and a concise account of who made the scientific and engineering decisions. The linked credits and AI disclosure are positive.

“Built in 48 hours” is stronger after the event has actually concluded; during the event, “built for the 2026 Space Apps weekend” is more precise. Maintain an accurate development timeline and disclose permitted pre-event preparation. Do not infer compliance solely from a repository's creation date.

Copyedit the current problem paragraph: a capitalized “Much” follows a dash mid-sentence. More importantly, “fitted per country” should explicitly include the pooled exceptions whenever it summarizes the whole coverage. Consistency across small claims often determines whether a sophisticated presentation feels trustworthy.

<!-- REVIEW_SECTION_09 -->
## 9. Visual design, interaction, accessibility, and performance

The design does not need a wholesale redesign. Improve information hierarchy: controls and the selected result before large explanatory introductions; one prominent analytical conclusion per section; caveats beside the affected number; deeper theory progressively disclosed.

Use the display typography for headlines and the data typography for numbers. Dot-matrix values are distinctive, but a critical metric must remain selectable, readable by assistive technology, and understandable without animation. Avoid long letter-spaced labels at tiny sizes. Inspect muted text over translucent surfaces rather than assuming a nominal token contrast guarantees contrast everywhere.

At 390 pixels, the revised calendar targets measured about 28.9 by 28 CSS pixels and the matrix scrolls internally. At 320 pixels, the tested Explorer did not create whole-page horizontal overflow. These are improvements. They do not establish full accessibility: the calendar still creates hundreds of focusable controls, and scaled SVG labels can be tiny. Provide efficient keyboard navigation and readable mobile tables.

The tested pages produced no uncaught page errors in the main route sweeps. Automated accessibility found no violations in the tested Lab, Explorer, Method, Seasons, and Compare states, with one Data scroll-region finding. Automated checks cannot certify chart comprehension, screen-reader announcements, reading order, touch drawing, focus restoration, or all dynamic states.

Test keyboard alone: open menu, select country, change mode, set date range, inspect a month, dismiss details, reach download, navigate tables, and return. Test screen-reader announcements for value, unit, basis, quality, and missingness. Do not announce every animated number continuously. Use an explicit polite status after filters finish.

The map's source uses mouse drawing events. Verify touch/pointer drawing on real iOS and Android rather than assuming desktop emulation proves it. Typed bounds should remain a fully capable fallback. The latest map has a loading state, bounded timeout, retry, and a textual path forward. I verified the timeout/fallback in this environment. Its message attributes the failure to the tile server, but the test does not independently establish that root cause; use a neutral failure message unless diagnostics identify it.

The earlier sweep transferred roughly 0.8–2.1 MB per route in this environment, with visible route-dependent data and rendering costs. These are diagnostic snapshots, not Lighthouse scores or real-user performance. Cache, headless graphics, connection speed, and deferred resources affect them. Do not publish a “fast everywhere” claim based on these values.

Measure time until the calendar is usable, not just DOMContentLoaded. Test a cold low-end phone, throttled connection, failed data request, blocked map tiles, absent WebGL, and a stale recent feed. Lazy loading the map after the calendar is a sound existing decision. Keep heavy orbital rendering away from the core interaction path. Version related files together to avoid mixed schema/model generations during deployments.

<!-- REVIEW_SECTION_10 -->
## 10. Positioning and originality

Do not present Emberline as the first system that maps fires or provides satellite fire data. NASA FIRMS already provides maps and downloads; GWIS and Global Fire Atlas provide different analytical products. Active-fire detections and burned-area products answer different questions.

A defensible positioning statement is: “Emberline helps people examine how changes in satellite detection affect a long burning-activity record, then explore comparable historical calendars with transparent regional validation.” Your originality can be the integration of harmonization, accessible interaction, uncertainty, and reproducible output. It need not depend on claiming a wholly new logistic method.

Explain the gap in a comparison table: what FIRMS supplies, what Emberline transforms, what the calendar enables, and what remains outside scope. Do not disparage authoritative tools or imply replacement of an operational service. The best outcome is a useful, transparent layer built on NASA data.

<!-- REVIEW_SECTION_11 -->
## 11. Ideas ranked by value

| Idea | Why it matters | Effort / dependency | Priority |
|---|---|---|---|
| Selected-region quality card | Prevents false confidence; makes science visible | Low–medium, published metrics exist | Immediate |
| Exact requested/effective geography with complete cell enumeration | Fixes incorrect spatial semantics | Medium, geometry tests required | Immediate |
| Shareable analysis URL | Makes judging, collaboration, and reproduction easy | Low–medium | Immediate |
| One-page evidence brief with chart + CSV + metadata | Produces something useful outside the website | Medium | High |
| Simple calibrated baseline comparison | Tests whether model complexity adds value | Medium scientific work | High |
| Observed-versus-predicted plot and residuals | Makes validation understandable | Medium | High |
| Current month-to-date comparison | Directly addresses a major challenge requirement | High; platform/filter validation first | High, carefully scoped |
| Quality/coverage map | Makes global expansion honest and navigable | Medium | High |
| Guided strong/weak-fit case studies | Explains strengths and limits in minutes | Low–medium | High |
| Calendar arrow navigation and table view | Makes dense analysis usable | Medium | High |
| Saved comparison presets | Reduces repeated setup | Low after URL state | Medium |
| Finer AOI or point filtering | Makes local management analysis meaningful | High data/storage work | Medium-term |
| Land-cover stratification | Tests different burning regimes | High; external data and validation | Medium-term |
| Hierarchical transfer model | Could improve sparse regions | High scientific work | Research |
| Uncertainty propagation to anomalies | Makes decisions more defensible | High statistical work | Research |
| Offline evidence bundle | Helps poor connectivity and demo resilience | Medium | Medium |
| Language localization | Broadens access to actual target users | Medium; domain review needed | After core workflow |
| Free-form AI chat | May aid explanation but adds grounding risk | Medium–high | Defer |
| Predictive alerts / evacuation advice | Different product with substantial validation needs | Very high | Outside this submission scope |
| More decorative globe effects | Limited gain for challenge completion | Medium | Defer |

The highest-value new feature is an **evidence brief**, not necessarily a chatbot. It can deterministically state: selected place/period; observed versus estimated basis; unusual months; comparison baseline; model quality; actual spatial coverage; data limitations; and source/version. Let users download it with the underlying data. A judge can immediately understand its practical use.

If you later add AI explanation, have it read only the selected structured results and source snippets. Require citations, distinguish measured/modelled/inferred claims, and prohibit fabricated causes or operational advice. A deterministic explanation template is often enough for the current product.

<!-- REVIEW_SECTION_12 -->
## 12. Judging strategy grounded in actual guidance

The official 2026 event page requires registration and project submission through the team's Project tab; it lists a November 15, 23:59 local deadline. Confirm your team's event clock and any earlier local presentation cutoff. The current guide pages did not load reliably in my research. The official 2025 judging document lists impact, creativity, validity, relevance, and presentation; I use these as a clearly labeled historical framework, not a verified 2026 weighting scheme. Recent answers on NASA's Space Apps discussion forum describe a short demo of under 30 seconds or up to seven slides. Check the current submission form before finalizing format.

| Criterion framework | Emberline's strongest evidence | What would improve the case |
|---|---|---|
| Impact | An analyst can compare historical activity on a consistent reference basis | Show a real task, user feedback, and a usable exported brief |
| Creativity | Transparent harmonization integrated with an accessible calendar | Explain how the integration differs from simply mapping existing detections |
| Validity | Held-out results, baselines, fit parameters, source code | Fix false uncertainty; improve quality gates, baselines, and spatial correctness |
| Relevance | Direct work on MODIS/VIIRS discontinuity and historical calendars | Address current-month comparison or explicitly delimit it |
| Presentation | Cohesive design and rich demonstrations | Show one result, one proof, and one user outcome without a tour of every page |

Do not invent percentage weights, judge scores, or a probability of winning. My practical emphasis is validity and relevance because those are where the remaining defects can undercut otherwise strong presentation.

Best Use of Data and Best Use of Science are sensible award narratives based on the historical award categories. Treat them as positioning choices, not a guarantee of category availability or selection. The data story is immediately strong; the science story becomes stronger when failure modes and alternatives are handled rigorously. Claims of broad societal impact need evidence beyond a list of possible users.

<!-- REVIEW_SECTION_13 -->
## 13. A stronger submission package

Prepare a frozen release URL, public repository tag/commit, concise project summary, technical explanation, NASA-data mapping, honest limitations, complete credits, and AI-use disclosure. Test every public link logged out. A working Vercel URL is not itself the official project submission.

Explain what each NASA dataset contributes: MODIS Terra/Aqua archive for source history/reference; Suomi-NPP VIIRS for harmonized later history; NOAA-20/21 and MODIS recent feeds for the separate raw recent view. Include collections/versions, dates, filters, and actual use. Distinguish non-NASA dependencies such as basemap, country outlines, orbital-element access, and published diurnal parameters.

The repository submission document contains stale claims, including correcting orbit drift and comparing today with history in a proposed script. Those claims should not appear in the final demo unless implemented and validated. It also contains advice about deleting/recreating repositories around the event boundary. Do not follow that as a compliance strategy: repository visibility or recreation does not establish when work occurred. Preserve accurate history and disclose preparation/work honestly under the applicable rules. This review does not determine whether any violation occurred.

AI disclosure should describe actual tools and uses, including coding, research, text, and any generated media. Verify the current media-labeling requirements in the official form/guide rather than relying on a stale internal checklist. A statement that every scientific choice was made by the team must reflect what actually happened.

A proposed concise summary:

“Emberline turns NASA FIRMS MODIS and VIIRS records into an interactive historical burning-activity calendar. It estimates an Aqua-MODIS-equivalent record using regional models and shows held-out performance so users can understand where the correction is reliable and where it is experimental. Analysts can compare seasons, inspect unusual months, and download traceable results. The current comparable archive covers 2003–2025; the recent globe is a separate uncorrected view.”

This summary describes the current historical scope. Update it only when the product changes.

<!-- REVIEW_SECTION_14 -->
## 14. Demo and presentation blueprint

A short demo should communicate problem → transformation → evidence → useful result. It should not attempt to visit eleven pages. Use a strong, documented example and acknowledge variability. Keep the actual exported result available if a judge follows the link.

**Approximately 25–28 seconds of narration, to rehearse rather than assume:**

“Satellite changes can look like changes in fire activity. Emberline uses NASA FIRMS data to estimate a comparable historical record. Switch from raw to harmonized, inspect a region's validation, and find unusually active months. Download the result with its source and fit version. Regional quality varies, so Emberline makes the limits visible.”

Show the discontinuity, toggle, selected quality, anomaly panel, and export. Do not claim the jump vanishes everywhere or that fires did not change. Do not claim a current-month workflow until it exists. Record at a readable scale with captions and no slow introductory animation. Time the exported video, including title/end frames, against the current permitted limit.

If a slide demo is accepted, a seven-slide structure is: (1) user/problem and challenge; (2) why raw records are not directly comparable; (3) data/model/matching/scaling; (4) held-out results including one limitation; (5) calendar-to-brief workflow; (6) coverage, uncertainty, and validation roadmap; (7) team, sources, links, and next step. Do not put every equation or all 171 countries on a slide.

For a longer local pitch, first confirm the local duration. Spend most of it on the problem, one interaction, and one proof. Leave implementation details and the orbital demonstration for questions. Prepare a fallback recording and static evidence in case Wi-Fi, map tiles, or WebGL fail.

<!-- REVIEW_SECTION_15 -->
## 15. Questions judges may ask, and honest answers to prepare

**Why not just use FIRMS?** FIRMS is the source and an excellent access tool. Emberline adds an explicitly evaluated harmonization layer and a historical comparison workflow; explain the precise additional transformation.

**Are these numbers actual fires?** No. They are filtered detections or estimated reference-equivalent detections, depending on the selected basis. Multiple detections can relate to one incident; missed observations also occur.

**Does the model remove real climate trends?** It is designed to reduce a sensor discontinuity, but that must be tested. Show held-out comparisons, the continuing-sensor diagnostic, and sensitivity results. Do not claim a formal causal separation.

**Why Aqua?** Its nominal afternoon observation timing overlaps the relevant NPP record and gives a useful reference scale. It remains an imperfect observing system, and drift/coverage limitations are explicit.

**Why 2003?** It avoids presenting a partial early Aqua year as a complete comparable year. Distinguish this from raw MODIS archive coverage beginning earlier.

**Why use country models?** They are a tractable regional approximation. Borders do not define fire ecology; land-cover/regional alternatives are a next validation step. Borrowed models are marked separately.

**What happens in a poor-fit country?** Show its published metrics and experimental status. Explain what outputs remain usable and what inference should be withheld. Do not answer only with the best country score.

**Why does the threshold beat you in the United States?** The FRP logistic approach is not universally best. Investigate heterogeneity and baselines; do not choose on the test set and then rebrand the result as independent validation.

**Can a firefighter use this during an incident?** The current product supports historical analysis and situational context, not incident command, forecasts, or evacuation decisions.

**Can you compare today with 2005?** Not yet through the current recent feed without an additional validated bridge. Demonstrate the historical comparison honestly and describe the missing platform/filter work.

**What is uncertain?** Observation sampling, matching, model parameters, count scaling, transfer between regions, and temporal change. Explain which are currently quantified and which are only acknowledged.

**What did the team actually build?** Describe actual contributions, tools, pre-event preparation, event work, and AI assistance. Avoid implying that using libraries or assistance means no original contribution; equally, do not obscure it.

<!-- REVIEW_SECTION_16 -->
## 16. User research and proof of impact

Recruit a few relevant people if available: a regional fire analyst, land/agricultural manager, remote-sensing researcher, and a non-specialist who regularly interprets environmental reports. Do not claim interviews happened unless they did. Use a short task-based session, not a general “do you like it?” survey.

Ask them to find their area; explain raw versus harmonized; identify the most unusual months in a given historical year; determine whether the correction is trustworthy there; export evidence; and explain what action the result can and cannot support. Observe without coaching first.

Measure task completion, time to the first correct interpretation, mistaken claims about incidents/burned area, ability to locate limitations, and successful reproduction from the export. Record one specific change prompted by feedback. A small honest study is more persuasive than invented large adoption numbers.

For longer-term product impact, measure repeat analyses, successful exports, reproducible shared views, and analyst time saved against a documented existing workflow. Avoid treating globe spins, page views, or an unvalidated “lives saved” estimate as impact evidence.

<!-- REVIEW_SECTION_17 -->
## 17. Practical implementation order

**First: freeze and correct trust-critical behavior.** Fix invalid coordinates and incomplete area enumeration; replace zero-width borrowed-model intervals; separate error statuses from data insufficiency; expose selected-country limitations. Update any stale claims in README/submission materials. These are more urgent than extending coverage.

**Second: complete a useful analytical path.** Add URL state, a clear quality/provenance card, a readable table view, and a chart/evidence export. Verify one strong case, one weak case, one pooled case, and one unavailable case end to end. If time is tight, prioritize a reliable national workflow over an unreliable promise of precise local rectangles.

**Third: strengthen proof.** Add the simple calibrated baseline, observed-versus-predicted plot, residual diagnostics, and sensitivity checks. Keep the evaluation split honest. Treat a reduction in apparent performance caused by better testing as useful information, not a presentation problem to hide.

**Fourth: address current-period scope.** Either implement a small, validated current month-to-date pathway with compatible data or explain the precise missing bridge. Do not spend the final hours making an incompatible ratio look polished.

**Fifth: rehearse and submit.** Freeze the demo, verify public links and source credits, confirm format and local deadline, and leave time for a failed upload or deployment. Keep a concise limitation statement in the submitted materials.

For a two-person team, one person can own scientific/data correctness and the other the analysis workflow/export/presentation. They should review each other's most consequential assumptions. Avoid simultaneous edits to the same data manifest or public wording without an agreed release snapshot.

Longer-term priorities are finer geography, reliable current data, hierarchical/land-cover calibration, observation completeness, uncertainty propagation, and user validation. These are research and product work, not a weekend checkbox list.

<!-- REVIEW_SECTION_18 -->
## 18. Acceptance tests worth retaining

| Scenario | Expected result |
|---|---|
| Canada, harmonized, 2023 | Twelve monthly rows; chart/export agree within stated rounding; fit version included |
| China or Spain | Poor fit is explained in context; no “accuracy percentage” interpretation |
| Republic of Korea | Borrowed model identified; unavailable uncertainty is not a zero-width confidence claim |
| Iceland | Raw availability and reason for missing correction are accurate, distinct from numerical failure |
| No-observation territory | Missing/unavailable is not labeled zero fire or guaranteed raw coverage |
| Latitude 100–110° | Field-level validation, no query/result |
| Blank/reversed bounds | Clear error or explicitly supported interpretation |
| Antimeridian rectangle | Correct wrapped selection or clear unsupported message |
| Continental rectangle | Complete included-cell set; no silent sampling loss |
| Tiny rectangle | Effective whole-cell coverage clearly shown; no false local precision |
| One selected year | One-year representation, no triangular time series |
| Cross-year season | Complete start/end dates, no incomplete terminal season presented as complete |
| Zero historical median | Meaningful non-ratio state; no misleading infinity |
| Share/refresh/back | Same area, mode, period, baseline, and selected view restored |
| CSV/report | Exact geometry, basis, units, fit, source, quality and exclusions carried through |
| Invalid Lab list | Accepted/excluded values explained and associated with input |
| Keyboard calendar | Efficient arrow navigation and a route past the grid |
| Keyboard tables | Country/detail actions and scrolling reachable without pointer |
| Reduced motion | JS and CSS movement reduced; important data remains visible |
| Data/map failure | Actionable status, retry, stale/fallback status, preserved inputs |
| Mixed file versions | Detected and rejected or explicitly resolved; no silent combination |
| Recent feed | Acquisition cutoff, platform mix, raw status, and stale state visible |
| Mobile 320/390 and zoom | No whole-page overflow; labels/controls usable; chart alternative readable |
| Exported demo | Actual duration/slide count within current form limits; links accessible logged out |

Do not write superficial tests that mirror markup while leaving geometry and inference untested. The important tests assert user-visible meaning, numerical agreement, coverage, and failure handling.

<!-- REVIEW_SECTION_19 -->
## 19. Release and evidence hygiene

Keep a manifest connecting deployment commit, fit version, data hashes, schema version, and source archive dates. Host related files under a versioned path and swap the manifest atomically. The existing fallback from global files to four-country files can be useful, but it should never silently mix one dataset's parameters with another dataset's calendars or summaries. Verify the fallback on a blocked-file test and show its status prominently.

Add a small reproducible fixture and commands for ingestion checks, fitting, building tables, numerical cross-checks, and web build. The repository has ingestion tests and checking scripts; the improvement is a clear, runnable path and current results, not a claim that no tests exist.

Do not expose private credentials in client code or generated exports. This review found a public static-data design, not a need for user accounts. Avoid adding authentication, billing, a database, or notifications unless the actual workflow requires them. Maintain third-party attribution when exporting figures and maps.

Give every headline number a reproducible definition. Store narrative statistics in generated metadata where feasible so copy does not drift after a global refresh. That includes fitted counts, raw-only counts, negative-R² counts, median scores, and latest acquisition time.

<!-- REVIEW_SECTION_20 -->
## 20. Source notes

The supplied challenge text is the principal requirement source. Official challenge page: https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/

Current product and data: https://emberline-tan.vercel.app/explorer ; https://emberline-tan.vercel.app/method ; https://emberline-tan.vercel.app/data/params_global.json ; https://emberline-tan.vercel.app/data/countries.json ; https://emberline-tan.vercel.app/data/season.json

Source snapshot: https://github.com/modularktech-hash/emberline/tree/f0222b3e76585c97e44a0e0be8e81008a83ce195 . Earlier science source is unchanged in the inspected comparison. Relevant files include scripts/fit_harmonization.py, scripts/build_insights.py, scripts/build_live.py, web/src/lib/aoi.ts, web/src/lib/queries.ts, and the corresponding page components.

NASA FIRMS cautions: https://firms.modaps.eosdis.nasa.gov/alerts/notes.php and https://forum.earthdata.nasa.gov/viewtopic.php?t=5188 . Active-fire sampling can miss fires; detection pixels are not incident counts or burned-area measurements. These support the interpretation limits above, not the site's particular fitted performance.

Related authoritative products: https://firms.modaps.eosdis.nasa.gov/map/ ; https://gwis.jrc.ec.europa.eu/about-gwis/technical-background/statistics ; https://doi.org/10.3334/ORNLDAAC/1642 . Their purposes differ; no claim of feature-for-feature benchmarking is made.

Event and submission: https://www.spaceappschallenge.org/2026/ ; https://www.spaceappschallenge.org/resources/project-submission-guide/ ; https://www.spaceappschallenge.org/resources/judging-awards-guide/ ; https://github.com/nasa/spaceapps/discussions/1991 . Guide pages returned errors during research; discussion answers supplement but do not replace the current form.

Historical judging framework: https://spaceapps-v2-staging.s3.amazonaws.com/media/documents/Final_Space_Apps_2025_Judging_Guidelines_for_web.pdf . This is explicitly the 2025 document, not a claimed 2026 official rubric.

Citation/originality context: https://www.spaceappschallenge.org/legal/ and https://github.com/nasa/spaceapps/discussions/1813 . Confirm applicable current terms with organizers when interpreting event-specific preparation. Nothing in this review establishes a violation or recommends concealing history.

<!-- REVIEW_SECTION_21 -->
## 21. What success would look like

A reviewer opens a shared link and immediately knows the place, period, unit, model quality, and actual coverage. They can explain why raw counts differ across sensors, see a held-out comparison, identify a genuinely unusual historical period, and download a result another person can reproduce. A weak or unavailable region is handled honestly. Current observations are compared only when their basis is compatible. The demo and submission make exactly those claims—no more and no less.

That is the strongest path from an impressive website to a convincing Space Apps entry.


# Actionable backlog — 59 items

Statuses describe the audit snapshot. `[ ]` means not implemented/verified by this handoff, not necessarily still broken in the current repository. `[x]` means verified improved during the original review. Effort S/M/L is relative, not a time promise. Priority P0 identifies trust-critical fixes in this review; it is not an official NASA severity scale.

### E01 — Reject impossible and empty coordinates

- [x] **Status:** P0 · Confirmed · Geography · effort S — **Done, verified 14 Nov (f339b28)**
- **Evidence:** 10,100,20,110 accepted and returns data
- **Acceptance:** Inline error; no query for invalid latitude/longitude or blank fields
- **Implementation / verification notes:**
  - *Reproduced before the fix* (Playwright, Chromium, `next start` of a12080e code): 10,100,20,110 issued a query (2 parquet requests, "Custom area" result); blank south ran as latitude 0 (7 requests); east 200 ran (5 requests); blank/south>north/text were silently ignored with no message; an antimeridian box W 170 / E -170 was silently ignored.
  - *Implemented:* `validateBoxInput` in `web/src/lib/aoi.ts` (strict decimal parse — blank, text, `Infinity`, hex rejected; lat within ±90; lon within ±180; south < north; west != east). `web/src/components/Explorer.tsx`: no `setArea` (so no query) on invalid input; user's entry preserved; per-field `aria-invalid` + `aria-describedby` message; summary in a `role="alert"` `aria-live` region; help text states the rules. Antimeridian policy documented in `aoi.ts`: west > east = box crossing 180° (matches packages/firms-ingest); drawn boxes are wrapped into [-180, 180] (`normalizeDrawnBbox`); `AoiMap.tsx` draws and fits such boxes across the Pacific.
  - *Verified:* Playwright matrix 8/8 PASS — lat 100-110, all blank, south blank, lon 200, south>north, text: each shows the error, marks the field(s) aria-invalid, 0 new parquet requests; Portugal box (-9.5, 37, -6.2, 42.2) queries (6 of 6 cells with data) and W170/E-170 queries. Canada/Portugal country results (busiest month/year, held-out R², raw and harmonized) identical to the live site. tsc + build pass.
  - *Not verified:* screen-reader announcement with a real AT (only the ARIA attributes were checked).

### E02 — Replace fixed lattice with complete cell coverage

- [x] **Status:** P0 · Confirmed · Geography · effort M — **Done, verified 14 Nov (cd3641f)**
- **Evidence:** aoi-sampling.json; latest bboxToParents still samples225 positions
- **Acceptance:** Reference geometry agrees for tiny/narrow/continental/polar/wrapped boxes
- **Implementation / verification notes:**
  - *Reproduced:* `bboxToParents` in `web/src/lib/aoi.ts` still sampled a 15x15 lattice (225 points) at res 2.
  - *Implemented:* `bboxToParents` now returns every res-2 cell meeting the closed box (semantics: any point of the box maps to the cell under `latLngToCell`). Lattice seeds, then flood fill over `gridDisk(1)` neighbours with an exact cell/rectangle test (geodesic cell edges densified, longitudes unwrapped, polar cells closed through the pole, antimeridian boxes split in two). No cap: res 2 has 5,882 cells, near-global box ~120 ms in Node. Range reads unchanged (still filtered on `h3_parent` via `queries.ts`); `getCalendar` key bookkeeping moved to Sets for thousands of keys. `cellsExtent` reports antimeridian extents as west > east. Explorer note adds that every touched cell is included.
  - *Verified:* `node --experimental-strip-types web/scripts/check-aoi-coverage.ts` (dense-lattice + 10x denser edge-walk reference): 14/14 PASS, 0 missing and 0 extra in every case — tiny 0.05° (1 cell), tiny 0.01° (1), tiny on a cell vertex (3), narrow 60x0.2° (26), narrow 0.1x70° (34), India (134), Australia (218), Africa -20,-35,55,38 (781; old lattice 225, 556 missing), north cap (57), polar sector (40), south polar (55), W170/E-170 (45), W150/E-120 (227), near-global (5,872; old 215). Browser (Playwright): Africa box 781 touched / 482 with data in ~3 s, near-global 5,872 / 2,118 in ~3.6 s, no page errors; Portugal box unchanged (6 of 6); Canada/Portugal country results identical to the live site.
  - *Not verified / out of scope:* the reference is dense sampling (a lower bound), not an analytic oracle; agreement is exact at the steps used. Res-2 cells remain coarse for local work (review §6) — finer cells or point queries are a separate item.

### E03 — Remove false zero-width pooled confidence intervals

- [ ] **Status:** P0 · Confirmed · Science · effort S
- **Evidence:** 41/41 pooled coefficient intervals identical; pooled-lab.txt
- **Acceptance:** Unavailable uncertainty null and labeled; valid intervals computed separately
- **Implementation / verification notes:** Data part done and verified (d7bb38f): `params_global.json` carries `coef_ci_estimated` (false for the 41 pooled fits, true for 130 own fits). UI part (Lab/Method must not draw a zero-width interval) not yet verified.

### E04 — Separate fit exceptions from scientific insufficiency

- [ ] **Status:** P1 · Confirmed · Data · effort M
- **Evidence:** 66 TypeError entries in params failed dictionary
- **Acceptance:** Reason-coded outcome and data counts for each unavailable fit
- **Implementation / verification notes:** Data part done and verified (d7bb38f): `web/public/data/coverage_status.json` classifies all 237 countries; the 66 TypeErrors traced to three lines in `fit_harmonization.py` (31 threshold-loop, 9 null-control, 26 bootstrap) and are all data insufficiency, 0 numerical failures. UI wiring pending.

### E05 — Correct raw-only availability count

- [ ] **Status:** P1 · Confirmed · Coverage · effort S
- **Evidence:** 61/66 unavailable fits have raw calendars
- **Acceptance:** Coverage summary distinguishes raw-only from no calendar
- **Implementation / verification notes:** Data part done and verified (d7bb38f): 232 countries have raw calendar rows; of the 66 unfitted, 61 have raw calendars and 5 have none (American Samoa, Antarctica, Maldives, Marshall Islands, South Georgia). UI count pending.

### E06 — Show selected-region quality interpretation

- [ ] **Status:** P1 · Observed gap · Science · effort M
- **Evidence:** 35 negative R2; metrics visible but no strong interpretation
- **Acceptance:** Weak country clearly labeled across analytical pages and exports
- **Implementation / verification notes:** Not started in this handoff.

### E07 — Design compatible current month-to-date comparison

- [ ] **Status:** P1 · Observed gap · Challenge · effort L
- **Evidence:** Historical calendar ends2025; live platform mix differs
- **Acceptance:** Validated bridge, same elapsed period, filtering and completeness disclosed
- **Implementation / verification notes:** Not started in this handoff.

### E08 — Persist area mode dates and baseline in URL

- [ ] **Status:** P1 · Observed gap · Workflow · effort M
- **Evidence:** Refresh resets2023 range to2003–2025
- **Acceptance:** Shared link refresh/back restores exact analysis
- **Implementation / verification notes:** Not started in this handoff.

### E09 — Export an evidence brief and chart

- [ ] **Status:** P1 · Observed gap · Export · effort M
- **Evidence:** MonthlyCSV verified; no end-to-end brief
- **Acceptance:** Readable figure plus metadata, CSV and quality caveats
- **Implementation / verification notes:** Not started in this handoff.

### E10 — Evaluate training-only scalar calibration baseline

- [x] **Status:** P1 · Observed gap · Science · effort M
- **Evidence:** Current baselines rawVIIRS and FRPthreshold
- **Acceptance:** Untouched evaluation reports model versus calibrated simpler baseline
- **Implementation / verification notes:** Done and verified (d7bb38f): training-only Aqua/Suomi-NPP ratio baseline, 2012-2018 applied to 2019-2021. Model R2 higher in 84 of 171 countries, not higher in 87; lower MAE in 141 of 171. Written up in `docs/results.md`; `validation_points.json` published. Showing it in the app is pending.

### E11 — Investigate threshold wins

- [ ] **Status:** P1 · Observed gap · Science · effort L
- **Evidence:** 21 countries thresholdR2 above model
- **Acceptance:** Weakness explained; any selection uses separate validation/test
- **Implementation / verification notes:** Not started in this handoff.

### E12 — Rename causal sensor-share wording

- [ ] **Status:** P1 · Source concern · Science · effort S
- **Evidence:** Trends sensor share ratio
- **Acceptance:** Descriptive difference and denominator safeguards, no causal claim
- **Implementation / verification notes:** Not started in this handoff.

### E13 — Verify complete cross-year seasons

- [ ] **Status:** P1 · Source concern · Seasons · effort M
- **Evidence:** Calendar ends2025; fireyears may cross into2026
- **Acceptance:** Incomplete terminal seasons excluded or explicitly partial
- **Implementation / verification notes:** Not started in this handoff.

### E14 — Make coarse scope impossible to miss

- [ ] **Status:** P1 · Observed gap · Geography · effort M
- **Evidence:** Whole H3res2 cells summed; actual outlines now implemented
- **Acceptance:** Requested and effective bounds, cellIDs and resolution in UI/export
- **Implementation / verification notes:** Not started in this handoff.

### E15 — Include exact geometry and cell IDs in export

- [ ] **Status:** P1 · Observed gap · Reproducibility · effort S
- **Evidence:** CurrentCSV has rounded label and cellcount
- **Acceptance:** Re-running export metadata returns same set and totals
- **Implementation / verification notes:** Not started in this handoff.

### E16 — Prevent mixed versions and fallback datasets

- [ ] **Status:** P1 · Source concern · Release · effort M
- **Evidence:** Independent fallback loaders and metadata sources
- **Acceptance:** Manifest validates version/schema and fallback consistency
- **Implementation / verification notes:** Not started in this handoff.

### E17 — Rewrite stale demo and README claims

- [x] **Status:** P1 · Observed gap · Submission · effort S
- **Evidence:** docs/submission.md claims drift correction/today comparison
- **Acceptance:** Every submitted statement matches frozen implementation
- **Implementation / verification notes:** Reproduced: `docs/submission.md` 30-s script claimed orbit-drift correction and "compare today against history" and advised deleting/recreating repos; README said "fits, per country" without the 41 pooled exceptions, called all 66 unfitted "too sparse", and omitted the 21 threshold wins and the scalar-baseline result; `docs/gameplan.md` demo said "the step vanishes" / "we corrected what changed in orbit". Implemented: rewrote README, submission.md (script, draft summary, checklist, repo advice replaced with "preserve accurate history, disclose honestly"), gameplan.md demo steps; every figure recomputed from `params_global.json` / `coverage_status.json` / `docs/results.md` (130/41/66, 23/17/18/8, 35 negative, 21 threshold, 84/171 R², 141/171 MAE). Verified: numbers recomputed by script; grep finds no remaining drift-correction or today-vs-history claim in README/submission/gameplan. Not verified: Use-of-AI wording and pre-event history statement (owner, E19); docs/research-findings.md still discusses drift correction as a research idea (not submission-facing).

### E18 — Confirm current form and local event deadlines

- [ ] **Status:** P1 · Required verification · Submission · effort S
- **Evidence:** 2026 guides unavailable to fetch reliably
- **Acceptance:** Current format, deadline and public links verified by team
- **Implementation / verification notes:** Not started in this handoff.

### E19 — Disclose actual work history and assistance

- [ ] **Status:** P1 · Required verification · Submission · effort S
- **Evidence:** Internal docs include repo recreation advice
- **Acceptance:** Accurate timeline; no concealment; current organizer rules applied
- **Implementation / verification notes:** Not started in this handoff.

### E20 — Make Data scroll region focusable

- [ ] **Status:** P2 · Confirmed · Accessibility · effort S
- **Evidence:** axe-data.json one scrollable-region-focusable violation
- **Acceptance:** Keyboard can reach and scroll region; axe regression passes
- **Implementation / verification notes:** Not started in this handoff.

### E21 — Make table row actions keyboard operable

- [ ] **Status:** P2 · Source concern · Accessibility · effort S
- **Evidence:** Trends/Data clickable rows
- **Acceptance:** Named links/buttons usable by keyboard with focus indication
- **Implementation / verification notes:** Not started in this handoff.

### E22 — Add efficient calendar navigation and table view

- [ ] **Status:** P2 · Observed gap · Accessibility · effort M
- **Evidence:** Hundreds of button Tab stops
- **Acceptance:** Roving focus/arrow keys or equally capable table; easy exit
- **Implementation / verification notes:** Not started in this handoff.

### E23 — Screen-reader end-to-end review

- [ ] **Status:** P2 · Required verification · Accessibility · effort M
- **Evidence:** Automated checks only partial coverage
- **Acceptance:** Area/mode/unit/basis/quality announced; no animation chatter
- **Implementation / verification notes:** Not started in this handoff.

### E24 — Verify touch area drawing

- [ ] **Status:** P2 · Required verification · Mobile · effort M
- **Evidence:** Map source uses mouse events
- **Acceptance:** Real iOS/Android drawing or clear typed alternative
- **Implementation / verification notes:** Not started in this handoff.

### E25 — Verify JS reduced-motion behavior

- [ ] **Status:** P2 · Required verification · Motion · effort S
- **Evidence:** CSS and globe reduction exist; JS charts animate
- **Acceptance:** All nonessential movement paused/reduced; data still visible
- **Implementation / verification notes:** Not started in this handoff.

### E26 — Show observed versus predicted and residuals

- [ ] **Status:** P2 · Observed gap · Charts · effort M
- **Evidence:** Validation table extensive; difficult quick interpretation
- **Acceptance:** Readable validation plots with units/split and weak examples
- **Implementation / verification notes:** Not started in this handoff.

### E27 — Propagate appropriate uncertainty

- [ ] **Status:** P2 · Source concern · Statistics · effort L
- **Evidence:** Coefficient/score intervals not monthly intervals
- **Acceptance:** Output uncertainty accurately labeled and separately computed
- **Implementation / verification notes:** Not started in this handoff.

### E28 — Explain weighted-coefficient pooling

- [ ] **Status:** P2 · Source concern · Statistics · effort M
- **Evidence:** fit_harmonization weighted coefficients
- **Acceptance:** Name transfer method and validate out-of-country performance
- **Implementation / verification notes:** Not started in this handoff.

### E29 — Test matching rule sensitivity

- [ ] **Status:** P2 · Source concern · Statistics · effort L
- **Evidence:** SameUTCdate and neighboringres7 cells
- **Acceptance:** Distance/time sensitivity and examples reported
- **Implementation / verification notes:** Not started in this handoff.

### E30 — Document evaluation population

- [ ] **Status:** P2 · Source concern · Statistics · effort S
- **Evidence:** Union of active cellmonths
- **Acceptance:** Denominator/zero-cell inclusion and scale explicit
- **Implementation / verification notes:** Not started in this handoff.

### E31 — Add slope uncertainty and endpoint sensitivity

- [ ] **Status:** P2 · Observed gap · Trends · effort M
- **Evidence:** Point slopes with caveat
- **Acceptance:** CI/usable years/sensitivity shown or descriptive-only label
- **Implementation / verification notes:** Not started in this handoff.

### E32 — Respect monthly estimate precision

- [ ] **Status:** P2 · Source concern · Trends · effort S
- **Evidence:** 5 monthly countries; maximum trend discrepancy37.61
- **Acceptance:** Approximate dates and method differences remain visible
- **Implementation / verification notes:** Not started in this handoff.

### E33 — Add absolute anomaly and zero-median handling

- [ ] **Status:** P2 · Observed gap · Seasons · effort M
- **Evidence:** Ratio interpretation fragile nearzero
- **Acceptance:** Difference, ratio where defined, baseline n and years
- **Implementation / verification notes:** Not started in this handoff.

### E34 — Carry both model-quality states

- [ ] **Status:** P2 · Observed gap · Compare · effort S
- **Evidence:** Countries can have very different validation
- **Acceptance:** Own/pooled/weak status alongside each series
- **Implementation / verification notes:** Not started in this handoff.

### E35 — Explain indexing and common period

- [ ] **Status:** P2 · Observed gap · Compare · effort S
- **Evidence:** Own-country mean index
- **Acceptance:** Reference years and missing/zero-mean behavior explicit
- **Implementation / verification notes:** Not started in this handoff.

### E36 — Label summed FRP correctly

- [ ] **Status:** P2 · Source concern · Globe · effort S
- **Evidence:** build_live sums observations over time
- **Acceptance:** No instantaneous power/energy interpretation of window sum
- **Implementation / verification notes:** Not started in this handoff.

### E37 — Test stale snapshot and WebGL fallback

- [ ] **Status:** P2 · Required verification · Globe · effort M
- **Evidence:** Recentfeed timestamp shown; graphics environment dependent
- **Acceptance:** Stale/fallback state and table remain usable
- **Implementation / verification notes:** Not started in this handoff.

### E38 — Publish versioned manifest and schema

- [ ] **Status:** P2 · Observed gap · Data · effort M
- **Evidence:** Static files available; distributed metadata
- **Acceptance:** Hashes, units, coverage, versions and source products documented
- **Implementation / verification notes:** Not started in this handoff.

### E39 — Distinguish country and grid rows

- [ ] **Status:** P2 · Observed gap · Data · effort S
- **Evidence:** CalendarParquet has multiple scopes
- **Acceptance:** Examples never double-count combined scopes
- **Implementation / verification notes:** Not started in this handoff.

### E40 — Add reproducible small fixture and setup

- [ ] **Status:** P2 · Observed gap · Docs · effort M
- **Evidence:** README lacks complete new-reviewer pathway
- **Acceptance:** Fresh environment reproduces one known output
- **Implementation / verification notes:** Not started in this handoff.

### E41 — Add challenge project and team links

- [ ] **Status:** P2 · Observed gap · About · effort S
- **Evidence:** GenericTeamModulark and challenge phrase
- **Acceptance:** Verified official challenge/project links and roles with consent
- **Implementation / verification notes:** Not started in this handoff.

### E42 — Reconcile pooled wording in summaries

- [ ] **Status:** P2 · Confirmed · Copy · effort S
- **Evidence:** Method intro everycountry separately;41pooled
- **Acceptance:** All summaries distinguish fitted and borrowed curves
- **Implementation / verification notes:** Not started in this handoff.

### E43 — Align titles with current23-year headline

- [ ] **Status:** P2 · Confirmed · Copy · effort S
- **Evidence:** Old25-year default title remains in captures
- **Acceptance:** Metadata headline/social preview agree
- **Implementation / verification notes:** Not started in this handoff.

### E44 — Clarify partial Aqua2002 reference

- [ ] **Status:** P2 · Confirmed · Copy · effort S
- **Evidence:** Home says2001–2002 noAqua reference
- **Acceptance:** First full reference year explanation without denying2002 observations
- **Implementation / verification notes:** Not started in this handoff.

### E45 — Run analyst task sessions

- [ ] **Status:** P2 · Observed gap · User research · effort M
- **Evidence:** No field study performed in this review
- **Acceptance:** Task outcomes recorded; improvement traced to feedback
- **Implementation / verification notes:** Not started in this handoff.

### E46 — Produce one strong/one weak case study

- [ ] **Status:** P2 · Observed gap · Presentation · effort M
- **Evidence:** Many features but diffuse story
- **Acceptance:** Each case has question evidence limitation and export
- **Implementation / verification notes:** Not started in this handoff.

### E47 — Measure cold mobile time-to-analysis

- [ ] **Status:** P2 · Required verification · Performance · effort M
- **Evidence:** Diagnostic transfer not realuser metric
- **Acceptance:** Repeatable budget and lowend/slowconnection measurements
- **Implementation / verification notes:** Not started in this handoff.

### E48 — Test data failure and retry

- [ ] **Status:** P2 · Required verification · Failure states · effort M
- **Evidence:** Static loaders may fail independently
- **Acceptance:** Preserve input; actionable status; no wrong-data fallback
- **Implementation / verification notes:** Not started in this handoff.

### E49 — Add finer local geometry

- [ ] **Status:** P3 · Future idea · Geography · effort L
- **Evidence:** Currentres2 too coarse forlocalmanagement
- **Acceptance:** Validated finer aggregation or pointfiltering
- **Implementation / verification notes:** Not started in this handoff.

### E50 — Test land-cover or hierarchical models

- [ ] **Status:** P3 · Future idea · Science · effort L
- **Evidence:** Countryborders approximate ecology
- **Acceptance:** Newmodel evaluated with blocked validation and clear scope
- **Implementation / verification notes:** Not started in this handoff.

### E51 — Add offline evidence and localization

- [ ] **Status:** P3 · Future idea · Access · effort L
- **Evidence:** No demonstrated need yet
- **Acceptance:** Target-user validation and maintainable update plan
- **Implementation / verification notes:** Not started in this handoff.

### E52 — Correct historical coverage wording

- [x] **Status:** Done · Verified improvement · Copy · effort S
- **Evidence:** Latest Explorer2003–2025 and separate live layer
- **Acceptance:** Retain regression check
- **Implementation / verification notes:** Preserve existing fix; recheck if touched.

### E53 — Rename season midpoint and fix month ticks

- [x] **Status:** Done · Verified improvement · Charts · effort S
- **Evidence:** Final Trends hasJul throughJun withFeb
- **Acceptance:** Retain regression check
- **Implementation / verification notes:** Preserve existing fix; recheck if touched.

### E54 — Correct one-year chart

- [x] **Status:** Done · Verified improvement · Charts · effort S
- **Evidence:** one-year screenshot and latestsource
- **Acceptance:** Retain regression check
- **Implementation / verification notes:** Preserve existing fix; recheck if touched.

### E55 — Report rejected FRP entries and accessible names

- [x] **Status:** Done · Verified improvement · Lab · effort S
- **Evidence:** latestLab rejects3 of4;axe no violations
- **Acceptance:** Retain regression check
- **Implementation / verification notes:** Preserve existing fix; recheck if touched.

### E56 — Larger calendar cells and Escape menu close

- [x] **Status:** Done · Verified improvement · Mobile · effort S
- **Evidence:** 28.9x28targets;menuAfterEscape false
- **Acceptance:** Retain regression check
- **Implementation / verification notes:** Preserve existing fix; recheck if touched.

### E57 — Show loading timeout retry fallback

- [x] **Status:** Done · Verified improvement · Map · effort S
- **Evidence:** map-final.png displays retry and typedfallback
- **Acceptance:** Verify healthy map separately onrealdevice
- **Implementation / verification notes:** Preserve existing fix; recheck if touched.

### E58 — Expose kappa bias and RMSE

- [x] **Status:** Done · Verified improvement · Science · effort S
- **Evidence:** LatestMethod andExplorer
- **Acceptance:** Retain regression check
- **Implementation / verification notes:** Preserve existing fix; recheck if touched.

### E59 — Link datasets and papers

- [x] **Status:** Done · Verified improvement · Credits · effort S
- **Evidence:** LatestAbout linkedcredits
- **Acceptance:** Keep URLs current
- **Implementation / verification notes:** Preserve existing fix; recheck if touched.
