# STATUS — read this first, update it when you start or finish anything

One board for every person and every AI session. Before starting work: read
this, claim your task by editing the table, commit and push. When done: update
it, commit and push. Times are IST.

**Live app: https://emberline-tan.vercel.app/** — Vercel deploys `modularktech-hash/emberline` `main` (root `web`) on every push.

**To-do list until submission: [`TODO.md`](TODO.md)** — every remaining task (global data, app switch-over, testing, deployment, submission). Tick items there as you finish them.

**`web/` was redesigned on 14 Nov (evening) by the data-host cloud session at the owner's request** — Modulark house style (cream paper, Newsreader, ember accent), pages `/`, `/anomaly` (Seasons), `/method`. The previous UI is in git history (`c0eb082`). The data layer (`queries.ts`, `types.ts`, `useParquet.ts`) is unchanged. **Pull before touching `web/`.**

## `web/` — CLAIMED by builder subagent "speed pass" (session_012VvB…, 14 Nov). Do not edit `web/` until released. Log: docs/speed-pass.md

### Previous: `web/` — RELEASED by the "data host" cloud session after design pass 3 (14 Nov ~21:30 UTC); was claimed from ~21:05 UTC

Design pass 3 done: named page transitions (T1), the "ember + line" logo (L1), and the owner's design review D1–D14, each ticked with notes in [`docs/design-pass-3.md`](docs/design-pass-3.md).

### Previous: `web/` — RELEASED by builder subagent (session_01RwRY…) after plan-combat E03 (aeb18fd), E04+E05 (4b4b1af), E06 (ff6d72b), 14 Nov

### Previous: RELEASED by builder subagent after plan-combat E01 (f339b28) + E02 (cd3641f), 14 Nov

### Previous: RELEASED by the "app build" cloud session after regression QA (14 Nov ~18:20 UTC)

### Previous: RELEASED by the "data host" cloud session (14 Nov ~17:00 UTC); was claimed from ~15:10 UTC

Owner said "begin with everything": switch the app to the world data (TODO §2), then testing (TODO §3), README and submission prep. The app-build session's performance and polish passes are live (`06df191`). **No other session edits `web/` until this is released.** What is in progress, and how to resume if this session stops: [`docs/in-flight.md`](docs/in-flight.md).

**Owner decision (14 Nov):** the public submission repo is `modularktech-hash/emberline`.

### Earlier note (released 14 Nov by the data-host session)

