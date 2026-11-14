# In flight: world-data switch + audit fixes (data-host session, 14 Nov)

**If this session has stopped, read this first.** It says what is being done
right now, what state the working tree may be in, and how to pick it up.

## Situation

- Owner said (14 Nov ~15:10 UTC): "begin with everything", then brainstorm what
  makes the project award-worthy. Public submission repo: `modularktech-hash/emberline`.
- This session claimed `web/` in `STATUS.md` and started one builder subagent.
  It works **directly in `/home/user/emberline` on `main`** in this cloud
  container, and commits and pushes when a build passes.
- **Anything it has not pushed lives only in that container and is lost if the
  session ends.** Check `git log origin/main` to see what actually landed; do
  not assume a task below is done unless a commit shows it.
- Vercel deploys `main` (root `web/`) on every push: https://emberline-tan.vercel.app/
- Owner-facing live progress page (private to the owner):
  https://claude.ai/artifact/NEjHe2jF8nwtvWffkjSdtz — its task list is the one below.

## How to resume

1. `git pull`, read `STATUS.md`, re-claim `web/` there.
2. Compare the checklist below with `git log` and the live site; continue from
   the first item not visibly done. Tick items here as you finish them.
3. Rules that bind every change: `CLAUDE.md` hard constraints (every number from
   our files, raw labelled uncorrected, regional claims only, no NASA logos),
   `web/AGENTS.md`, and the performance pass in `docs/handoff-web-ui.md`
   (no backdrop-filter except the nav, no Lenis/custom cursor, low-power mode).
4. Before pushing: `npx next build`, then `npx tsc --noEmit`, `npx eslint` in `web/`.

## Facts the work depends on

- World results are already in `web/public/data/`: `params_global.json`
  (171 fitted countries: `fit_source` own or pooled; top-level `failed` = too
  sparse; fit `v1-20261114T1240`), `calendar_raw_global.parquet`,
  `calendar_harmonized_global.parquet`. Same schema as the 4-country files
  (`scope` country | h3_parent, `key`, `year`, `month`, ...). Keys use FIRMS
  spellings with underscores.
- 4-country only: `cell_day.parquet` (point-level), and the daily-resolution
  `season.json` / `drift.json`. Detection-level tables for the whole world are
  **not** on the data-host machine (`data/global_public` has a few countries);
  the app-build session's machine had them. So world season timing must be
  monthly-resolution (labelled) or limited to countries with data.
- The comparable harmonized record is 2003–2025 (Aqua launched May 2002); the
  source archive starts 2001. The live layer (NOAA-20/21 + MODIS) is separate
  and uncorrected.
- Fit trains 2012–2018, tests 2019–2021; 2022–2025 is the drift era, never fitted.
- Audit source: an external review of the live site pasted by the owner on
  14 Nov. Its points are the "Audit fixes" and "Accessibility" groups below.
  Its suggested demo path for the 30 s video: Canada raw → harmonized → Aqua
  reference → 2023 anomaly → held-out validation → CSV export.

## Checklist (state when this file was written; `git log` is the truth)


### 1 · World data

- [x] `w1` App reads the world data files (with 4-country fallback)
- [x] `w2` Searchable country picker for ~171 countries
  - Keyboard combobox; Enter picks the highlighted row, arrows move
- [x] `w3` Rebuild countries, season and drift tables for the world
  - Season timing: daily resolution for 166 countries whose detection tables (rebuilt here from data/global) match the published calendar exactly; monthly resolution (labelled) for 5 (Barbados, Estonia, Mauritius, Slovenia, Solomon Islands). Drift for the 166.
- [x] `w4` Data and Method tables usable at 171 rows; pooled and too-sparse labelled
- [x] `w5` Explorer custom-area and coverage messaging
  - There was no map coverage layer to keep fast; H3 rows are read only for the row groups a drawn box needs. cell_day stays 4-country and is not used by the UI.
- [x] `w6` Home numbers recomputed from world files
  - Headline R² is the median over 130 own-fit countries (0.64); best single country (Montenegro 0.93) named as one country
- [x] `w7` Explorer "0.00 R²" check and fix
  - Not reproduced live (deploy had replaced it); cause in code: value initialised to 0 and set only when scrolled into view. Now renders the final value by default.

