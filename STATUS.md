# STATUS — read this first, update it when you start or finish anything

One board for every person and every AI session. Before starting work: read
this, claim your task by editing the table, commit and push. When done: update
it, commit and push. Times are IST.

## Who is doing what right now

| Task | Who | State | Output |
|---|---|---|---|
| A1 — raw pipeline (Portugal, Chile) | Person A's session | **DONE** | `scripts/build_tables.py`, `web/public/data/{cell_day,calendar_raw}.parquet`, `docs/figures/raw_counts_*.png`, notes in `docs/session-notes.md` |
| Global data download | Cloud session (Claude, "data host") | **RUNNING** | `data/global/*.csv.gz` on the cloud session only — never committed |
| A2 — the fit + validation (v1, 4 countries) | Cloud session (Claude, "data host") | **DONE** | `web/public/data/params.json`, `web/public/data/calendar_harmonized.parquet`, `docs/results.md`, `docs/figures/fit_*.png`, `scripts/fit_harmonization.py` |
| App build — B1+B2 | Cloud session (Claude, "app build") | **IN PROGRESS** | branch `shishir/admiring-pascal-8ymvmc`; deployed URL when live |

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

## Log (newest first)

- 14 Nov — App build (B1+B2) claimed by a cloud session; work on branch `shishir/admiring-pascal-8ymvmc`.
- 14 Nov ~12:15 — A2 v1 done: Portugal, Chile, Australia, Canada fitted on 2012–2018, tested 2019–2021. Held-out R² 0.27–0.81 vs raw VIIRS −6.8 to −31.9. See `docs/results.md`.

- 14 Nov ~12:00 — Cloud session claimed A2. Global download wave 1 (75
  countries, highest-fire first) running; wave 2 (rest of world) queued.
- 14 Nov ~11:50 — A1 done and pushed (Person A's session).
- 14 Nov ~11:12 — Repo created, preparation imported.
