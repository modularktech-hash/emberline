# Handoff: where to pick up

Written for someone — a teammate — opening this
repository with no prior context. Read this first, then the three documents it
points at. Last updated 2026-10-29.

## The project in four sentences

Satellites have logged active fire hotspots since 2000, but the record breaks in
2012 when VIIRS (375 m) joined MODIS (1 km) and started detecting small fires
MODIS cannot see. Plot raw counts across that boundary and fire activity appears
to triple; it did not. We model which fires a MODIS-class sensor *would* have
detected, producing one comparable 25-year series, and deliver it as a burning
activity calendar for a user-selected area. The NASA Space Apps challenge asks
for exactly this, and the official statement is in
[`docs/challenge-statement.md`](challenge-statement.md).

## Event dates and the one rule that matters

The build is **Nov 14–15**. Judges expect the project to be built during those
48 hours.

**Nothing fire-specific is implemented in this repository on purpose.** Using
open resources and staging data beforehand is allowed and credited; showing up
with a finished private codebase is the one thing that gets a strong project
disqualified. So this repo holds the scaffold, the plan and the reference
material, and the harmonization itself gets written during the event.

If you are tempted to "just get the model working early": don't. Write it down
in `docs/priorities.md` instead.

## Read these three, in order

| Document | What it gives you |
|---|---|
| [`docs/research-findings.md`](research-findings.md) | **Read §1.** The orbital-drift finding that breaks our original premise, the diurnal-cycle correction that fixes it, the real data-access picture, and the competitive field |
| [`docs/challenge-statement.md`](challenge-statement.md) | The official ask, R1–R12 as checkable requirements, and the five things it changed about our plan |
| [`docs/priorities.md`](priorities.md) | Tiered build order, what we deliberately won't build, degradation order, open decisions |
| [`docs/data-reference.md`](data-reference.md) | Verified CSV schemas, verified no-key download URLs, land cover classes, FRP equation, literature numbers |

Then `docs/science.md` for the method in full and
`docs/architecture.md` for how the pieces fit.

## State of the repository

| Path | What it is | State |
|---|---|---|
| `packages/firms-ingest/` | Reusable FIRMS ingestion library (MIT, Python) | **Working**, 84 tests |
| `db/migrations/` | Supabase schema, RLS, RPC surface | **Working**, but see open decision 1 |
| `web/` | Next.js app shell: calendar, anomaly, live, method pages | **Shell only**, reads an empty database |
| `scripts/probe_firms_archive.sh` | Verifies archive access, prints the raw artifact | **Working** |
| `docs/` | Everything above | **Written** |
| The harmonization | Censoring, probability model, correction factors, validation | **Not built — on purpose** |

The app never presents an uncorrected number as corrected: until a fit is
published, the harmonized series falls back to raw sums and every affected cell
is flagged uncorrected in the UI.

## What was verified empirically (so you don't redo it)

Done on 2026-10-29. Reproduce with `scripts/probe_firms_archive.sh`.

1. **The FIRMS country archive needs no API key.** Static CSV at
   `firms.modaps.eosdis.nasa.gov/data/country/csv/{source}/{year}/...`.
   A MAP_KEY is needed *only* for the near-real-time area API, i.e. only for
   View C. The whole historical pipeline needs no credentials.
2. **Year coverage:** `modis` 2000–2024+, `viirs-snpp` 2012–2024+.
3. **Both schemas carry `type` and `instrument`.** Third-party schema mirrors
   claiming VIIRS has no `type` column are wrong. VIIRS confidence is single
   letters `l`/`n`/`h`, not spelled-out words.
4. **The artifact is real, and measured for 2001–2024.** Chile vegetation-fire
   counts: MODIS flat at ~4,000–6,700/year (except 2017 and 2023, genuine
   catastrophic fire years both sensors agree on), while VIIRS runs **2.47× in
   2012 rising to 4.43× by 2024**. The ratio nearly doubles over thirteen
   years, so **one global correction factor is demonstrably wrong.** Full table
   in `docs/data-reference.md`.
5. **NOAA-20/21 are NRT-only.** Not in the country archive under any slug
   tried. Archive slugs are `modis` and `viirs-snpp` only. Not blocking:
   Suomi-NPP is the correct overlap partner for Aqua. But it means the live
   layer sees platforms the history does not — label that, don't mix them.
6. **Live/NRT data is also keyless**, and carries same-day detections. The
   archive stops at the last complete year (2026 → 404), so NRT is the *only*
   source of current-month data, which requirement R5 needs. The NRT schema
   differs from the archive in four ways that fail silently.
7. **Terra and Aqua left their frozen orbits in 2022.** Measured on three
   continents: Terra ≈ −1.0h earlier, Aqua ≈ +1.2h later, 2021→2025.
   **This breaks the premise the whole method was built on** (that Aqua and
   Suomi-NPP share a 13:30 overpass). See `docs/research-findings.md` §1.
8. **The field is not empty.** Six public repos target this challenge; two are
   serious. The earlier assumption that few teams would pick it was wrong.

## Open decisions, in priority order

### 1. ~~Supabase RPC vs static Parquet~~ — DECIDED: static Parquet

**Settled 2026-11-03.** See
[`docs/decisions/0001-static-parquet-read-path.md`](decisions/0001-static-parquet-read-path.md).

