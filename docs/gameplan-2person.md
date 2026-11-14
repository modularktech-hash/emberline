# Game plan — two people, AI-heavy

**This replaces the six-role schedule in `gameplan.md` for our actual team.**
The traps table, demo script and degradation order in `gameplan.md` still
apply. Paste-ready AI prompts are in [`ai-briefs.md`](ai-briefs.md).

## Where the work goes

**Rule: nothing project-related goes into any public repository before
Saturday 09:00.** Not code, not a README, not a description. Breaking it is
immediate disqualification. Until 09:00 everything stays in this private repo.

(Two public repos, `emberline` and `burning-activity-calendar`, were wrongly
created the night before. They must be **deleted** before 09:00 — see
`submission.md`. Deleting frees the name `emberline` for 09:00.)

**At 09:00, not one minute earlier:**

1. On github.com: **New repository** → name `emberline` → **Public** →
   add an **MIT license** → Create.
2. Import the preparation in one labelled commit:

```bash
# run from the folder that holds NASA-SPACE-APPS-MODULARK
git -C NASA-SPACE-APPS-MODULARK pull
git clone https://github.com/shishirbhat/emberline
cd emberline
git -C ../NASA-SPACE-APPS-MODULARK archive HEAD -- . ':!LICENSE' | tar -x -C .
git add -A
git commit -m "Import pre-event preparation (plan, docs, FIRMS ingest library, app scaffold)"
git push
```

`git archive` copies tracked files only (no downloaded data, no node_modules)
and works anywhere git does. Rehearsed the night before: ~74 files, no junk.
Then rewrite README.md for Emberline during the event.

3. Link Vercel to `shishirbhat/emberline`.

**What we submit and the rules:** [`submission.md`](submission.md). Read its
"30 SECONDS" section before anything else — the demo video limit is 30 seconds,
and going over makes us ineligible for global judging.

## The constraint that shapes everything

Two people. Two Claude accounts, two usage resets each — **four AI budgets for
the whole weekend.** Hours are not the scarce thing; AI usage is.

So three rules:

1. **Every AI session starts from a brief in `ai-briefs.md`.** Never open with
   "look at the repo and figure out what to do." That burns a budget on
   re-reading context this repo already wrote down.
2. **One big task per session, not chat.** Give it the brief, let it work, check
   the result. Don't spend usage on back-and-forth you could decide yourselves.
3. **Humans decide, AI types.** Every judgement call in this file is already
   made. Don't ask the AI to re-decide them.

## Who does what

| | **Person A — Science** | **Person B — App** |
|---|---|---|
| Owns | Data pipeline, the fit, validation numbers, `params.json` | Web app, export, deploy, pitch, submission |
| AI budget | Account 1 (2 resets) | Account 2 (2 resets) |
| Done when | `params.json` + validation numbers exist | Live URL works on a phone, CSV downloads |

**The handoff between you is one file: `params.json`** (fitted coefficients)
plus the Parquet tables. B builds against fixtures until A delivers. Neither of
you ever waits on the other.

## Budget plan — four sessions, spent deliberately

| Session | Who | When | Task (brief in `ai-briefs.md`) |
|---|---|---|---|
| **A1** | A | Sat 09:30 | Pipeline: CSV → filtered, local-solar-time, H3 Parquet tables |
| **B1** | B | Sat 09:30 | App: rip out Supabase, Parquet reader, calendar, AOI, CSV export, deploy |
| **A2** | A | Sat ~15:00 | The fit + validation → `params.json` + numbers |
| **B2** | B | Sun 09:00 | Wire real data + params, `/method` page, toggle, polish |

**Keep one reset in reserve if you possibly can** — whoever finishes their
second session with work done holds theirs for the emergency (a demo-breaking
bug Sunday morning). If nothing breaks, spend it Sunday on the stretch goal.

When a session is running low: tell it *"write a handoff note to
docs/session-notes.md: what's done, what's not, exact next step"*, commit, and
the next session starts from that note.

## Timeline

### Saturday

