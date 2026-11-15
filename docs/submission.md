# Submission — what we hand in, and the checklist

# 2026 rules — confirmed from the official Project Submission Guide (owner pasted, 15 Nov)

These override anything older below.

- **Deadline:** Sunday 15 Nov, 23:59, local time of our Local Event (Universal Event: Team Owner's residence). Only the last saved submission is judged; re-submitting is allowed until the deadline. Our target stays 16:00 IST.
- **Demo:** video ≤ 30 s **or** slide deck ≤ 7 slides including title/intro. Over the limit = not eligible for global judging. **Decision: 7-slide deck.** Slides in English. Slides must show **team name, names of team members, the challenge selected**, an image of the project, the user experience, and how NASA/space-agency open data makes it possible.
- **Hosting:** demo and documents via public link (YouTube, Drive, GitHub, OneDrive, Dropbox), no login. Test in a private window. The project page accepts images (JPG/PNG/GIF ≤ 10 MB) but not videos or documents.
- **Form fields:** Project Name · High-Level Project Summary · Link to Project Demo · Link to Final Project · Detailed Project Description · **Use of Super Intelligence (SI)** (this replaces the old "Use of AI" field; declare our Claude use there) · NASA Data · Space Agency Partner Data and Other References.
- **Judging criteria:** Impact, Creativity, Validity, Relevance, Presentation (2026 Judging and Awards Guide).
- **Eligibility:** all team members confirmed at the same Local Event; all required fields complete and in English; no images, video, audio or likeness of anyone under 18; check "Terms and Conditions" and "Confirm All Work is Original", then **Submit for Judging**.
- **Website access:** recommended: request a FortiGuard Web Filter Classification for https://emberline-tan.vercel.app (https://www.fortiguard.com/faq/wfratingsubmit; category e.g. "Education" or "Web-based Applications"; Company Name "N/A") so judges' networks do not block it.
- **Certificate:** downloadable from the Profile after submitting; Full Name in the profile is what prints.


**Deadline: Sunday 15 November, 23:59 local time. Submission is final — no
edits after. Our target is 16:00.**

The official 2026 Project Submission Guide was published 13 Nov but the Space
Apps site was returning 503 the night before. The rules below come from the
2025 guide and judging guide, as summarized by a public prep kit that cites the
official pages, cross-checked against Space Apps' own posts. **Open the official
guide on the Project tab at 09:00 and correct anything that changed.**

Sources: [project submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/),
[judging & awards guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/),
[Space Apps checklist post](https://x.com/SpaceApps/status/1843038095727350234),
[space-apps-kit rules summary](https://github.com/PA-Andries/space-apps-kit).

## What we submit

Not "a video and a repo" exactly. It's a **project page** on spaceappschallenge.org
(Project tab on the team page) with these fields:

| # | Field | What we put |
|---|---|---|
| 1 | Project name | **Emberline** — tagline "25 years of fire. One unbroken line." |
| 2 | High-level summary | 3–4 sentences: problem, what we built, why it matters (draft below) |
| 3 | **Link to project demo** | **A 30-second video** (or ≤ 7 slides). Public. |
| 4 | **Link to final project** | Public, no login: our **deployed Vercel app**, and the public repo |
| 5 | Detailed description | What it does, how, benefits, tools/languages used |
| 6 | NASA data | FIRMS MODIS C6.1 + VIIRS 375 m archive and NRT, and how each is used |
| 7 | Partner / other data | Every other source, library and paper we used |
| 8 | **Use of AI** | Which AI tools and exactly how (see below) |
| 9 | Verification | Accept terms, confirm originality |

**Public repo:** `modularktech-hash/emberline`. All event work goes there;
Vercel deploys from it.

> **Event-boundary history: preserve it, disclose it.** Deleting, recreating or
> changing the visibility of a repository does not establish when work was done,
> and must not be used as a compliance strategy. Keep the git history accurate,
> do not rewrite it, and describe pre-event preparation and event-time work
> honestly in the README and the submission form under the applicable rules
> (wording confirmed by the owner: plan-combat E19).

Draft summary (field 2), matching what is implemented:

> Emberline turns NASA FIRMS MODIS and VIIRS records into an interactive
> historical burning-activity calendar. It estimates an Aqua-MODIS-equivalent
> record with per-country models (130 own fits, 41 on a pooled curve) and shows
> held-out performance, so users can see where the correction is reliable and
> where it is experimental: against a single training-era scale factor the
> model has higher held-out R² in 84 of 171 countries and lower mean absolute
> error in 141 of 171. Analysts can compare seasons, inspect unusual months and
> download traceable results. The comparable record covers 2003–2025; the recent
> globe is a separate, uncorrected NOAA-20/21 view. Orbital drift since 2022 is
> measured and shown, not corrected. Claims are regional, not global.

## The demo is 30 SECONDS. Not three minutes.

Over the limit = **ineligible for global judging.** This is the single easiest
way to throw away a win. Hard rules:

- **≤ 30 seconds** video, OR **≤ 7 slides** including the title slide.
- Hosted publicly (YouTube unlisted, Drive "anyone with link", etc.). Test the
  link in a private browser window, logged out.
- English, or English subtitles.
- No NASA logos, flags or mission insignia anywhere.
- If any frame or voice is AI-generated, it must carry a visible
  "AI-generated" watermark. **Simplest: use real screen recordings and your own
  voices — then nothing needs watermarking.**

### The 30-second script (official beat structure)

| Time | Beat | What's on screen | Words (roughly) |
|---|---|---|---|
| 0:00–0:02 | Team | Team name | "Team Modulark." |
| 0:02–0:05 | Challenge | Raw count chart, 2012 jump | "Fire records jump in 2012. Fires didn't — the satellite changed." |
| 0:05–0:10 | Title + tagline | App home page | "Emberline: 25 years of fire. One unbroken line." |
| 0:10–0:20 | How it works + data | Click the toggle; jump shrinks; held-out scores | "Using NASA FIRMS data we model what Aqua MODIS would have seen, and show where that works and where it doesn't." |
| 0:20–0:30 | Impact | Pick an area, calendar, CSV download | "Pick an area, see its fire seasons from 2003 to 2025, compare years, download the data." |

Record it the moment the demo works on Sunday — not at 16:30.

The **3-minute** version in `gameplan.md` is for a live pitch to local judges,
if your event has one. Keep both.

## Use of AI — declare it plainly

AI tools are allowed and must be declared. Judges weigh originality, intent and
execution; heavy declared use is fine. Draft:

> Shishir Bhat and Ridhan Teli have worked on this problem for about a year. Every scientific choice — the method, what to fit, the validation design and how to interpret the results — was made by the team. We used Claude, by Anthropic, through Claude Code to build it under our direction: during the event it wrote the code, ran the data pipeline and the fit we specified, tested the results and drafted documentation; before the event it also assisted with literature research and planning. Before the event we prepared planning and research documents, verified data schemas, the FIRMS ingest package and download scripts, and an empty app scaffold; these were imported into this repository in its first commit at the start of the event. The harmonization, the fit, the validation and the web app were built during the event, 14–15 Nov, as the git history shows. No AI-generated images, video or audio are used.

Facts confirmed by the owner (plan-combat E19). Same wording as the README and the About page.

## Which award to aim at — this changes the pitch

There are 10 global awards. The one that fits us best is one we hadn't named:

| Award | Rewards | Fit |
|---|---|---|
| **Best Use of Science** | "Most valid, effective use of the scientific method" | **Strongest.** Held-out validation, null controls, measured orbital drift, honest limits. This is exactly what we have that others don't. |
| Best Use of Data | Making space data more accessible or using it in a unique way | Strong. Keyless, static, downloadable harmonized record, 2003–2025. |
| Galactic Impact | Most potential to improve life on Earth | Good. Fire managers and responders. |
| Best Use of Technology | Most innovative use of technology | Weaker. Static Parquet range reads is neat, not innovative enough alone. |

Judges score five criteria with equal attention: **Influence, Creativity,
Validity, Relevance, Presentation.** Our edge is **Validity** — so the demo and
project page must *show* the validation, not just mention it.

Path to a global award: local judges pick teams to advance → global judges pick
finalists (announced December) → executive committee picks the 10 winners
(January). The project page and the 30-second video are what global judges see.
**There is no live pitch at global level.** The page and video carry everything.

## License

Original content must be under an OSI-approved open source license. The public
repo is MIT. Every third-party source must be credited (field 7).

## Final checklist — Sunday, before submitting

- [ ] Video ≤ 30 s. Timed. Public link opens logged-out.
- [ ] English or English subtitles.
- [ ] No NASA logos anywhere (video, app, README).
- [ ] Deployed app URL opens logged-out on a phone.
- [ ] Public repo has all code, README with real numbers, MIT license.
- [ ] Every number in the README / app / video comes from our own fit.
- [x] Pre-event work and event-time work described accurately in README and form; history not rewritten (E19).
- [ ] No claim of orbit-drift correction, of comparing today with history, or of global value.
- [ ] All 9 fields filled, in English.
- [ ] Use of AI field filled honestly.
- [ ] Every data source, library and paper credited.
- [ ] Both team members registered at the same local event.
- [ ] Submitted by 16:00, with time to spare.
