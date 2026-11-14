# STATUS — read this first, update it when you start or finish anything

One board for every person and every AI session. Before starting work: read
this, claim your task by editing the table, commit and push. When done: update
it, commit and push. Times are IST.

## Who is doing what right now

| Task | Who | State | Output |
|---|---|---|---|
| A1 — raw pipeline (Portugal, Chile) | Person A's session | **DONE** | `scripts/build_tables.py`, `web/public/data/{cell_day,calendar_raw}.parquet`, `docs/figures/raw_counts_*.png`, notes in `docs/session-notes.md` |
| Global data download + build | Cloud session (Claude, "data host") | **RUNNING** (unattended) | `data/global/*.csv.gz` (~190 countries) → `scripts/run_global.py` → `data/global_public/`. Cloud session only — never committed |
| Global fit | Cloud session | **queued** after the build | `web/public/data/params_global.json`, `calendar_*_global.parquet` — published only after checking |
| A2 — the fit + validation (v1, 4 countries) | Cloud session (Claude, "data host") | **DONE** | `web/public/data/params.json`, `web/public/data/calendar_harmonized.parquet`, `docs/results.md`, `docs/figures/fit_*.png`, `scripts/fit_harmonization.py` |
| App build — B1+B2 | **Taken over by the cloud "data host" session** (user's request). Desktop session: stopped after the data layer (merged into main) | **v1 DONE on `main`** | deployed URL when live |

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

## Plan — what is left, in order (updated 14 Nov, afternoon)

| # | Task | Owner | State |
|---|---|---|---|
| 1 | Web app v1: calendar + toggle, seasons, method & proof, CSV, area picker | Cloud session | **DONE** — on `main`, builds clean |
| 2 | **Vercel deploy** — import the repo, Root Directory `web` | **You (browser, 3 min)** | **TODO — blocks everything visible** |
| 3 | Check the live URL on a phone; check the map basemap loads (could not be verified in the cloud sandbox) | You | after 2 |
| 4 | Global download (~190 countries) → build tables | Cloud session | running unattended |
| 5 | Global fit → publish global calendars + params; app picks up new countries automatically | Cloud session | after 4 |
| 6 | Polish pass: country search for 190 names, live 7-day layer (NOAA-20/21), mobile check | Cloud session | after 5 |
| 7 | README with real numbers + figures | Person A / cloud | Sat evening |
| 8 | Project page text, Use-of-AI field (`docs/submission.md`) | Person A | Sat evening |
| 9 | 30-second video (record the toggle on Canada) | Both | Sun morning |
| 10 | Freeze 14:00 Sun, submit 16:00 Sun | Both | |

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
