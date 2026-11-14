# The official challenge statement

Released by NASA on the challenge Resources page. Reproduced here so the
requirements are in the repository, next to the plan that answers them.
Source: <https://www.earthdata.nasa.gov/>

> Understanding how burning activity is distributed across our planet over
> time, including wildfires and agricultural burns intense enough to be
> detected by satellite sensors, enables us to anticipate critical periods,
> guide monitoring efforts, and improve fire response. Satellites have tracked
> active fire hotspots for more than two decades, but the record is split
> across sensors whose data cannot be compared directly, leaving fire managers
> without a consistent picture of when and where burning has occurred. Your
> challenge is to build a web application that harmonizes these records into a
> burning activity calendar based on active fire hotspots, enabling early
> warning and emergency responders, scientists, and land managers to examine
> historical fire patterns, unusual conditions, and critical periods within a
> selected area of interest.

## Requirements extracted

Each row is something a judge can check. The last column points at where we
answer it.

| # | Requirement | Source wording | Where we answer it |
|---|---|---|---|
| R1 | Harmonize MODIS + VIIRS into one comparable series | "harmonizes these records" | Tier 0–1, `docs/science.md` |
| R2 | A burning activity calendar | "burning activity calendar based on active fire hotspots" | View A |
| R3 | Show **number of hotspots** from early 2000s to present | "showing the number of hotspots detected from the early 2000s to the present" | View A — **see "Counts vs energy" below** |
| R4 | Which **month and years** had the highest activity | "which month and years had the highest fire activity" | View A, month × year grid |
| R5 | Current month vs **historical median** | "compare the burning activity of the current month against the historical median" | View B |
| R6 | Historical patterns, unusual conditions, critical periods | "examine historical fire patterns, unusual conditions, and critical periods" | Views A, B, C |
| R7 | User selects an **area of interest** | "within a selected area of interest" | AOI picker |
| R8 | User selects a **specific date range** | "select a region and a specific date range" | AOI picker + date range |
| R9 | **Downloadable CSV** of hotspots from a search | "A downloadable CSV File of hot spots detected during a search" | **New — see below** |
| R10 | **Accessible colour ramps** | "Consider using accessible color ramps" (stated twice) | Design constraint |
| R11 | Draw AOI on a map **or enter lat/lon** | "a map where users can draw the area of interest, or an option to enter latitude and longitude" | AOI picker |
| R12 | Download analytics and visualizations | "download analytics and visualizations of fire activity" | Export |

Two phases are named explicitly:

> The first is MODIS and VIIRS hotspot harmonization, so that by the end of
> that phase the sensor of origin no longer matters and the patterns, trends,
> and anomalies become the focus.
>
> The second involves developing a web application that takes harmonized
> hotspot data as input.

That ordering matches our Tier 0 / Tier 1 split. Good.

## What the statement changes about our plan

Five things. Read all of them before building.

### 1. Counts vs energy — resolve this, don't dodge it

**The tension.** Our method says "do not harmonize counts, harmonize energy."
The statement asks, twice, for a calendar of **the number of hotspots**. A
judge reading R3 literally wants a count.

**The resolution, and it is a strength.** The detection-probability model
produces harmonized counts directly. For each VIIRS detection *i* in a cell,
P(MODIS would have detected it) comes out of the fitted curve. Then:

```
harmonized_hotspot_count = Σ P_i
```

That is the **expected number of hotspots a MODIS-class sensor would have
recorded**, which is exactly the quantity that is comparable back to 2000. The
energy work is how we get an honest count, not a substitute for one.

So the calendar shows counts, as asked. We additionally carry harmonized FRP
sum as a secondary measure, because energy is the more physical quantity and
the validation is cleaner on it. **Lead with the count. Keep the energy.**

Say it this way out loud: *"NASA asked for a count of hotspots. A raw count
isn't comparable across the sensor break, so we model which fires MODIS would
have seen, and report that count. Same question, answer that survives the
boundary."*

### 2. The calendar is month × year, not day-of-year × year

R4 asks "which **month** and years." That is a 12 × ~26 grid — about 310 cells.
Our briefing assumed day-of-year × year, a 365 × 26 grid of ~9,500 cells.

**Decision: month × year is the primary calendar.** It answers R4 directly, is
legible on a phone, and is far less data. Day-of-year stays available as a
drill-down for a selected year, and as the resolution the climatology is
computed at.

This also simplifies the precomputed tables a lot.

### 3. Median, not percentile band, as the headline

R5 names the **historical median** specifically. Our plan led with 90th-percentile
bands. Keep the bands — they are what makes "unusual" meaningful — but the
headline number on View B is *this month vs the median for this month*, phrased
in plain language, because that is what was asked for.

### 4. CSV export is a requirement, not a nice-to-have

R9 and R12 both ask for downloads. This was nowhere in our tier list. It is
cheap (the data is already in the browser) and it is explicitly requested, so
it goes in **Tier 0**. A judge can click it. Ship:

- hotspots for the current AOI + date range, as CSV, with a header row;
- the calendar matrix itself as CSV;
- a provenance block (AOI bounds, date range, sensors, filters, harmonization
  version, retrieval date) so a downloaded file can be traced back.

### 5. The forward-looking framing is better than ours

The statement says MODIS instruments "are approaching the end of their
operational life and are being replaced by VIIRS sensors."

That reframes the whole project. Harmonization is not archaeology on a 2012
step. It is what keeps the 25-year record usable **after MODIS is switched
off**. Every fire manager with a MODIS-based baseline needs this or their
baseline breaks.

Add to the pitch, right after the existing line:

> Nothing changed on Earth. We corrected what changed in orbit.
> MODIS is being retired — without this correction, every MODIS-era baseline
> breaks the day it goes dark.

## Audience, per the statement

Early warning and emergency responders, scientists, land managers, firefighters.
Note that **firefighters** are named and were not in our briefing. That argues
for plain language in the UI and for keeping the explainer (Tier 2, item 9)
rather than treating it as optional.

## Things the statement permits that we had worried about

- **Volcanoes, gas flares and industrial hotspots are named** as things these
  sensors detect. Our `type`-field filtering is therefore expected behaviour,
  not an unprompted extra. Worth showing in the UI as a toggle.
- **Agricultural burns are named in the first sentence** as in scope. So the
  small-fire population VIIRS sees is not noise to be discarded — it is part of
  the phenomenon. Our censoring approach must be framed carefully: we are not
  saying small fires don't matter, we are making the *record* comparable.
  Consider a "VIIRS-era full detail" mode that shows everything VIIRS sees from
  2012 on, clearly labelled as not comparable to the MODIS era.

## Not stated, so still our call

- Which specific products (MCD14ML vs the NRT feeds). The statement says
  "NASA Earthdata FIRMS hotspots" and leaves the product choice open.
- The spatial aggregation scheme (H3 is ours).
- Event clustering (DBSCAN is ours) — note the statement asks for *hotspot*
  counts, so clustered event counts are an additional view, not a replacement.
- Whether to use Supabase or static files.