### 2 · Audit fixes: wording

- [x] `a1` Coverage claims match reality (countries, 2003–2025, live layer separate)
- [x] `a2` "Peak" renamed "season midpoint"
- [x] `a3` Aqua called "reference", not "truth"
- [x] `a4` Soften "The fires did not" and "no longer matters"
- [x] `a5` "VIIRS record begins" for 2012
- [x] `a6` "Critical" becomes "unusually high: above 90th percentile"
- [x] `a7` Globe: "Recent satellite fire detections" with clear timestamps
- [x] `a8` Each region shows its own held-out R² and bias
- [x] `a9` About: concrete analyst task
- [x] `a10` Method: explain κ
  - κ has no interval of its own in the fit; the page says so and points to the held-out bias interval
- [x] `a11` Method: error metrics and how confidence intervals are built

### 3 · Audit fixes: bugs

- [x] `b1` Trends month axis (July twice, February missing)
- [x] `b2` Single-year chart draws a triangle
- [x] `b3` Map loading, failure and retry states
  - Load timeout 15 s, then failure message + Retry + pointer to typed bounds; checked with the basemap host blocked
- [x] `b4` Custom area shows the cells actually included
- [x] `b5` Lab converter reports rejected entries

### 4 · Accessibility and mobile

- [x] `c1` Lab inputs have accessible names
- [x] `c2` Code blocks keyboard focusable
- [x] `c3` Escape closes the mobile menu
- [x] `c4` Readable scrolling calendar on phones
  - Cells 29×28 px at 390 px, matrix scrolls sideways inside its box, years pinned
- [x] `c5` Shorter intros on tool pages
  - Compact header on Explorer, Seasons, Trends, Compare, Lab, Data
- [x] `c6` Compare: Region A / Region B and line labels
  - Selectors were already 'Region A/B'; lines now labelled at their ends
- [x] `c7` Credits link to datasets and papers
  - Linked FIRMS, LAADS transition PDF, CelesTrak, Andela 2015 DOI, Laurent 2019, Natural Earth, OpenFreeMap/OSM; Roberts & Wooster 2008 and Schroeder 2010 cited by name only (DOIs not verified here)

### 5 · Testing

- [x] `t1` Script cross-checks on-screen numbers against data files
  - scripts/check_app_numbers.py: 16,356 checks, 0 failed (with the Playwright screen dump of Method/Data tables and 8 Explorer CSV/matrix exports)
- [x] `t2` Type check, lint and production build pass
  - tsc, eslint, next build pass; pytest 84 + 5 pass
- [x] `t3` Every page at desktop and phone width, no sideways scroll, no console errors
  - 11 routes at 1440 and 375: no sideways scroll, no console or page errors (one motion path error on country switch found and fixed)
- [x] `t4` Three new countries checked in Explorer, Seasons, Compare
  - Brazil, Indonesia, DR Congo in Explorer, Seasons, Compare
- [x] `t5` CSV export matches the screen
  - CSV equals the on-screen matrix for 4 countries x raw/harmonized
- [x] `t6` Hard-rule review of all wording and numbers
  - 9–11 MW citation completed on Lab; no NASA logos; no global claims; live layer labelled NOAA-20/21

### 6 · Docs and deploy

- [ ] `d1` README with real numbers, credits, licence
- [ ] `d2` TODO and STATUS updated
- [ ] `d3` Pushed to main; Vercel live site checked

## Not in this pass (needs the owner or new analysis)

- Named team members and roles on About; links to the official challenge page
  and the project submission.
- Extra science from the audit: a simple multiplicative-calibration baseline,
  observed-vs-predicted plots. Candidate for the "what makes us award-worthy"
  brainstorm.
- Open owner decision: `CLAUDE.md` says "fit on 2012–2021"; the fit trains
  2012–2018 and tests 2019–2021. Reword `CLAUDE.md` or refit.
- Refresh `live.json` near demo time (`python3 scripts/build_live.py`).
- Submission (Sunday 16:00): 30 s video, Use-of-AI text, 9 fields — `docs/submission.md`.
- The Claude artifact copy of the site (https://claude.ai/artifact/33LmHNK76DxGhpewWHf9yu)
  is from before the polish passes; rebuild steps are in `docs/handoff-web-ui.md`.
