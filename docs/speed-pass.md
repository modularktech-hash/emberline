# Speed pass (14–15 Nov, builder session "speed pass")

Goal: the site loads and responds as fast as possible with the same UI and the same numbers.

## How it was measured

- Headless Chromium (Playwright, SwiftShader software GL), viewport 1440×900, cold cache per load.
- **fast**: no throttling, median of 3 loads (local) or 1 load (live). **slow**: Fast-3G-like network (562 ms latency, 1.44 Mbit/s down) plus 4× CPU throttle via CDP, 1 load.
- "first content": the page's main data content is on screen (Explorer calendar, Seasons chart, Data/Method table rows, Trends chart, Globe table, home tiles no longer "loading").
- TBT = sum over long tasks of (duration − 50 ms) until ~3 s after first content. JS and data = compressed bytes transferred.
- Route change: start on /about with full effects (`?perf=high`, because this container has ≤ 4 CPUs and would otherwise get low-power mode, which skips the curtain), click the nav link, and time how long the named curtain fully covers the screen, when the screen is clear again, and when the destination's content is ready.
- Scripts: `web/scripts/perf-measure.cjs` (loads and route changes), `web/scripts/perf-interact.cjs` (Explorer interactions).
- Lighthouse was not run: it is not installed here and was not fetched.
- The container's CPU is shared with the builds and other runs, so single figures can move by 10–20%; differences smaller than that are noise.

## Baseline

Local: `next build && next start` at commit `43d5d90` (before this pass, and before the E09–E35 merge). Live: https://emberline-tan.vercel.app/ at `7fe847f` (after that merge, before this pass).

### Local, fast

| Route | TTFB | FCP | LCP | TBT | longest task | CLS | first content | JS | data files |
|---|---|---|---|---|---|---|---|---|---|
| / | 5 ms | 0.28 s | 1.98 s | 1175 ms | 472 ms | 0.041 | 0.40 s | 941 KB | 584 KB in 6 |
| /explorer | 6 ms | 0.28 s | 1.24 s | 608 ms | 604 ms | 0 | 0.57 s | 692 KB | 759 KB in 10 |
| /globe | 5 ms | 0.24 s | 0.79 s | 1112 ms | 675 ms | 0 | 1.94 s | 941 KB | 184 KB in 2 |
| /compare | 8 ms | 0.38 s | 1.64 s | 18 ms | 68 ms | 0.002 | 0.46 s | 462 KB | 801 KB in 10 |
| /seasons | 5 ms | 0.27 s | 1.82 s | 12 ms | 62 ms | 0 | 0.47 s | 412 KB | 759 KB in 10 |
| /trends | 4 ms | 0.33 s | 1.32 s | 0 ms | 0 ms | 0.106 | 0.27 s | 410 KB | 179 KB in 2 |
| /satellites | 4 ms | 0.28 s | 1.22 s | 800 ms | 522 ms | 0 | 0.13 s | 946 KB | 75 KB in 2 |
| /method | 5 ms | 0.36 s | 1.61 s | 74 ms | 96 ms | 0.074 | 0.49 s | 414 KB | 164 KB in 2 |
| /lab | 5 ms | 0.30 s | 1.36 s | 15 ms | 65 ms | 0 | — | 411 KB | 801 KB in 10 |
| /data | 4 ms | 0.36 s | 1.50 s | 7 ms | 57 ms | 0.231 | 0.32 s | 412 KB | 222 KB in 3 |
| /about | 5 ms | 0.22 s | 1.23 s | 0 ms | 0 ms | 0 | 0.12 s | 402 KB | 0 KB in 0 |

/lab "first content" was not captured in the baseline run (the detector was wrong for that page).

### Local, slow (Fast 3G + 4× CPU)

| Route | TTFB | FCP | LCP | TBT | longest task | CLS | first content | JS | data files |
|---|---|---|---|---|---|---|---|---|---|
| / | 7 ms | 1.94 s | 10.78 s | 417 ms | 228 ms | 0.061 | 8.71 s | 941 KB | 584 KB in 6 |
| /explorer | 6 ms | 1.74 s | 6.76 s | 532 ms | 245 ms | 0.011 | 9.68 s | 692 KB | 759 KB in 10 |
| /globe | 8 ms | 1.85 s | 5.01 s | 2277 ms | 1049 ms | 0.058 | 12.54 s | 941 KB | 184 KB in 2 |
| /compare | 4 ms | 1.76 s | 6.10 s | 346 ms | 148 ms | 0.154 | 9.40 s | 416 KB | 801 KB in 10 |
| /seasons | 5 ms | 1.72 s | 6.40 s | 265 ms | 175 ms | 0.078 | 9.40 s | 412 KB | 759 KB in 10 |
| /trends | 4 ms | 1.95 s | 4.69 s | 258 ms | 173 ms | 0.101 | 5.73 s | 410 KB | 179 KB in 2 |
| /satellites | 5 ms | 1.84 s | 1.84 s | 182 ms | 131 ms | 0 | 0.76 s | 329 KB | 1 KB in 1 |
| /method | 4 ms | 1.88 s | 4.81 s | 682 ms | 340 ms | 0.069 | 6.20 s | 419 KB | 164 KB in 2 |
| /lab | 5 ms | 1.74 s | 6.47 s | 395 ms | 141 ms | 0.002 | — | 411 KB | 801 KB in 10 |
| /data | 9 ms | 1.92 s | 4.68 s | 434 ms | 251 ms | 0.226 | 5.63 s | 412 KB | 222 KB in 3 |
| /about | 4 ms | 1.78 s | 1.78 s | 119 ms | 117 ms | 0 | 0.69 s | 304 KB | 0 KB in 0 |

