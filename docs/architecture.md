# Architecture

**The governing principle: all heavy computation happens offline, ahead of
time. The web application only ever reads small precomputed tables.**

That is what lets the app run fast on free tiers and never have a slow demo.

```
FIRMS archive CSVs                FIRMS area API (near-real-time)
        |                                    |
        v                                    v
   +----------------------------------------------+
   |            firms-ingest (Python)             |
   |  normalize -> filter -> cluster -> aggregate |
   +----------------------------------------------+
        |                    |               |
        v                    v               v
   cell_day table     climatology      demo-AOI points
        |                    |               |
        +--------------------+---------------+
                             v
              Supabase Postgres + PostGIS
                    (RLS: anon select)
                             |
                     Postgres functions
                     (the entire API)
                             |
                             v
              Next.js App Router on Vercel
        calendar | anomalies | live | method
```

## Offline pipeline

Python, driven by [`firms-ingest`](../packages/firms-ingest/). Polars for the
archive CSVs; the full record is hundreds of millions of rows, so scans are lazy
and every useful operation is a filter or an aggregation pushed down into the
scan.

Per run:

1. Normalize each product into the canonical detection schema.
2. Join each detection to a land cover class from MCD12Q1.
3. Filter the `type` field — vegetation fires only.
4. Cluster detections into fire events (space-time DBSCAN).
5. Aggregate onto H3 (resolution 4–5) by **cell × day × sensor**, storing count,
   FRP sum, mean and max.
6. Fit censoring thresholds and correction factors; re-aggregate with censoring
   applied to produce the censored columns.
7. Precompute day-of-year climatology percentiles.

## Database

Supabase Postgres with PostGIS.

**Critical constraint:** do not attempt to load the raw global detection record.
It is hundreds of millions of rows and it will sink the project. Load:

- `fire_cell_day` — the aggregated table, both raw and censored columns
- `fire_climatology` — day-of-year percentile bands
- `harmonization_factor` — the fitted corrections and their validation stats
- `cell_landcover` — dominant land cover per cell
- `fire_detection` — **point-level detections for two or three demo areas only**,
  so the map can zoom to individual hotspots on stage

Queries are exposed as Postgres functions and called through Supabase RPC.
**There is no separate API server** to deploy, debug or keep warm — the
functions are the API.

Every function is `SECURITY INVOKER` with a pinned `search_path`, so row level
security still applies and a function cannot be used to read past it.

### The harmonized view

`fire_cell_day_harmonized` joins the raw table to the active fit and produces
both series. Cells with no fitted factor fall back to the raw sum **and are
flagged `uncorrected`**, which the UI surfaces. An unharmonized cell is visible
rather than silently wrong.

## Frontend

Next.js App Router, TypeScript, Tailwind, deployed on Vercel.

- **MapLibre GL**, not Mapbox. No token, no account, no billing surprise
  mid-demo. Basemap from CARTO's open styles; the URL is overridable.
- **Hand-rolled SVG** for the calendar heatmap. A general charting library
  fights this specific layout and wastes hours.
- **Framer Motion for exactly one thing**: the raw→harmonized transition. The
  toggle indicator uses `layoutId`; the ~9,000 heatmap cells transition their
  fill with plain CSS, because animating that many nodes through a motion
  library would be slow. Nothing else is animated. Restraint reads as
  confidence; animating everything reads as padding.
- **The AOI lives in one external store**, so switching views never loses the
  selection, and the server render has a stable snapshot to hydrate against.

### Query states

Four states are distinguished, never collapsed:

| State | Meaning | Shown as |
|---|---|---|
| `loading` | in flight | skeleton |
| `unconfigured` | no Supabase env | setup instructions |
| `error` | RPC failed | the error message |
| `ok` + empty | **no fires here** | a finding, phrased as one |

"Not connected" and "nothing burned here" are different answers.

## Accounts and keys needed

- FIRMS `MAP_KEY` (free) for the near-real-time API
- Supabase project
- Vercel project
- GitHub repository

## Where the pieces are

| Path | Owner role |
|---|---|
| `packages/firms-ingest/` | Data engineer |
| `db/migrations/` | Data engineer |
| `web/src/lib/`, `web/src/app/` | Frontend lead |
| `web/src/components/*Chart*`, `*Heatmap*` | Frontend second |
| `docs/science.md` | Science lead + second |
