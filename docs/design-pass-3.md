# Design pass 3 — brief from the owner (14 Nov, ~21:00 UTC)

Source: an external design review the owner pasted, plus a logo direction
(`docs/figures/logo-ref-favicon.png`, `docs/figures/logo-ref-wordmark.png`) and
a request for named page transitions. **Keep the identity**: cream canvas,
peach/blush glows, ember accent, floating nav, rounded panels, dot-matrix
readouts. Make it more disciplined and easier to use. Labels say
"detections", never just "fires". Every number still comes from our files.

## Checklist (tick here in the same commit as the work)

### P0 — owner's explicit asks
- [x] T1 Named page transition: curtain shows the destination ("EXPLORE" /
      "Calendar Explorer") with a dot progress row, then lifts. ~1.1–1.4 s,
      transform/opacity only, 2.5 s safety lift, none on back/forward, quick
      fade under reduced motion / low-power. Reconcile with `template.tsx`.
      - Done: `components/RouteTransition.tsx`. Under reduced motion or low-power
        mode there is no curtain at all (instant navigation). Low-power is auto
        on <= 4-CPU devices, so many phones get none; `?perf=high` forces it.
        Explorer's commit can be slow on software GL: the 2.5 s safety lift was
        seen once in the container.
- [x] L1 Logo "ember + line": rounded charcoal stroke, clear gap, one ember
      dot slightly larger than the stroke; plain EMBERLINE wordmark. Variants:
      mark+wordmark (nav, footer, OG image), mark only (favicon/`icon.svg`,
      apple icon), single-colour. Must read at 16/24/32 px.
      - Done: `components/Logo.tsx` (`LogoMark`, `Logo`, `mono` prop), `app/icon.svg`,
        `app/favicon.ico` (16/24/32/48, rendered from icon.svg), `app/apple-icon.tsx`,
        OG image. Gap widened in the favicon so the dot stays separate at 16 px.

### P1 — "First" priorities from the review
- [x] D1 Two page templates: story pages (Home, About) keep big heroes; working
      pages (Explorer, Compare, Seasons, Trends, Lab, Data, Method tables) get a
      compact header (36–44 px desktop, 28–32 px mobile) and controls at once.
      - Done: Compact header (`t-tool`, 28 px at 375 → ~42 px at 1440) on Explorer, Compare, Seasons, Trends, Lab, Data, Method; Home/About/Globe/Satellites keep the big hero.
- [x] D2 Explorer: one toolbar (Country / Draw area switch · years ·
      Raw/Harmonized · Download CSV); calendar ABOVE the annual chart; stable
      selected-cell detail strip ("Jul 2023 · Canada · Raw detections ·
      183,034") by hover, tap and keyboard; remove the fake browser address
      strip; version id into a provenance disclosure; fit status by the selector.
      - Done: One toolbar (Country/Draw area · picker + fit status · years · Raw/Harmonized · CSV); calendar above the chart; selected-month strip by hover, tap and Enter; address strip removed; fit version, files, source and the reason-coded coverage in a Provenance disclosure; fit-quality card moved below the chart.
- [x] D3 Raw/harmonized, units and snapshot status always explicit; switching
      mode keeps region, years and selected cell. Live count says
      "near-real-time, raw detections" with its timestamp beside it.
      - Done: Mode strip above the calendar names the series and unit; region, years and the selected month survive a mode switch; home live count reads "near-real-time, raw detections in the 24 h to <fetch time>".
- [x] D4 Mobile: readable chart labels (fewer ticks), sticky first column +
      visible scroll cue on Data/Method tables, ~44 px touch targets.
      - Done: `lib/useChartScale.ts` keeps SVG chart labels at ~11 px on phones and thins ticks (Explorer annual, Seasons, Compare, Trends); ScrollBox pins the first column and shows a "scroll sideways" cue + edge fade; toolbar/segmented/select/field controls are 44 px on phones.

### P2 — "Next"
- [x] D5 Nav: show the active page inside open dropdowns; page labels
      "Seasonal anomalies" (Seasons) and "Method & validation"; replace the
      Explorer's own "Open the calendar" CTA with a contextual one.
      - Done: Active page marked "you are here" (aria-current) in dropdowns and the mobile menu; "Seasonal anomalies", "Method & validation"; nav CTA is contextual (Explorer → "How it is corrected", Method → "Try it on a country").
- [x] D6 Compare: swap button; controls grouped Record / Scale; explain
      "Index, mean = 100" inline; stacked calendars on mobile, shared scale.
      - Done: Swap button; controls grouped Record / Scale; "Index, mean = 100" explained inline; calendars stack below lg and share one colour scale (as before).
- [x] D7 Seasons: takeaway sentence above the plot (computed); labels Below /
      Within / Above typical range / Above 90th percentile, with markers.
      - Done: Computed takeaway above the plot (e.g. Canada 2023: 100,295 harmonized detections, ×6.84 the median year, checked against the parquet); Below / Within / Above typical range / Above 90th percentile with ▽ ○ △ ▲ markers in table and plot.
- [x] D8 Trends: definitions at each metric label; define "sensor share" and
      flag when the ratio is unstable (<0 or >100%).
      - Done: Definition under each metric card; sensor share defined (1 − harmonized ÷ raw trend) and marked "unstable" outside 0–100%.
- [ ] D9 Globe: "Satellite positions — simulated" with source timestamp; speed
      control beside Pause; hottest-cell row focuses the globe.
- [ ] D10 Method: short evidence summary (train/test years, reference sensor,
      own vs pooled counts, median held-out R²) before the table; weak fits
      easy to find.
- [ ] D11 Lab: section navigator for the six tools; same structure per tool.
- [ ] D12 Home: check the numbered story order (07 appears before 06);
      "Skip to tools"; quieter, pausable ticker; three task paths (Explore a
      country · Compare two regions · Understand the correction).
- [ ] D13 Footer compact on tool pages; no unresolved "…" (named loading state).

### P3 — "Then" (only if time remains)
- [ ] D14 Calm the gradient behind dense content; fewer, quieter shadows on
      small controls; one dot-matrix rule set (size/spacing ratio, reserved width).
