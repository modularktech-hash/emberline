# Game plan — Nov 14–15

> **Two-person team:** the schedule and roles below are superseded by
> [`gameplan-2person.md`](gameplan-2person.md). The traps table, demo script and
> degradation order here still apply.

Start **Saturday 09:00**. Two hard checkpoints: **Sat 21:00** (a real agreement
number exists) and **Sun 14:00** (feature freeze). Times are local.

This is the schedule. `docs/priorities.md` is the *what*; this is the *when* and
*who*. If the two disagree, priorities.md wins on scope and this wins on
sequencing.

---

## Before anyone writes code: the 09:00 standup, 20 minutes

Read out loud, because the whole team needs the same three facts in their head:

1. **The jump at 2012 is not real.** VIIRS sees small fires MODIS cannot. For
   Chile, raw counts run 2.47× higher in 2012 rising to 4.43× by 2024.
2. **The record is still breaking.** Terra and Aqua left their frozen orbits in
   2022. Terra is ~1h earlier, Aqua ~1h later than in 2021. Aqua no longer
   shares Suomi-NPP's overpass. **So we fit on 2012–2021 only.**
3. **We report counts, via energy.** NASA asks for the *number of hotspots*.
   `Σ P_i` over VIIRS detections is the expected MODIS-equivalent count. Lead
   with the count.

Then assign the six roles (below) and start. Nobody waits on anybody for the
first three hours.

---

## Hour by hour

### Saturday

| Time | Science lead | Science 2 | Data eng | Frontend lead | Frontend 2 | Integration |
|---|---|---|---|---|---|---|
| 09:00 | Standup, roles, read the three facts | | | | | |
| 09:20 | Stage data: `./scripts/stage_data.sh` (one person runs it, shares the folder) | | | | | |
| 09:30 | Load archive → Polars; join land cover | Build the Aqua↔SNPP cell-day match table, 2012–2021 | H3 aggregation, cell×day×sensor | Strip Supabase; `queries.ts` → hyparquet | Calendar heatmap, month × year, static data | Repo, deploy skeleton green on Vercel |
| 11:00 | Fit **one global FRP threshold** first | Land-cover join QA | Parquet writer, sorted by coarse H3 parent + day | AOI: drawn box **and** typed lat/lon | Accessible colour ramp wired | CSV export (R9) — do it now, it's cheap |
| 13:00 | **Lunch checkpoint.** One global threshold must exist and produce a harmonized series by now. If not, say so loudly. | | | | | |
| 13:30 | Per-land-cover thresholds | Unchanged-sensor control (SNPP across 2012) | Climatology: month × year + day-of-year percentiles | Wire calendar to real Parquet | Raw ↔ Harmonized toggle | Date-range picker |
| 15:30 | Detection probability: `σ(β₀+β₁logFRP+β₂logA_pix+β_lc)` | Holdout years; MCD64A1 cross-check | Persistent-hotspot mask from `type ∈ {1,2}` | Map layer + AOI→query plumbing | `/method` page shell | Live layer: **NOAA-20/21**, not Suomi-NPP |
| 18:00 | Bootstrap the fit → uncertainty bands | Write the validation numbers down, per biome | Export the fitted-parameters JSON | Per-cell confidence layer | Distribution-convergence plot | Pitch draft v1 |
| **21:00** | **CHECKPOINT: a real R², bias and RMSE on held-out data.** If the per-land-cover fit isn't validated, **ship the global threshold and move on.** No exceptions, no "one more hour". | | | | | |
| 21:30 | Diurnal/drift correction (stretch) | Season shift raw vs harmonized | Precompute everything the UI reads | Polish, empty states, mobile | Calendar polish | Rehearse the demo once, end to end |
| 23:30 | Stop. Sleep. A tired team ships bugs. | | | | | |

### Sunday

| Time | What |
|---|---|
| 08:00 | Stand up the deploy. Confirm the live URL works from a phone on cellular data. |
| 08:30 | Fix whatever broke overnight. Re-run the full pipeline from clean. |
| 10:00 | Finish the top unfinished Tier-1 item. One only. |
| 12:00 | **Write the README and the submission text.** Not later. |
| **14:00** | **FEATURE FREEZE.** Nothing new after this. Only bug fixes and text. |
| 14:30 | Full rehearsal. Three times. Time it. Cut anything that doesn't fit 3 minutes. |
| 16:00 | Submit. Do not wait for the deadline. |
| 16:30 | Record the backup demo video in case the live site dies on stage. |

---

## Roles

| Role | Owns | First task at 09:30 |
|---|---|---|
| Science lead | Thresholds, detection probability, the fitted parameters | Load the archive, get one global threshold working |
| Science 2 | Validation: holdout, controls, MCD64A1, writing the numbers down | Build the Aqua↔SNPP match table for 2012–2021 |
| Data eng | Ingest → filter → H3 aggregate → Parquet | H3 aggregation on the staged CSVs |
| Frontend lead | App shell, map, AOI, state, deploy | Rip out Supabase, point `queries.ts` at hyparquet |
| Frontend 2 | Calendar, anomaly chart, the toggle, colour ramp | Calendar heatmap against the fixtures |
| Integration | Deploy green, CSV export, live layer, README, submission, rehearsals | Vercel deploy green before 10:00 |

The Integration role owns the deadline. That is the job.

---

## The demo script — 3 minutes, memorised

1. **Don't open with the map.** Open with the problem. Show the raw count chart.
   *"This tripled in 2012. It shouldn't have."*
2. Click the toggle. The step vanishes.
   *"Nothing changed on Earth. We corrected what changed in orbit."*
3. Show `/method`: the two distributions sliding into each other, then R², bias,
   RMSE on held-out years.
