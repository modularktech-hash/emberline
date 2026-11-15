# Data-failure matrix (E48)

Produced by `scripts/qa/failure_matrix.cjs` (Playwright, Chromium headless) against a local
`next build && next start` of `web/` at commit 3890b34, 14 Nov. Each page was loaded once
with nothing blocked and once per blocked file (request aborted as a network failure), then
left 9 s to settle. Recorded: error text on the page, retry controls, requests to the
four-country fallback files, and how many numbers were still rendered. Only combinations
where the page actually requested the blocked file are listed; the rest are "not requested".

Rerun: `cd web && npx next build && npx next start -p 3123 &` then
`BASE=http://localhost:3123 NODE_PATH=$(npm root -g) node scripts/qa/failure_matrix.cjs > fm.json`.

## Observed

| Page | File blocked | What the user sees | Retry | Classification |
|---|---|---|---|---|
| `/` | params_global.json | Page renders normally from `params.json` (four-country fit); no notice | no | **fallback mixing, silent** |
| `/` | season.json | Content sections empty (1 number left on page), no error message | no | **silent failure** |
| `/` | countries.json | Same: empty, no error | no | **silent failure** |
| `/explorer` | params_global.json | Notice "The world files could not be loaded: showing the four-country…" and coverage line "4 countries…" | no | actionable-ish status, no retry |
| `/explorer` | calendar_*_global.parquet | Loads `calendar_raw.parquet` + `calendar_harmonized.parquet` (four-country) while params stay world; no notice | no | **fallback mixing, silent** |
| `/explorer` | coverage_status.json | Renders normally, no notice | no | silent (coverage reasons missing) |
| `/trends` | season.json | "Could not load the data: Failed to fetch" | no | error, not actionable, no retry |
| `/trends` | countries.json | Renders normally (716 numbers), no notice | no | silent partial |
| `/seasons` | params_global.json | Renders from `params.json`, no notice | no | **fallback mixing, silent** |
| `/seasons` | calendar_*_global.parquet | Renders from four-country calendars, no notice | no | **fallback mixing, silent** |
| `/seasons` | coverage_status.json | Renders normally, no notice | no | silent |
| `/compare` | params_global.json | Renders from `params.json`, no notice | no | **fallback mixing, silent** |
| `/compare` | calendar_*_global.parquet | Four-country calendars, no notice | no | **fallback mixing, silent** |
| `/compare` | countries.json | Fewer numbers (16 → 12), no error | no | silent partial |
| `/lab` | params_global.json | Renders from `params.json`, no notice | no | **fallback mixing, silent** |
| `/lab` | calendar_*_global.parquet | Four-country calendars, no notice | no | **fallback mixing, silent** |
| `/lab` | countries.json | Fewer numbers (38 → 13), no error | no | silent partial |
| `/data` | params_global.json | Table unchanged, `params.json` also fetched; no notice | no | silent fallback |
| `/data` | coverage_status.json | Renders normally, no notice | no | silent |
| `/data` | countries.json | "Could not load the data: Failed to fetch" | no | error, not actionable, no retry |
| `/method` | params_global.json | Page drops from 3,037 to 86 numbers, no error message | no | **silent failure** |
| `/method` | coverage_status.json | Renders normally | no | silent |

Not requested by any page during load: `manifest.json` (the app does not read it, so it cannot
detect mixed versions), and map tiles (`tiles.openfreemap.org`) — the headless map did not
request tiles in this environment, so the tile-failure path is **not verified** here.
`/globe`, `/satellites`, `/about` requested none of the blocked files.
No page exposed a retry button in any case, so "preserved inputs after retry" could not be tested.

## Verdict

E48 not passed. Defects fixed in the web app.

## Re-run after the E16 fix (14 Nov, local build)

Same script, `SETTLE_MS=7000`, pages `/`, `/explorer`, `/trends`, `/seasons`, `/compare`, `/lab`, `/data`, `/method`.
Every blocked case that the page requested now shows an error or status line and at least one
retry control; clicking it after unblocking restored the unblocked number count on every page.
Blocking `params_global.json` or only the `_global` calendars makes the page request all three
four-country files together and shows the site-wide fallback banner; no page mixes sets.
0 page errors. Map tiles: still not requested headless, not verified.
