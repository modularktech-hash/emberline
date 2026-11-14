# Project context

**Read [`STATUS.md`](STATUS.md) first** — who is doing what right now; claim your task there before starting. Then [`docs/HANDOFF.md`](docs/HANDOFF.md). It is written for someone
opening this repository with no prior context and points at everything else in
the right order.

## What this is

A web application that harmonizes NASA FIRMS active-fire records across the
MODIS/VIIRS sensor boundary and presents them as a burning activity calendar
for a user-selected area of interest. Built for the NASA Space Apps challenge
on fire record harmonization. Build window: **Nov 14–15**.

## The event is live — build it

**The hackathon started Saturday 14 Nov 09:00.** The pre-event rule
("don't implement the harmonization") no longer applies: building the
harmonization, the fit, the validation and the app is now the job. Follow
[`docs/gameplan-2person.md`](docs/gameplan-2person.md) and start each AI
session from its brief in [`docs/ai-briefs.md`](docs/ai-briefs.md).

**Orchestrator mode.** If you are the orchestrating model, do not write code
yourself: plan, then hand each concrete task to the `builder` subagent
(`.claude/agents/builder.md`, runs on Opus) with the files, expected output and
check. Review its report, then send the next task. Keep your own messages
short — every token you spend comes out of the same usage budget.

What still applies: every hard constraint below, and every number must come
from our own fit, computed here, today.

## Documentation map

| Document | Read it when |
|---|---|
| [`docs/gameplan-2person.md`](docs/gameplan-2person.md) | **During the event — our actual plan.** Two people, four AI budgets, timeline |
| [`docs/ai-briefs.md`](docs/ai-briefs.md) | **Start of every AI session.** Paste-ready briefs, one per session |
| [`docs/submission.md`](docs/submission.md) | What we submit, the 30-second demo limit, Use-of-AI wording, final checklist |
| [`docs/gameplan.md`](docs/gameplan.md) | Traps table, demo script, degradation order (its six-role schedule is superseded) |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Always, first |
| [`docs/research-findings.md`](docs/research-findings.md) | Second. §1 (orbital drift) is required reading before touching the method |
| [`docs/challenge-statement.md`](docs/challenge-statement.md) | You need the official ask, requirements R1–R12, or why the plan changed |
| [`docs/priorities.md`](docs/priorities.md) | You need the build order or the open decisions |
| [`docs/data-reference.md`](docs/data-reference.md) | You are touching data: verified CSV schemas, download URLs, land cover classes, FRP equation |
| [`docs/science.md`](docs/science.md) | You need the method in full |
| [`docs/architecture.md`](docs/architecture.md) | You need how the pieces fit |
| [`docs/data-sources.md`](docs/data-sources.md) | You need product names and provenance |
| [`docs/glossary.md`](docs/glossary.md) | A term is unfamiliar |
| [`docs/decisions/`](docs/decisions/) | Architectural decisions and why |

## Hard constraints

- **Every number shown comes from our own fit during the event.** No
  placeholder R², RMSE, bias, onset shift or rarity percentile — not in the UI,
  not in the README, not as an example. If it isn't computed, the slot says so.
  Literature values in `docs/data-reference.md` are sanity checks, never
  results.
- **Never present an uncorrected number as corrected.** Until a fit is
  published the harmonized series falls back to raw sums and every affected
  cell is flagged uncorrected in the UI.
- **Do not load the raw global detection record into a database.** Hundreds of
  millions of rows. Load the aggregated cell-day and climatology tables; keep
  point-level data for two or three demo AOIs only.
- **Cite the 9–11 MW detection threshold correctly.** Its source calls it
  "thresholds of FRP detection," not a 50%-probability value, and cites Roberts
  & Wooster (2008) and Schroeder et al. (2010) — not Giglio.
- **Fit the harmonization on 2012–2021 only.** Terra and Aqua left their frozen
  orbits in 2022, so Aqua no longer shares Suomi-NPP's overpass time. Extending
  a frozen-orbit fit into the drift era mistakes an orbital artifact for a
  change in fire. 2022–2025 is the holdout. See `docs/research-findings.md` §1.
- **Convert to local solar time per detection** (`UTC + longitude/15`) before
  any time-of-day analysis. Averaging `acq_time` in UTC across a
  wide-longitude AOI wraps across midnight and silently produces nonsense.
- **Claim regional value, not global.** A public competitor measured only a
  −4.3% global step, within normal 3-year Aqua variability. The sensor break
  may be undetectable above natural variation at global scale.
- **Don't misquote Schroeder's detection gains.** The 3× day / 25× night
  figures are VIIRS 375 m versus the VIIRS **750 m** product, not versus MODIS.
- **Terra vs Aqua is not a null control.** They sit ~3h apart in local solar
  time and sample different parts of the diurnal cycle, so a Terra/Aqua
  difference confounds instrument with time of day. Valid null controls are
  Suomi-NPP across the 2012 boundary, or Aqua against itself within the
  frozen-orbit era. Terra/Aqua *is* useful as a two-point sample of the
  diurnal cycle — a different purpose.
- **H3 cell indices for a contiguous map area are not a contiguous range.**
  Sort Parquet by coarse H3 parent cell (res 2–3) then day, and filter on the
  parent. Sorting by raw cell ID defeats the range read.
- **A header-only CSV is valid, not an error.** FIRMS serves 404s as a JSON
  body (first byte `{`); a CSV with a header and zero data rows legitimately
  means no detections. Only the JSON case is a failure.
- **Use NOAA-20/21 for the live layer, not Suomi-NPP.** Suomi-NPP NRT returned
  zero rows globally on 2026-11-13 while NOAA-20/21 returned ~75k each. The
  historical VIIRS record is Suomi-NPP, so the live layer is a different
  platform — label it, don't silently mix. Re-check on the day.

## Stack

Next.js App Router, TypeScript, Tailwind. MapLibre GL for mapping (not Mapbox —
no token, no billing surprise mid-demo). Hand-rolled SVG for the calendar
heatmap. Framer Motion for exactly one thing: the raw→harmonized transition.
Python with Polars/DuckDB for the offline pipeline. Deployed on Vercel.

**Read path: static Parquet over HTTP range requests. No database, no API
server.** Decided 2026-11-03 —
`docs/decisions/0001-static-parquet-read-path.md`. The Supabase scaffold in
`db/migrations/` is retained as a schema specification only; nothing runs
against it. Keep all range-read code behind `web/src/lib/queries.ts`.

## Working in this repo

```bash
cd packages/firms-ingest && pip install -e ".[dev]" && pytest  # 84 tests
./scripts/stage_data.sh                  # stage the demo AOIs (resumable, no key)
./scripts/probe_firms_archive.sh Chile   # verify data access, no key needed
./scripts/measure_overpass_drift.py Chile  # Terra/Aqua drift
cd web && npm install && npm run dev
```

Staged data lands in `data/raw/` (gitignored). Keep `JOBS` at 3 or fewer — the
FIRMS host resets connections under parallel load.

`web/` is a Next.js project whose `AGENTS.md` carries framework-specific rules
that are regenerated by `next dev` — read it before writing app code.

## Git

This is the public submission repository, `shishirbhat/emberline`. All event work is committed here and Vercel deploys from it. Commit and push often — the history is part of the evidence that the work was done during the event.


Work on `main` unless told otherwise. Never force-push.