No database, no API server in the read path. The app reads precomputed Parquet
over HTTP range requests. `db/migrations/` stays as a schema specification
only; nothing runs against it.

Work this implies in `web/`: delete `lib/supabase.ts`, replace `lib/useRpc.ts`
with a range-read hook, rewrite `lib/queries.ts` against the Parquet reader.
Everything else consumes data through `queries.ts` and is unaffected — keep
that boundary and don't let `hyparquet` leak into components.

**Layout constraint that keeps being misread:** H3 cell indices for a
contiguous map area are *not* a contiguous range. Sort by coarse H3 parent
cell (res 2–3) then day, and filter on the parent. Don't partition by
continent/country.

### 2. Pick the accessible colour ramp (R10)

### 3. Nothing else is blocking

NOAA-20/21 are NRT-only and that is settled, not open — see finding 5 above.

## The five reconciliations from the official statement

Summarised; the reasoning is in `docs/challenge-statement.md`.

1. **NASA asks for hotspot *counts*; our method harmonizes energy.** Resolved,
   and it is a strength: `Σ P_i` over VIIRS detections *is* the expected
   MODIS-equivalent count. Lead with the count, keep the energy as the
   secondary measure with cleaner validation.
2. **The calendar is month × year**, not day-of-year × year. "Which month and
   years had the highest activity" is the literal ask. ~310 cells, not ~9,500.
   Day-of-year becomes a drill-down.
3. **Median is the headline on the anomaly view**, not the 90th percentile.
   Keep the bands, lead with the median comparison.
4. **CSV export is a requirement, not optional.** It moved into Tier 0.
5. **MODIS is being retired** — that is the better pitch framing. This is not
   archaeology on a 2012 step; it is what keeps every MODIS-era baseline usable
   after MODIS goes dark.

## The pitch

> Nothing changed on Earth. We corrected what changed in orbit.
> MODIS is being retired — without this correction, every MODIS-era baseline
> breaks the day it goes dark.

The demo centerpiece is the Raw ↔ Harmonized toggle on the calendar: the 2012
step visibly vanishes. That is the only animation in the app.

## Rules for numbers, and they are not negotiable

**Every number shown in the demo comes from your own fit during the event.**

No placeholder R², RMSE, bias, onset shift or rarity percentile goes on a slide,
in the README, or in the UI — not even as an example. If a number is not
computed yet, the slot says so.

Literature values in `docs/data-reference.md` are **sanity checks for your
fitted curve, never results**. In particular the 9–11 MW figure is described in
its source as "thresholds of FRP detection," *not* a 50%-probability-of-detection
value, and it is cited there to Roberts & Wooster (2008) and Schroeder et al.
(2010) — not to Giglio. Do not call it "Giglio's 50% detection threshold."

## Saturday 21:00 checkpoint

By then there must be a **real agreement number** from a fit. If the
per-land-cover logistic model is not validated by that point, fall back to one
global FRP threshold. A validated simple model beats an unfinished complex one,
every time.

Sunday 14:00 is feature freeze. The degradation order is in
`docs/priorities.md`; the irreducible core is one AOI, one harmonized 25-year
calendar, one validation number, and the CSV export.

## Quick start

```bash
# ingestion library
cd packages/firms-ingest && pip install -e ".[dev]" && pytest

# verify archive access and see the artifact (no credentials needed)
./scripts/probe_firms_archive.sh Chile

# measure the Terra/Aqua overpass drift for any country
./scripts/measure_overpass_drift.py Chile 2015 2021 2023 2025

# web app
cd web && npm install && npm run dev
```

## Things that will waste your time if nobody warns you

- **A FIRMS 404 returns JSON, not a CSV.** Check the first byte for `{` before
  parsing, or you will silently ingest an error document.
- **Do not try to load the raw global detection record into Postgres.** It is
  hundreds of millions of rows. Load the aggregated cell-day table and the
  climatology table; keep point-level data for two or three demo AOIs only.
- **Terra's overpass is ~10:30, Aqua's ~13:30, all VIIRS ~13:30.** Fires have a
  strong daily cycle, so Aqua↔Suomi-NPP is the valid comparison pair. Handle
  Terra separately or exclude it from the primary fit.
- **FRP scales with pixel area**, and MODIS pixels grow roughly tenfold from
  nadir to swath edge. That is why `log(A_pixel)` belongs in the detection model
  and why a fixed FRP threshold is physically wrong.
- **The VIIRS/MODIS ratio grows over time** (2.47× in 2012 → 4.43× in 2024 for
  Chile). One constant correction factor will not hold across 13 years.
  Orbital drift explains part of the post-2022 acceleration but **not** the
  2012–2021 rise, which happened while the orbits were still frozen. NOAA-20
  is ruled out as a cause: it is not in the archive at all.
- **Never average `acq_time` in UTC over a wide-longitude AOI.** It wraps
  across midnight and gives nonsense (we got a bogus "07:55" for Terra over
  Australia that way). Convert to local solar time per detection first.
- **Don't try to read sensor sensitivity off raw counts or mean FRP.** Both are
  confounded: real fire activity varies year to year, and censoring *raises*
  mean FRP as sensitivity drops, because only the biggest fires survive
  detection. Condition on Suomi-NPP instead.
