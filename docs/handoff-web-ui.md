# Hand-off: web UI session (cloud "data host", 14 Nov)

Written at the owner's request so another session can take over `web/` straight away.
**The claim on `web/` is released.** Pull `main` before editing.

## What the site is now

Live: https://emberline-tan.vercel.app/ (Vercel builds `main`, root `web/`).

- **Look** (owner-approved, keep it):
  - Cream paper backdrop with soft ember/rose/amber glows. **No photos**: the owner removed them.
  - Newsreader serif headlines with an orange italic accent line, and mono eyebrows.
  - Apple-style **liquid glass** surfaces.
  - **Nothing-OS dot-matrix** accents. The owner said to keep these.
- **Home** (`web/src/components/Home.tsx`):
  - A minimal hero: a live-count pill, the headline, one line of text, two buttons, and a large draggable `FireGlobe` with wheel zoom off.
  - Below it, the dot-matrix **widget bento**: live 24 h count, UTC dot clock, date, record size, best R², and the fleet tile.
  - Then the scroll story chapters (orbits, the 2012 jump, drift).
- **Pages**: `/explorer`, `/globe`, `/compare`, `/seasons`, `/trends`, `/satellites`, `/method`, `/lab`, `/data`, `/about`. Navigation groups are in `web/src/lib/nav.ts`.

## Where things live

| Thing | File |
|---|---|
| Design tokens; glass tiers `.glass` `.glass-thin` `.glass-thick` `.glass-dark` `.pill-dark` `.card` `.window` | `web/src/app/globals.css`. Keep these inside `@layer components`, or Tailwind's `absolute` etc. stop winning. |
| Backdrop (cream + glows, no images) | `web/src/components/Backdrop.tsx` |
| Pointer-follow glass highlight | `web/src/components/GlassLight.tsx` |
| Dot-matrix text, dot clock, `useNow()` | `web/src/components/DotMatrix.tsx` |
| Shared UI (Reveal, PageHead, Segmented, Chip, CountUp) | `web/src/components/ui.tsx` |
| 3D globe (`allowZoom` prop added) | `web/src/components/FireGlobe.tsx` |

## Fixed in this session

- **The `/data` page was missing from git and from Vercel.** The root `.gitignore` rule `data/` also matched `web/src/app/data/`. It is now committed, with an exception in `.gitignore`.

## Claude artifact copy of the site

A clickable copy of the real app (a static export) is at https://claude.ai/artifact/33LmHNK76DxGhpewWHf9yu. It is private to the owner. The artifact host imposes some constraints, so it is built from a throwaway copy, never from `main`:
- **Export settings:** `output: "export"`, `trailingSlash: true`, `assetPrefix: "/app"`. The host reserves top-level names starting with `_`, so move `out/_next` into `out/app/_next`, and drop `out/_not-found` and the root `__next.*.txt`.
- **Files are served under a sub-path, not at the site root.** The entry page carries a shim that:
  - sets `TURBOPACK_CHUNK_BASE_PATH="app/_next/"`
  - prefixes absolute `fetch()` and `img.src` paths with the base
  - neutralises the URLs passed to `pushState`/`replaceState`

  Also rewrite `/app/_next/` to `app/_next/` in the HTML and the RSC `.txt` files, and in the CSS font URLs (to `../media/`).
- **Parquet isn't a served type,** so ship it as `*.parquet.wasm`. `queries.ts` (copy only) fetches the whole file and wraps the ArrayBuffer as `{byteLength, slice}`.
- **Data folder name:** public data was renamed `dfiles/` in the copy, because the `/data` route and `public/data/` collide in a static export.
- **The Explorer basemap does not load there** (the external tile host is blocked), and download links don't work there.

## Open / next

- The world data is **done and published by the "app build" session** (`*_global` files, `4f47247`). The app does not read `*_global` yet (TODO §2). This session's duplicate world download has been stopped.
- **Polish pass landed** (`f10f720`, `1f8a176`):
  - Design tokens and `web/src/lib/motion.ts`.
  - Dot+ring cursor; magnetic CTAs; card tilt.
  - Lenis smooth scroll (new dependency `lenis`); progress bar.
  - Nav hides on scroll down.
  - Ticker; dot-matrix numerals on Explorer, Compare and Trends.
  - Dot 404; OG image; icon.
