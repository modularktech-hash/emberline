# STATUS — read this first, update it when you start or finish anything

One board for every person and every AI session. Before starting work: read
this, claim your task by editing the table, commit and push. When done: update
it, commit and push. Times are IST.

**Live app: https://emberline-tan.vercel.app/** — Vercel deploys `modularktech-hash/emberline` `main` (root `web`) on every push.

**To-do list until submission: [`TODO.md`](TODO.md)** — every remaining task (global data, app switch-over, testing, deployment, submission). Tick items there as you finish them.

## Who is doing what right now

| Task | Who | State | Output |
|---|---|---|---|
| A1 — raw pipeline (Portugal, Chile) | Person A's session | **DONE** | `scripts/build_tables.py`, `web/public/data/{cell_day,calendar_raw}.parquet`, `docs/figures/raw_counts_*.png`, notes in `docs/session-notes.md` |
| Global data download + build + fit | Cloud session "app build" (session_01RwRY…) — **took over**: the data-host session ran out of usage and its `data/global/` is gone | **RUNNING** — download re-started here ~13:20 (237 FIRMS country names from the archive index; 3,400+ country-year files staged so far), build running per finished country, fit after | `scripts/countries_global.txt`, `data/global/` and `data/global_public/` (this session only, never committed) → `web/public/data/params_global.json`, `calendar_*_global.parquet`, published only after the four-country regression check |
| A2 — the fit + validation (v1, 4 countries) | Cloud session (Claude, "data host") | **DONE** | `web/public/data/params.json`, `web/public/data/calendar_harmonized.parquet`, `docs/results.md`, `docs/figures/fit_*.png`, `scripts/fit_harmonization.py` |
| App build — B1+B2 | Cloud session "app build" (session_01RwRY…, not the data host). **Other sessions: do not edit `web/` — pull first, and coordinate here** | **Steps 1–5 DONE on `main`** (data layer, calendar, area selection, CSV export, `/method`). Step 6 deploy **DONE** by the owner: https://emberline-tan.vercel.app/ (checked logged-out, phone and desktop). Global download + fit now also running in this session (data host out of usage) | `web/`; details in `docs/session-notes.md`; deployed URL when live |

**A2 v1 is done — do not re-run it elsewhere.** Headline numbers are in `docs/results.md`. Next science step (cloud session): run on the global data when it lands.
Person A: you are free. Good uses of your time: help B1, write the README and
the submission text (`docs/submission.md`), or check the A2 results as they
land in `docs/results.md`.

## Where the data is

- `data/raw/` — Portugal, Chile, Australia, Canada full archive + NRT. Each
  machine downloads its own with `./scripts/stage_data.sh <Country>`.
- `data/global/` — the whole world, gzipped, **only on the cloud session**
  (~32 GB). When it finishes, that session runs the pipeline on it and pushes
  the small aggregated tables to `web/public/data/`.
- `web/public/data/` — what the app reads. Committed. Keep files < 50 MB.

## How the global run works (for anyone picking this up)

1. `scripts/stage_global.sh <list>` downloads every country-year, gzipped,
   resumable. Country names were discovered by probing the archive: 187
   confirmed (FIRMS spellings, e.g. `Democratic_Republic_of_the_Congo`,
   `Lao_PDR`, `Russian_Federation`, `United_States`).
2. `scripts/run_global.py` builds, per finished country, a slim detection
   table (lat, lon, acq_ts, platform, frp_mw, lst_hours) and a raw calendar,
   using `build_tables.py`'s filters unchanged. Re-runnable.
3. `EMBERLINE_DATA=data/global_public EMBERLINE_PARAMS=params_global.json
   EMBERLINE_CAL=calendar_harmonized_global.parquet python3 scripts/fit_harmonization.py <countries>`
   fits every country. Sparse countries borrow a pooled curve (recorded per
   country as `fit_source: pooled`).

## Log (newest first)

- 14 Nov — Live: https://emberline-tan.vercel.app/ — checked logged-out at phone and desktop size: `/` renders the calendar (Portugal raw 2011 = 1,953, 2012 = 4,128), `/method` renders, Parquet range requests return 206, no console errors, no horizontal overflow.
- 14 Nov — Global download/build/fit now owned by the "app build" cloud session; app switch-over to the global files being prepared in parallel (reads `*_global` when present, falls back to the four-country files).
- 14 Nov — `TODO.md` added: the full list of what is left until submission. Vercel project created by the owner (URL to be recorded here once confirmed).
- 14 Nov — App build: steps 1–5 done on `main` (area selection 51b6a9f, CSV 7b4904f, `/method` 40a9646, basemap verified). Deploy blocked on Vercel project creation (403) — owner action. Global download + fit now running in the app-build session (data-host session ran out of usage).
- 14 Nov — App build: data layer (hyparquet, Supabase removed) and the calendar home page (raw vs harmonized) are on `main`. Same session continues with area selection, CSV export, `/method`, deploy.
- 14 Nov ~12:20 — App build taken over by the cloud session on `main`; Desktop session's hyparquet data layer merged in. Do not edit `web/` from another session.

- 14 Nov ~12:20 — Global run: wave 1 (75 high-fire countries) downloading,
  wave 2 (116 more) queued, build chained after. Runner and pooled fallback
  committed; four-country fit regression-checked identical.

- 14 Nov — App build (B1+B2) claimed by a cloud session; work on branch `shishir/admiring-pascal-8ymvmc`.
- 14 Nov ~12:15 — A2 v1 done: Portugal, Chile, Australia, Canada fitted on 2012–2018, tested 2019–2021. Held-out R² 0.27–0.81 vs raw VIIRS −6.8 to −31.9. See `docs/results.md`.

- 14 Nov ~12:00 — Cloud session claimed A2. Global download wave 1 (75
  countries, highest-fire first) running; wave 2 (rest of world) queued.
- 14 Nov ~11:50 — A1 done and pushed (Person A's session).
- 14 Nov ~11:12 — Repo created, preparation imported.
