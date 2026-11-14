# Performance budget — cold mobile time-to-analysis (E47)

Measured 2026-11-14 with `scripts/qa/cold_mobile.cjs` (Playwright + Chrome
DevTools Protocol). Profile: 412×823 @1.75 mobile viewport with a Moto G Power
user agent, **4× CPU throttle**, **Slow 4G** (1.6 Mbps down / 750 kbps up /
150 ms RTT), HTTP cache disabled and a fresh browser context per run. Each
figure is the **median of 3 runs**. The host CPU is not a real phone, so treat
these as a repeatable lab baseline, not field data.

"Calendar usable" means at least 12 month buttons in the Explorer's "Burning
activity calendar" region have a number in their aria-label (the default
selection), timed from navigation start. Bytes are the sum of over-the-wire
`encodedDataLength` until that point plus a 2 s settle.

| Route | Target | FCP | LCP | Calendar usable | Transferred |
|---|---|---|---|---|---|
| Home `/` | local `next build && next start` | 1.02 s | 4.34 s | — | 438 KB |
| Home `/` | live emberline-tan.vercel.app | 0.91 s | 4.62 s | — | 454 KB |
| Explorer | local | 0.84 s | 5.20 s | **7.43 s** | 1,293 KB |
| Explorer | live | 0.83 s | 5.48 s | **7.84 s** | 1,331 KB |

Run spread was small: Explorer calendar usable times were 7.39–7.45 s (local)
and 7.81–7.85 s (live).

Where the bytes go on the live Explorer: fetched data 801 KB
(`calendar_harmonized_global.parquet` 400 KB, `calendar_raw_global.parquet`
212 KB, `params_global.json` 166 KB), JS 428 KB, fonts 73 KB. Home is 345 KB of
JS plus 73 KB of fonts.

## Proposed budget (same profile, median of 3)

| Metric | Budget | Now (live) | Status |
|---|---|---|---|
| Home LCP | ≤ 3.0 s | 4.62 s | over |
| Home transferred | ≤ 400 KB | 454 KB | over |
| Explorer calendar usable | ≤ 5.0 s | 7.84 s | over |
| Explorer transferred before usable | ≤ 700 KB | 1,331 KB | over |
| JS per route | ≤ 300 KB | 345–428 KB | over |

## Worst offenders (handed to the UI session)

1. **Both world calendar parquets (~610 KB) are fetched in full for one
   country.** With 1.6 Mbps that is about 3 s of transfer on its own. Range-read
   only the row groups for the selected key (`queries.ts`), or publish
   per-country slices. The data side can re-sort or split the files on request.
2. **`params_global.json` (166 KB) loads on Explorer** when only one country's
   parameters are needed. The data side could split it per country.
3. **JS 345–428 KB per route.** Lazy-load MapLibre and Motion, which the
   calendar does not need before first paint.
4. **Two woff2 fonts (73 KB).** Subset them or preload only one.

Re-run: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/qa/cold_mobile.cjs <base-url> 3 <label>`.
