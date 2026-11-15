# TODO — everything left until submission

Updated 14 Nov. Tick items here as they finish; `STATUS.md` says who is doing
what, `docs/submission.md` has the full submission rules.

## Done

- [x] Data layer: Supabase removed, Parquet read with hyparquet (`df5d25d`)
- [x] Calendar home page, raw vs harmonized toggle, light and dark (`f5c4c25`)
- [x] Area selection: map box, typed bounds, date range (`51b6a9f`)
- [x] CSV export of the calendar shown (`7b4904f`)
- [x] `/method` page, every number from `params.json` (`40a9646`)
- [x] Premium home: scroll-driven story, multi-tab site (`e8743d4`)
  - [x] Liquid glass polish (Apple-inspired) on nav, menus, buttons, chips, segmented controls (`0a38dc4`)
- [x] Map checked against the real basemap, both themes, phone width (`cdf27f5`)

## 1. Global data (running in the "app build" cloud session)

- [x] Rebuild the FIRMS country list (`scripts/countries_global.txt`, 237 names, `5ae02bd`)
- [x] Download the country archive for every country (9,243 country-source-years settled, 0 failures)
- [x] Build slim tables and raw calendars (`scripts/run_global.py`, 237 countries)
- [x] Fit every country (`scripts/fit_harmonization.py`): 171 fitted (130 own, 41 pooled), 66 too sparse (`4f47247`)
- [x] Regression check: Portugal, Chile, Australia, Canada reproduce `params.json`
- [x] List countries with suspicious results (47 flagged, in `docs/results.md`)
- [x] Publish `params_global.json`, `calendar_raw_global.parquet`,
      `calendar_harmonized_global.parquet` to `web/public/data/` (each < 50 MB)
- [x] Update `docs/results.md` with the global results (`scripts/report_global.py`)

## 2. App: switch to the global data

- [x] `queries.ts` reads the `*_global` files (fall back to the four-country files)
- [x] Country selector usable with ~190 names (search or grouped list)
- [x] "Not processed yet" message lists coverage sensibly when it is most of the world
- [x] `/method`: tables stay readable with many countries; pooled fits labelled
- [x] Map coverage layer performs with the full set of H3 parent cells (no coverage layer exists; H3 rows are range-read per row group only for a drawn box)

## 3. Testing

- [x] `npx next build` and `npm run lint` pass on `main`
- [x] `packages/firms-ingest` tests pass (`pytest`)
- [x] Calendar totals for several countries match the Parquet files (script check)
- [x] `/method` table cells match `params_global.json` (script check)
- [x] CSV export matches the on-screen matrix, raw and harmonized
- [x] Box selection: inside coverage, partly outside, fully outside, invalid input
- [x] Phone width 390: no overflow on `/` and `/method`, map usable by touch
- [x] Light and dark mode, both pages — the site is light-only by design (`color-scheme: light`); with the OS in dark mode `/` and `/method` render identically, 0 text elements under 3:1 contrast in either (14 Nov, app-build QA)
- [x] No console errors; page still works when the basemap host is unreachable
- [x] Hard-constraint review: no placeholder numbers, raw labelled uncorrected,
      9–11 MW cited correctly, no NASA logos, no global claims

## 4. Deployment

Live: https://emberline-tan.vercel.app/ — deploys `modularktech-hash/emberline`
`main` (root `web`) on every push.

- [x] Owner imported the project in Vercel
- [x] Production URL opens logged-out
- [x] Live URL: `/` and `/method` load, Parquet range reads work (HTTP 206)
- [x] Live URL checked logged-out at phone size (no overflow, no console errors)
- [x] Live URL recorded in `STATUS.md` and `docs/session-notes.md`
- [x] Live URL in the README
- [x] Re-check the live site after the global data is published — 11 routes + 404 at 390 and 1440 px on the live URL: 200, no console errors, no sideways scroll, no NaN/undefined text (14 Nov, after `074b6ae`)
- [ ] Check on a real phone (only emulated so far)

## 5. Submission (Sunday, by 16:00 — see `docs/submission.md`)

- [x] README with real numbers from our fit, credits, MIT license
- [x] Pre-event work credited in the README
- [x] Every data source, library and paper credited
- [ ] 30-second demo video, timed, English or subtitled, public link opens logged-out
- [ ] No NASA logos in video (app and README checked: none)
- [ ] Use-of-AI field written honestly
- [ ] All 9 submission fields filled in English
- [ ] Both team members registered at the same local event
- [ ] Submitted with time to spare

## Open decisions for the owner

- [ ] `CLAUDE.md` says "fit on 2012–2021"; the fit trains 2012–2018 and tests
      2019–2021. Keep (and reword `CLAUDE.md`) or refit?
- [x] Public submission repo: `modularktech-hash/emberline` (owner, 14 Nov)

## Pre-submission repo sweep (do last, before final submit)
- [ ] Remove any ideation/brainstorm content (award-ideas, "ideas" notes, `plan combat.md` backlog) from the repo
- [ ] Remove anything that reads against the event guidelines (pre-event build references, private-planning-archive notes)
- [ ] Remove AI-tooling traces (CLAUDE.md, .claude/, AGENTS.md, ai-briefs.md, gameplan AI budgets) — AI use is still declared honestly in the submission's "Use of SI" field
- [ ] grep sweep: `ideation|brainstorm|Claude|Opus|Fable|Codex|AI session|pre-event`; rebuild, deploy, verify live
