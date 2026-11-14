# STATUS — read this first, update it when you start or finish anything

One board for every person and every AI session. Before starting work: read
this, claim your task by editing the table, commit and push. When done: update
it, commit and push. Times are IST.

## Who is doing what right now

| Task | Who | State | Output |
|---|---|---|---|
| A1 — raw pipeline (Portugal, Chile) | Person A's session | **DONE** | `scripts/build_tables.py`, `web/public/data/{cell_day,calendar_raw}.parquet`, `docs/figures/raw_counts_*.png`, notes in `docs/session-notes.md` |
| Global data download | Cloud session (Claude, "data host") | **RUNNING** | `data/global/*.csv.gz` on the cloud session only — never committed |
| **A2 — the fit + validation** | Cloud session (Claude, "data host") | **IN PROGRESS** | `web/public/data/params.json`, `docs/results.md`, `docs/figures/` |
| B1 — app foundations | Person B | not started? — claim it here | deployed URL |
| B2 — wire up + polish | Person B | waiting on A2 + B1 | |

**Do not start A2 in another session** — it is running in the cloud session.
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

- 14 Nov ~12:00 — Cloud session claimed A2. Global download wave 1 (75
  countries, highest-fire first) running; wave 2 (rest of world) queued.
- 14 Nov ~11:50 — A1 done and pushed (Person A's session).
- 14 Nov ~11:12 — Repo created, preparation imported.
