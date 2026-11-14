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
- A UI polish pass (cursor, magnetic buttons, nav hide-on-scroll, Lenis, dot-matrix touches, 404) was stopped mid-way at the owner's request. What landed is in git log after `9d768ae`.
- Refresh `live.json` near demo time (`scripts/build_live.py`). Then: the README, submission text and 30 s video (`docs/submission.md`).