| Time | A (Science) | B (App) |
|---|---|---|
| 09:00 | **Together, 15 min:** read the three facts below. Make the three decisions below. Start. | |
| 09:15 | Import prep into the public repo (above). Run `./scripts/stage_data.sh Portugal Chile`, then background `Australia Canada` | Vercel project linked to the **public** repo, deploy the skeleton green. Open the official 2026 submission guide; correct `submission.md` if anything changed |
| 09:30 | **Session A1** — pipeline | **Session B1** — app foundations |
| 13:00 | **Checkpoint:** Parquet tables exist for Portugal + Chile; the raw-count chart shows the 2012 jump from real data | **Checkpoint:** deployed URL shows the calendar from fixtures; AOI box + lat/lon input work; CSV downloads |
| 13:30 | Lunch. Swap: each looks at the other's thing for 10 min. Fresh eyes catch bugs. | |
| 14:00 | Global FRP threshold by hand / small script — **the simple fit first** | Hand-tune calendar look; accessible colour ramp; mobile |
| 15:00 | **Session A2** — full fit + validation | Write the pitch script and README draft (no AI needed) |
| **21:00** | **HARD CHECKPOINT: a real accuracy number on held-out years exists.** If the per-land-cover fit isn't validated, ship the global threshold. Decide in 5 minutes, not 50. | B plugs whatever params exist into the app |
| 22:30 | Stop. Sleep. | Stop. Sleep. |

### Sunday

| Time | A | B |
|---|---|---|
| 08:30 | Re-run pipeline from clean; confirm numbers reproduce | Check deploy works on cellular data |
| 09:00 | Drift chart for the pitch (script already exists: `measure_overpass_drift.py`) | **Session B2** — real data wired in, `/method`, toggle animation |
| 12:00 | Write the method section of the README with the *real* numbers | Submission text drafted |
| **14:00** | **FREEZE.** Bug fixes and words only. | |
| 14:30 | **Record the 30-second video** (script in `submission.md`). Time it: ≤ 30 s. Upload, test the link logged-out. | Fill all 9 project-page fields. Write the Use of AI field honestly. |
| 16:00 | **Submit.** | |
| 16:30 | If your local event has a live pitch: rehearse the 3-minute version in `gameplan.md`. | |

## The three facts (read aloud at 09:00)

1. **The 2012 jump is fake.** VIIRS sees small fires MODIS can't. Chile raw
   counts run 2.47× higher in 2012, rising to 4.43× by 2024.
2. **The record is still breaking.** Terra and Aqua drifted out of their orbits
   from 2022 — about an hour each, opposite directions. **Fit on 2012–2021
   only.** 2022–2025 is the held-out test.
3. **NASA asks for hotspot counts.** We give harmonized counts: the number a
   MODIS-class sensor would have seen.

## The three decisions — already made, just confirm

1. **"Current month vs median" (R5):** compare **the last 7 days** against the
   historical norm for those same days of year. No API key needed.
2. **Live layer:** **NOAA-20/21**, labelled "not harmonized to history".
   (Re-check Suomi-NPP's live feed at 09:00; if it's back, still use NOAA-20/21
   — consistency matters more than which.)
3. **Demo AOI: Portugal** (cleanest drift, smallest data, fastest). Chile as
   backup. Australia only to prove it scales.

## What wins — protect these three, sacrifice anything else

1. **The toggle.** Raw → harmonized, the 2012 step disappears.
2. **One honest accuracy number** from your own fit on held-out years.
3. **The drift chart.** "MODIS is drifting right now; we measured it; we
   correct for it." A competitor had to throw away their post-2021 data over
   this. That's the Best Use of Data argument.

**Aim at Best Use of Science first** ("most valid, effective use of the
scientific method"), then Best Use of Data. Held-out validation, null
controls and a measured orbital drift are exactly what that award rewards —
so the project page and video must *show* the validation, not mention it.
Global judges never see a live pitch; the page and the 30-second video carry
everything.

Then, cheaply, for Best Use of Technology: no server, no API key, the whole
25-year record served as static files — and the copy-paste snippet that lets
anyone query it the same way. Mention it when asked; don't lead with it.

## If things go wrong

| Problem | Do this |
|---|---|
| Fit not validated by 21:00 | Ship the global FRP threshold. One honest number beats a broken fancy model. |
| Drift correction won't validate | Restrict the product to 2000–2021 and say plainly why. That honesty *is* a finding. |
| Out of AI budget early | Use the reserve reset. If none left, B helps A with manual work; the app is already deployed. |
| Live site breaks Sunday | Backup video. Record it the moment the demo works, not at 16:30. |
| FIRMS download fails | It's resumable: re-run `stage_data.sh` with `JOBS=1`. |