### Local, route change (curtain)

| To route | curtain fully covers for (fast) | screen clear at (fast) | content ready at (fast) | covers for (slow) | clear at (slow) | content ready at (slow) |
|---|---|---|---|---|---|---|
| / | 1737 ms | 2.37 s | 0.66 s | 635 ms | 1.42 s | 6.28 s |
| /explorer | 1627 ms | 2.02 s | 0.71 s | 902 ms | 1.93 s | 5.87 s |
| /globe | 2501 ms | 3.57 s | 2.90 s | 1351 ms | 2.17 s | 11.70 s |
| /compare | 944 ms | 1.97 s | 0.86 s | 1336 ms | 2.17 s | 7.48 s |
| /seasons | 892 ms | 2.11 s | 0.73 s | 1330 ms | 2.16 s | 6.88 s |
| /trends | 686 ms | 1.91 s | 0.58 s | 1273 ms | 2.10 s | 3.64 s |
| /satellites | 1450 ms | 1.97 s | 0.42 s | 1440 ms | 2.24 s | 1.76 s |
| /method | 594 ms | 1.70 s | 0.68 s | 1303 ms | 2.14 s | 3.99 s |
| /lab | 895 ms | 2.09 s | 0.00 s | 1460 ms | 2.25 s | 0.00 s |
| /data | 483 ms | 1.32 s | 0.51 s | 1360 ms | 2.16 s | 3.43 s |
| /about | 624 ms | 1.33 s | 0.41 s | 664 ms | 1.32 s | 0.52 s |

### Live, fast

| Route | TTFB | FCP | LCP | TBT | longest task | CLS | first content | JS | data files |
|---|---|---|---|---|---|---|---|---|---|
| / | 342 ms | 1.69 s | 3.66 s | 2073 ms | 789 ms | 0 | 2.14 s | 965 KB | 809 KB in 9 |
| /explorer | 357 ms | 0.80 s | 2.48 s | 870 ms | 887 ms | 0 | 1.28 s | 716 KB | 778 KB in 11 |
| /globe | 380 ms | 1.04 s | 2.58 s | 1739 ms | 887 ms | 0.04 | 1.44 s | 966 KB | 204 KB in 3 |
| /compare | 329 ms | 1.19 s | 2.20 s | 31 ms | 81 ms | 0.002 | 1.47 s | 498 KB | 833 KB in 11 |
| /seasons | 345 ms | 0.72 s | 1.85 s | 20 ms | 70 ms | 0.071 | 1.33 s | 426 KB | 778 KB in 11 |
| /trends | 307 ms | 0.78 s | 1.86 s | 24 ms | 64 ms | 0.106 | 0.90 s | 425 KB | 526 KB in 6 |
| /satellites | 313 ms | 0.85 s | 2.11 s | 1063 ms | 741 ms | 0 | 0.46 s | 969 KB | 328 KB in 6 |
| /method | 304 ms | 0.71 s | 1.67 s | 81 ms | 102 ms | 0.04 | 1.07 s | 432 KB | 648 KB in 8 |
| /lab | 299 ms | 0.87 s | 2.19 s | 72 ms | 90 ms | 0 | — | 425 KB | 833 KB in 11 |
| /data | 406 ms | 1.06 s | 2.44 s | 35 ms | 78 ms | 0.231 | 1.11 s | 428 KB | 337 KB in 6 |
| /about | 345 ms | 0.67 s | 1.62 s | 0 ms | 0 ms | 0 | 0.40 s | 415 KB | 0 KB in 0 |

### Live, slow (Fast 3G + 4× CPU)

