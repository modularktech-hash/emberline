# 0001 — Static Parquet read path, no backend

**Status:** Accepted, 2026-11-03
**Supersedes:** the open decision recorded in `docs/HANDOFF.md`

## Decision

**The app reads precomputed Parquet files over HTTP range requests. There is no
database and no API server in the read path.**

Supabase is dropped from the serving architecture. `db/migrations/` stays in the
tree as a **schema specification** — it is a good, reviewed description of the
aggregate tables and the query surface, and the Parquet column layout should
match it — but nothing runs against it.

## Why

- The data is **read-only, single-version, public, and has no users**. Every
  feature Postgres brings — transactions, auth, row-level security, concurrent
  writes, connection pooling — is unused weight.
- Measured: a range-read query answered from a 25 MB file in **~49 ms with a
  ~322 KB download**, cached to 0 bytes on repeat. No server was warm, because
  there was no server.
- It removes the two most likely demo failures: a cold Postgres instance and an
  expired credential. Combined with the keyless FIRMS access already verified,
  **the whole application needs zero credentials**.
- CSV/Parquet export (requirements R9, R12) becomes trivial: the bytes are
  already in the browser. With a database we would have to build an export
  endpoint.
- It makes the "static data protocol" idea free rather than extra work.

## Cost of the switch

Small and bounded. The Supabase coupling is ~190 lines in three files:

| File | Lines | Fate |
|---|---|---|
| `web/src/lib/supabase.ts` | 25 | Delete |
| `web/src/lib/useRpc.ts` | 57 | Replace with a `useParquet` range-read hook |
| `web/src/lib/queries.ts` | 105 | Rewrite against the Parquet reader |

`types.ts`, `aoi.ts`, `aoiStore.ts`, `scale.ts`, `fixtures.ts` and every page
component are unaffected — they consume the data layer through
`queries.ts`, so the swap is contained behind that boundary. **Keep that
boundary.** Do not let `hyparquet` calls leak into page components.

## The file layout, and the pitfall that keeps resurfacing

**H3 cell indices for a contiguous map area are NOT a contiguous range.** This
has been flagged three times and keeps coming back, so it is written down here
as the governing constraint:

> Sorting rows by raw H3 cell ID does **not** cluster a drawn AOI into a few
> row groups. An AOI that looks compact on a map maps to many scattered index
> ranges, and the reader ends up fetching most of the file.

Required layout:

```
one file per year  (or one file total if it stays under ~50 MB)
sorted by:  coarse H3 parent cell (res 2–3)  then  day
```

Query by filtering on the **coarse parent cell**, then refine in memory. Row
group statistics on the parent cell are what make the range read selective.

Do not partition into `/continent/country/year.parquet`. An AOI crossing a
border then needs several files, and administrative boundaries are irrelevant
to the query pattern.

## What we are explicitly giving up

- **Server-side aggregation.** Everything the UI shows must be precomputed in
  the offline pipeline or computable in the browser from a small slice. If a
  view needs a global scan, it needs a precomputed table instead.
- **Ad-hoc SQL during the event.** Use DuckDB locally against the same Parquet
  files for exploration; just do not put it in the serving path.
- **Anything write-shaped.** No saved AOIs, no user accounts, no annotations.
  None of these are in the requirements.

## Reversibility

The `queries.ts` boundary means reverting is a day's work, not a rewrite, and
`db/migrations/` still describes the schema. If a genuine need for a server
appears, the fallback is intact. It is not expected to appear.
