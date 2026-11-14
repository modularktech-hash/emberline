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

- [ ] `queries.ts` reads the `*_global` files (fall back to the four-country files)
- [ ] Country selector usable with ~190 names (search or grouped list)
- [ ] "Not processed yet" message lists coverage sensibly when it is most of the world
- [ ] `/method`: tables stay readable with many countries; pooled fits labelled
- [ ] Map coverage layer performs with the full set of H3 parent cells

## 3. Testing

- [ ] `npx next build` and `npm run lint` pass on `main`
- [ ] `packages/firms-ingest` tests pass (`pytest`)
- [ ] Calendar totals for several countries match the Parquet files (script check)
- [ ] `/method` table cells match `params_global.json` (script check)
- [ ] CSV export matches the on-screen matrix, raw and harmonized
- [ ] Box selection: inside coverage, partly outside, fully outside, invalid input
- [ ] Phone width 390: no overflow on `/` and `/method`, map usable by touch
- [ ] Light and dark mode, both pages
- [ ] No console errors; page still works when the basemap host is unreachable
- [ ] Hard-constraint review: no placeholder numbers, raw labelled uncorrected,
      9–11 MW cited correctly, no NASA logos, no global claims

## 4. Deployment

Live: https://emberline-tan.vercel.app/ — deploys `modularktech-hash/emberline`
`main` (root `web`) on every push.

- [x] Owner imported the project in Vercel
- [x] Production URL opens logged-out
- [x] Live URL: `/` and `/method` load, Parquet range reads work (HTTP 206)
- [x] Live URL checked logged-out at phone size (no overflow, no console errors)
- [x] Live URL recorded in `STATUS.md` and `docs/session-notes.md`
- [ ] Live URL in the README
- [ ] Re-check the live site after the global data is published
- [ ] Check on a real phone (only emulated so far)

## 5. Submission (Sunday, by 16:00 — see `docs/submission.md`)

- [ ] README with real numbers from our fit, credits, MIT license
- [ ] Pre-event work credited in the README
- [ ] Every data source, library and paper credited
- [ ] 30-second demo video, timed, English or subtitled, public link opens logged-out
- [ ] No NASA logos in video, app or README
- [ ] Use-of-AI field written honestly
- [ ] All 9 submission fields filled in English
- [ ] Both team members registered at the same local event
- [ ] Submitted with time to spare

## Open decisions for the owner

- [ ] `CLAUDE.md` says "fit on 2012–2021"; the fit trains 2012–2018 and tests
      2019–2021. Keep (and reword `CLAUDE.md`) or refit?
- [x] Public submission repo: `modularktech-hash/emberline` (owner, 14 Nov)