| Route | TTFB | FCP | LCP | TBT | longest task | CLS | first content | JS | data files |
|---|---|---|---|---|---|---|---|---|---|
| / | 375 ms | 2.81 s | 12.50 s | 1843 ms | 685 ms | 0.061 | 12.03 s | 965 KB | 809 KB in 9 |
| /explorer | 419 ms | 2.82 s | 7.81 s | 672 ms | 251 ms | 0.011 | 10.58 s | 716 KB | 778 KB in 11 |
| /globe | 342 ms | 2.91 s | 5.81 s | 382 ms | 157 ms | 0.079 | 4.88 s | 527 KB | 204 KB in 3 |
| /compare | 350 ms | 2.84 s | 6.00 s | 361 ms | 153 ms | 0.154 | 10.88 s | 498 KB | 833 KB in 11 |
| /seasons | 322 ms | 2.56 s | 6.36 s | 201 ms | 161 ms | 0.078 | 10.02 s | 426 KB | 778 KB in 11 |
| /trends | 338 ms | 2.76 s | 5.04 s | 409 ms | 210 ms | 0.101 | 9.64 s | 510 KB | 526 KB in 6 |
| /satellites | 332 ms | 2.72 s | 2.72 s | 154 ms | 129 ms | 0 | 1.02 s | 338 KB | 1 KB in 1 |
| /method | 363 ms | 2.60 s | 5.13 s | 757 ms | 390 ms | 0.04 | 9.32 s | 510 KB | 648 KB in 8 |
| /lab | 392 ms | 2.60 s | 6.75 s | 282 ms | 147 ms | 0.002 | — | 425 KB | 833 KB in 11 |
| /data | 308 ms | 2.63 s | 5.10 s | 637 ms | 373 ms | 0.226 | 7.84 s | 500 KB | 338 KB in 6 |
| /about | 356 ms | 2.50 s | 2.50 s | 136 ms | 148 ms | 0 | 1.03 s | 310 KB | 0 KB in 0 |

### Live, route change (curtain)

| To route | curtain fully covers for (fast) | screen clear at (fast) | content ready at (fast) | covers for (slow) | clear at (slow) | content ready at (slow) |
|---|---|---|---|---|---|---|
| / | 441 ms | 1.72 s | 0.83 s | 442 ms | 1.26 s | 8.05 s |
| /explorer | 2455 ms | 4.09 s | 1.02 s | 340 ms | 1.27 s | 7.41 s |
| /globe | 1438 ms | 3.85 s | 0.65 s | 1497 ms | 5.00 s | 2.38 s |
| /compare | 759 ms | 1.34 s | 1.15 s | 1795 ms | 3.24 s | 8.53 s |
| /seasons | 563 ms | 1.35 s | 1.07 s | 1335 ms | 2.17 s | 8.04 s |
| /trends | 614 ms | 1.33 s | 0.83 s | 1329 ms | 2.15 s | 6.52 s |
| /satellites | 482 ms | 1.62 s | 0.82 s | 1507 ms | 2.33 s | 1.85 s |
| /method | 1078 ms | 1.80 s | 0.99 s | 1800 ms | 2.89 s | 6.67 s |
| /lab | 799 ms | 2.07 s | 0.00 s | 1427 ms | 2.28 s | 0.00 s |
| /data | 654 ms | 1.74 s | 0.81 s | 1301 ms | 2.13 s | 5.44 s |
| /about | 635 ms | 1.32 s | 0.41 s | 792 ms | 1.76 s | 0.58 s |

### Explorer interactions (local, 4× CPU, full effects)

| Interaction | Baseline |
|---|---|
| Raw → Harmonized toggle, click to second frame | 83 ms, no long task |
| Harmonized → Raw | 71 ms, no long task |
| Hover across 60 calendar cells | median 33 ms per cell (two frames), no long task |
| Country switch (pick in the list → new calendar) | 99–115 ms, one long task of 56–83 ms |

### What the baseline shows

1. **Every page's text was invisible until the JS bundle hydrated.** The page wrapper and every `Reveal` rendered `opacity: 0` in the server HTML and waited for Motion. On the slow profile FCP was ~1.8 s but LCP 4.7–10.8 s.
2. **Country pages downloaded ~0.76–0.8 MB of data in 10 requests** (two Parquet footers, five column ranges, the 148 KB fit) to draw one country: first calendar at 9.4–9.7 s on the slow profile.
3. **Every page shipped the Parquet reader and its decompressors (97 KB compressed)** because the footer imports the data layer.
4. **Home waited for all six files (584 KB) before filling any tile**; only two numbers came from the 120 KB season file.
5. After the E16 merge every loader also waited for params_global.json plus both Parquet footers before returning anything (live: Trends 526 KB, Method 648 KB).
6. Data files were served `max-age=0, must-revalidate`: every return visit revalidated each file.
7. Explorer interactions were already fast; no work needed there.