The cloud "data host" session has handed `web/` over. Read
[`docs/handoff-web-ui.md`](docs/handoff-web-ui.md) first: what the site looks like
now, where everything lives, and what is open. Its duplicate world download was
stopped (the app-build session's global fit is the one to use). Claim `web/`
here before editing and pull first.

## Split of work (owner decision, 14 Nov ~22:45 UTC)

- **UI session owns `web/src/**`.** **Technical session (app build, session_01RwRY…) owns data, science, scripts, `web/public/data/*` and submission docs.** Neither edits the other's area; ask here.
- **Plan Combat items handed to the UI session** (details in `plan combat.md`, `grep -n '^### E' 'plan combat.md'`):
  - E08 shareable URL state (area, mode, years, baseline; restore on refresh/back)
  - E09 evidence brief download (chart + metadata + quality + sources, numbers identical to screen)
  - E14 requested vs effective bounds, res-2 cell IDs, whole-cell warning in the UI
  - E15 exact geometry, cell IDs and reproducing URL in the custom-area CSV header
  - E12 remainder: rename "sensor share" to "change in estimated trend after harmonization", show both slopes
  - E20–E22, E25 accessibility (Data scroll region, keyboard row actions, calendar arrow keys/table, JS reduced motion)
  - E33–E37 Seasons absolute anomaly and zero median, Compare quality and index period, Globe FRP-sum label and fallbacks
  - **E13 landed (5da868e) — needed now:** `season.json` has a `partial` list and null values for incomplete fire years. `TrendsPage.tsx:45` silently drops years with null `harm_onset`, which also affects the year table (≈130–140) and the onset chart (≈101–112). Show them as "incomplete" instead. Add `partial?: ("raw"|"harm")[]` to the types in `lib/data.ts`.
  - E38/E39 landed (2d06121): `web/public/data/manifest.json`. DataPage could link it and note that the calendar parquets hold both country and grid rows (summing both double-counts). Method copy to place: `docs/data-contract-additions.md` §4 (evaluation population) and §5.
  - **E16 data side landed:** `manifest.json` v2 groups files into versioned datasets; the loaders still fall back per file (`queries.ts` `getParams` ≈l.234, `openTable` ≈l.341) so world and four-country files can mix, and `season/countries/drift.json` have no fallback. Resolve one dataset for all three files, refuse a fit-version mismatch, and show a site-wide fallback banner. Exact steps: `docs/data-contract-additions.md` §7.
  - **E31/E32 data landed:** `season.json` `trend_stats` (SE, 95% CI, usable years, drop-first/last-3 sensitivity) and `trend_approximate`; `countries.json` `onset_trend_*_ci95/_n_years/_sensitivity/_approximate`. Show CI + n beside each slope on Season Shift, label OLS "descriptive", prefix monthly-country dates with ≈. Fields and wording: `docs/data-contract-additions.md` §8.
  - Any change under `web/public/data` must re-run `scripts/build_manifest.py` or `scripts/check_data_contract.py` fails.
  - **E07 (1909e82, a2e01e7):** add a separate "recent activity" card from the "UI card spec" in `docs/current-month.md`, reading `web/public/data/current_month.json` (Canada, Portugal, Chile, Australia). Badge it "Provisional · not harmonized". Hide the ratio when it is null, warn when polygon capture is below 0.95, and never put these numbers on the harmonized calendar scale. It compares NOAA-20 with its own 2018–2025 history for the same 6 complete days; it is not month-to-date.
- **Technical session, in order:** E13, E38/E39 done → E07 feasibility (running) → E16 mixed-version check → E07 current-month feasibility → E31/E32 → E40 fixture.
- **Owner:** E18 form/deadline, E19 disclosure, E41 team links.

## Who is doing what right now

| Task | Who | State | Output |
|---|---|---|---|
| A1 — raw pipeline (Portugal, Chile) | Person A's session | **DONE** | `scripts/build_tables.py`, `web/public/data/{cell_day,calendar_raw}.parquet`, `docs/figures/raw_counts_*.png`, notes in `docs/session-notes.md` |
| Global data download + build + fit | Cloud session "app build" (session_01RwRY…) | **DONE, published 14 Nov ~18:25 IST (12:55 UTC)**: 237 countries downloaded and built (267.2M filtered detections); fit `v1-20261114T1240` — 171 fitted (130 own, 41 pooled), 66 too sparse; four-country regression identical to `params.json`. Other sessions: stop duplicate downloads, or compare against these files. | `web/public/data/{params,calendar_raw,calendar_harmonized}_global.*` (`4f47247`); `docs/results.md` global section |
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

- 14 Nov ~18:20 UTC — App-build session: regression QA of `web/` after the world-data switch. Perf/polish rules hold; 11 routes + 404 pass locally and live (390/1440, no errors, no overflow, no placeholder text); Explorer first calendar 11.7 s → 9.3 s (column-only range reads, `7e2ff24`); suspicious fits now flagged in Explorer and CSV (`074b6ae`). `web/` released. Details: `docs/handoff-web-ui.md`.

- 14 Nov ~17:00 UTC — Data-host session: **app switched to the world data** (171 fitted countries, 4-country fallback), audit wording/method/bug/accessibility fixes, testing pass, README. Season timing: daily for 166 countries (detection tables rebuilt here from `data/global`, each matching the published calendar exactly), monthly resolution (labelled) for 5. `scripts/check_app_numbers.py`: 16,356 checks, 0 failed. 11 routes at 1440/375: no sideways scroll, no console errors. `web/` released. Details: `docs/in-flight.md`.

- 14 Nov ~15:30 UTC — Web performance + polish passes 1–2 live ("app build" session): native scroll, no custom cursor/progress bar/serif, cheap glass, globe rebuilt, Explorer 18.2 s → 8.1 s, home at-a-glance panel, overpass clocks, unified number style, interactive footer with Made by Modulark. All 11 routes checked live at phone + desktop: 200, no overflow, no console errors. Details: `docs/handoff-web-ui.md`. Next: switch the app to the global data.
- 14 Nov evening — Data-host session released `web/` and wrote `docs/handoff-web-ui.md` (glass + dot-matrix UI, minimal globe home, `/data` route committed — it was gitignored). Its duplicate world download is stopped.

- 14 Nov ~18:25 IST (12:55 UTC) — App-build cloud session published the global fit: `params_global.json`, `calendar_raw_global.parquet`, `calendar_harmonized_global.parquet` from 237 countries (171 fitted, fit `v1-20261114T1240`). The app does not read the `*_global` names yet (TODO §2). Codex and data-host sessions: stop duplicate downloads or compare against these.

- 14 Nov ~18:20 IST (12:50 UTC) — Cloud "app build" session (session_01RwRY…): world download COMPLETE here — 237 countries, all 9,243 country-source-years settled (8,174 .csv.gz = 6.5 GB, 1,069 absent per FIRMS, 0 failures). All 237 countries built into `data/global_public/` (212.8M filtered detections). Raw calendars of Portugal/Chile/Australia/Canada match `calendar_raw.parquet` exactly. Global fit running now in this session; will publish the three `*_global` files only if main does not already have them. Other sessions: you can stop duplicate downloads.

- 14 Nov ~15:10 IST — Local Codex took over data only. Durable download service and five-minute build timer installed on the laptop; raw files from the old cloud session were not available. Recovery fixes and five regression tests added; full Python suite: 89 passed. Published data unchanged; global fit and four-country validation still pending.

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