- **Open bugs** for whoever takes `web/` next:
  1. **Sideways scroll at 375px** on /trends, /method, /lab and /data. A `pre` or table block inside an `overflow-x-auto` container is the likely cause; setting `pre{overflow:hidden}` makes it go away.
  2. **Fallback numbers in `Home.tsx` DriftChapter** (`?? 13.2`, `?? 14.4`): these break the rule that every number comes from our own fit. Remove them and show a loading state instead.
  3. **Lighthouse after the polish pass:** performance 50 (the WebGL globe on a software renderer), accessibility 91. Both accessibility fails were fixed afterwards; Lighthouse was not re-run.
  4. **Not done:** floating-label inputs, and the second polish round.
- Refresh `live.json` near demo time (`scripts/build_live.py`). Then: the README, submission text and 30 s video (`docs/submission.md`).

## Performance pass 1 (14 Nov, "app build" session)

The owner reported the site close to unusable on a fast Linux PC (Chrome/Firefox) and only OK on macOS. Measured first, then fixed the causes.

**How it was measured.** Headless Chromium 153 with SwiftShader (software GL, a fair stand-in for a poor GPU compositor), 4x CPU throttle, scripted wheel scrolling top to bottom, `next build && next start`. Script: per route, rAF frame deltas during the scroll, long tasks, backdrop-filter count, WebGL contexts, JS transferred. Firefox and WebKit are not installed in the container, so only Chromium was measured; real-GPU behaviour was not measured.

**Causes, most expensive first, and what changed.**
1. **Globe** (home, /globe, /satellites). A 100 ms `setInterval` re-rendered React with new inline accessors, which made globe.gl rebuild ~8k unmerged fire meshes ten times a second. In addition, ~10k H3 hex dots were polyfilled from `countries.geojson` on the main thread on every load.
   - Fires are now one merged mesh. Hover and click use `toGlobeCoords` plus a nearest-cell search.
   - Satellites are moved by a rAF loop outside React; orbits are recomputed every 12 s.
   - Land is a 130 KB baked texture, built by `scripts/make_globe_texture.py`.
   - DPR is capped at 1.5 (1 in low-power mode). Rendering pauses when the globe is off-screen or the tab is hidden.
   - The globe chunk loads only near the viewport. A static poster shows while it loads and replaces the canvas if WebGL is missing or the context is lost.
   - No scroll parallax on the canvas.
2. **backdrop-filter** on 11–36 elements per page, plus a full-screen grain layer using mix-blend-mode and SVG feTurbulence.
   - Glass is now a static translucent fill with the same rim and sheen.
   - The only remaining backdrop-filter is a 12 px blur on the nav pill (`.glass-nav`), inside `@supports` with a solid fallback.
   - Grain is a 5 KB PNG tile (`public/grain.png`).
3. **Large soft shadows** (60–80 px blur) were costly to rasterize in software. Their radii are now roughly halved, and low-power mode uses a single small shadow.
4. **Layers and filters.**
   - Every `.card` had a 3D perspective transform, which promoted each one to its own layer.
   - `Reveal` and the route template animated `filter: blur`.
   - Now only opacity and translate animate, and cards get a plain CSS hover lift.
5. **Dot-matrix text.**
   - `DotText` rendered hundreds of motion circles, each with its own IntersectionObserver.
   - The home date tile re-rendered all of them every second.
   - Now each display is two memoized paths with one clip-path wipe, and the date ticks once a minute (`useToday`).
6. **"Old satellites are drifting" clocks.** Motion's SVG `rotate` used a fill-box transform origin, so the hands swung about the wrong point (the glitch). The same bug affected the orbit diagram.
   - Rotation is now an SVG `transform` attribute written straight from the scroll value, with no React re-render.
   - Open bug 2 (the `?? 13.2` fallback numbers) is fixed: the dials show "—" until `drift.json` loads.