4. Show the drift table. *"And it's still changing — Terra and Aqua left their
   frozen orbits in 2022. We measured it. MODIS switches off within months, and
   every baseline built on it is drifting right now."*
5. Pick an AOI, show the calendar, show this period against the historical
   median, download the CSV.
6. Stop. Let them ask.

Do not narrate the architecture. If they ask how it's served, *then* say there's
no server and no API key, and show the copy-pasteable snippet.

---

## Rules that are not negotiable

- **Every number shown comes from our own fit.** No placeholders anywhere, not
  even as examples. If it isn't computed, the slot says "not yet computed".
- **Fit on 2012–2021.** 2022–2025 is the holdout.
- **Never present an uncorrected number as corrected.** Flag uncorrected cells.
- **Claim regional, not global.** A public competitor measured only a −4.3%
  global step, inside normal Aqua variability.
- **One validated push beats three speculative ones.** Run the checks locally.

---

## Degradation order, when time runs short

Drop in this order, without debate:

Fire Pulse → event summaries → explainer → counterfactual viewer → diurnal
correction (restrict to 2000–2021 and say why) → anomaly percentiles → per-biome
factors (fall back to one global threshold) → multi-AOI.

**Never dropped:** the Raw↔Harmonized toggle, one validation number, CSV export,
AOI + date-range selection. The last two are explicit requirements (R7–R9).

---

## Known traps, pre-paid

Each of these cost us time to find. Don't re-find them.

| Trap | What happens | Do this |
|---|---|---|
| FIRMS 404 is a JSON body | You ingest an error document silently | Check first byte for `{` |
| Header-only CSV is **valid** | You treat "no fires" as a failure | 0 data rows is legitimate |
| Connection resets under load | Random failures, looks like 404 | Retry with backoff; keep `JOBS=3` |
| NRT schema ≠ archive schema | Joins silently drop everything | No `type`, no `instrument`, MODIS `satellite` is `T`/`A`, VIIRS confidence spelled out |
| **Suomi-NPP NRT is empty** | Live layer shows nothing | Use **NOAA-20 / NOAA-21** for live |
| UTC mean over wide longitude | Wraps at midnight, nonsense output | Local solar time per detection: `UTC + lon/15` |
| H3 IDs aren't contiguous | Range reads fetch the whole file | Sort by coarse H3 parent (res 2–3), then day |
| Terra vs Aqua as a "control" | Confounds instrument with time of day | Control is SNPP across 2012, or Aqua vs itself pre-2022 |
| Mean FRP rises as sensitivity drops | You conclude the sensor got better | Censoring artifact; condition on SNPP |

---

## Two gaps to decide at 09:00

### 1. The 2026 data gap — decide the R5 framing

The archive ends at **2025**. NRT gives only **24h and 7d**. So nothing keyless
covers Jan–early Nov 2026.

R5 asks to compare "the current month against the historical median". Options:

- **(a) Reframe, no key needed.** Compare **the last 7 days against the
  climatology for those same days of year**. Defensible, arguably more useful
  operationally, and it is what an emergency responder actually wants. **This is
  the recommendation.**
- **(b) Get a MAP_KEY.** Free and instant from the FIRMS site. The area API then
  serves longer recent ranges and closes the gap. Worth 10 minutes as insurance
  even if we ship (a) — but do not put the key in the repo, and do not let the
  demo depend on it.

Pick one at 09:00 and don't revisit it.

### 2. Suomi-NPP NRT is empty, and that splits history from live

The historical VIIRS record is **Suomi-NPP** (the only VIIRS in the archive).
The working live feeds are **NOAA-20/21**. So "now vs history" compares
different platforms.

Smallest honest fix: label the live layer as NOAA-20/21 and state that it is not
harmonized to the historical series. If there is time, calibrate NOAA-20 →
Suomi-NPP-equivalent from concurrent NRT days. Do **not** silently mix them.

---

## Staging the data

```bash
./scripts/stage_data.sh                   # Chile, Portugal, Australia, Canada; 2001-2025
./scripts/stage_data.sh Brazil            # add another AOI
FIRST_YEAR=2012 ./scripts/stage_data.sh   # VIIRS era only, much faster
```

Resumable — re-running skips completed files, so an interrupted download costs
nothing. Writes `data/raw/MANIFEST.tsv` with row counts per file.

**Measured, full run on 2026-11-13:** 156 archive files, **32,537,637
detections, 2.5 GB**, about 55 minutes at `JOBS=3`.

| AOI | Size | Note |
|---|---|---|
| Portugal | 15 MB | ~2 min. Start here. |
| Chile | 46 MB | ~3 min |
| Canada | 562 MB | |
| Australia | 1.7 GB | `viirs-snpp_2025_Australia.csv` alone is 1,251,438 rows / 96 MB |

**Expect a few transient failures on the large files** — resets, reported as
`FAIL ... (5 attempts)`. Harmless: re-run with `JOBS=1` and it fetches only the
gaps. On the full run 3 of 156 failed first time and all 3 succeeded on the
re-run.

Order of operations at 09:20: start Portugal and Chile, begin work on those,
and let Australia and Canada download in the background. Nobody should wait
20 minutes for Australia before writing code.

**Why these four AOIs:**

| AOI | Why |
|---|---|
| Chile | Already characterised end to end. Real volcano detections, so the `type` filter visibly does something. 2017 and 2023 were genuine extreme years both sensors agree on. |
| Portugal | Narrow longitude, so the cleanest overpass-drift demonstration. Mediterranean regime. |
| Australia | Large counts — the performance test. Wide longitude, so it exercises the local-solar-time handling. |
| Canada | Record 2023 season, and NBAC exists as independent validation if there's time. |

Demo on **Chile or Portugal**. Use Australia to prove it scales.