7. **Scroll-linked JS.**
   - Lenis is removed, and so is the progress bar.
   - SiteNav now uses one passive, rAF-throttled listener and sets state only when a flag flips.
   - The cursor, magnetic CTAs, card tilt and pointer-follow glass light are removed.
8. **Explorer data.**
   - Before: HEAD, footer and column-chunk range reads for each calendar file, with the harmonized file waiting for the raw one.
   - Now: the small calendar files are fetched whole, in parallel, started by an inline script in the HTML (`components/DataPreload.tsx`).
   - Not `<link rel=preload>`: React sends those as RSC hints, which fired on every page that prefetched /explorer.
   - The map mounts only once the calendar has data and the map is near the viewport.

**Low-power mode.** `<html data-perf="low">` is set when any of these holds: ≤ 4 CPUs, a median frame time above 24 ms in the first second, or a software WebGL renderer. It turns off the nav blur, glass rims, grain, dot wipes, marquee, globe auto-rotate, fire rings and orbit dash animation. Override with `?perf=low` or `?perf=high`, which sticks for the tab. `prefers-reduced-motion` turns animations off.

**Font.** Newsreader is removed. UI and headings use the system stack (`-apple-system`, SF Pro…), with Inter (self-hosted, variable) as the named fallback. Figures and labels use `ui-monospace` / SF Mono / Geist Mono. Display tokens (`--display-*`, `.t-hero`, `.t-d1`–`.t-d3`) are in `globals.css`. Accent lines are upright, no longer italic.

**Numbers.** Same harness, 4x CPU, SwiftShader. In the after runs, auto mode selected low-power here (the container reports ≤ 4 CPUs).

| Route | Before: median / p95 frame, frames > 100 ms, long-task ms during scroll | After, auto (low): same | After, forced `?perf=high` |
|---|---|---|---|
| / | 700 / 3350 ms, 41 of 41 frames (reached only 1920 of 11041 px in 45 s), 46 835 ms | 16.7 / 50 ms, 7, 0 ms | 16.7 / 283 ms, 34, 2167 ms |
| /globe | 233 / 2583 ms, 47, 31 372 ms | 16.7 / 117 ms, 8, 0 ms | 16.7 / 350 ms, 16, 266 ms |
| /satellites | 50 / 1117 ms, 38, 22 246 ms | 16.7 / 150 ms, 13, 0 ms | 16.7 / 483 ms, 20, 0 ms |
| /explorer | 16.7 / 133 ms, 9, 2220 ms | 16.7 / 50 ms, 4, 484 ms (maplibre init) | 16.7 / 100 ms, 5, 658 ms |
| /lab | 16.7 / 300 ms, 33, 249 ms | 16.7 / 33 ms, 5, 0 ms | 16.7 / 267 ms, 13, 0 ms |
| /compare | 16.7 / 333 ms, 18, 675 ms | 16.7 / 33 ms, 1, 0 ms | 16.7 / 283 ms, 9, 0 ms |
| /seasons, /trends, /method, /data, /about | p95 50–200 ms, 1–28 | p95 17–33 ms, 0–2, 0 ms | p95 17–33 ms, 0–3 |

The /compare and smaller-route after figures come from the first after run, before the shadow-radius change.

Backdrop-filter elements went from 11–36 per page to 0 (1 with `?perf=high`).

Explorer load to first calendar, on a Fast-3G-like link (562 ms RTT, 1.44 Mbit/s) with 4x CPU and a cold cache, median of 3 runs: **18.2 s → 8.1 s**. That time is now bound by downloading the ~680 KB of the two calendar files.

**Still open.**
- The no-frames-over-100 ms target is not met on /globe and /satellites, even in low-power mode: 8 and 13 frames over 100 ms, with no long tasks. That is SwiftShader rasterizing the WebGL canvas; a real GPU should behave far better, but this was not measured.
- In forced high mode under software GL, the remaining glass rims and shadows still cost raster time. This is why such machines get low-power mode automatically.
- Firefox and Safari were not tested here.
- Open bug 1 (sideways scroll at 375 px) no longer reproduces: `scrollWidth` equals the viewport width on every route at 375 px.
- Lighthouse was not re-run.
- Pass 2 (content clarity, footer, number styling) has not started.
