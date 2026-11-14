# Design pass 3 — brief from the owner (14 Nov, ~21:00 UTC)

Source: an external design review the owner pasted, plus a logo direction
(`docs/figures/logo-ref-favicon.png`, `docs/figures/logo-ref-wordmark.png`) and
a request for named page transitions. **Keep the identity**: cream canvas,
peach/blush glows, ember accent, floating nav, rounded panels, dot-matrix
readouts. Make it more disciplined and easier to use. Labels say
"detections", never just "fires". Every number still comes from our files.

## Checklist (tick here in the same commit as the work)

### P0 — owner's explicit asks
- [ ] T1 Named page transition: curtain shows the destination ("EXPLORE" /
      "Calendar Explorer") with a dot progress row, then lifts. ~1.1–1.4 s,
      transform/opacity only, 2.5 s safety lift, none on back/forward, quick
      fade under reduced motion / low-power. Reconcile with `template.tsx`.
- [ ] L1 Logo "ember + line": rounded charcoal stroke, clear gap, one ember
      dot slightly larger than the stroke; plain EMBERLINE wordmark. Variants:
      mark+wordmark (nav, footer, OG image), mark only (favicon/`icon.svg`,
      apple icon), single-colour. Must read at 16/24/32 px.

### P1 — "First" priorities from the review
- [ ] D1 Two page templates: story pages (Home, About) keep big heroes; working
      pages (Explorer, Compare, Seasons, Trends, Lab, Data, Method tables) get a
      compact header (36–44 px desktop, 28–32 px mobile) and controls at once.
- [ ] D2 Explorer: one toolbar (Country / Draw area switch · years ·
      Raw/Harmonized · Download CSV); calendar ABOVE the annual chart; stable
      selected-cell detail strip ("Jul 2023 · Canada · Raw detections ·
      183,034") by hover, tap and keyboard; remove the fake browser address
      strip; version id into a provenance disclosure; fit status by the selector.
- [ ] D3 Raw/harmonized, units and snapshot status always explicit; switching
      mode keeps region, years and selected cell. Live count says
      "near-real-time, raw detections" with its timestamp beside it.
- [ ] D4 Mobile: readable chart labels (fewer ticks), sticky first column +
      visible scroll cue on Data/Method tables, ~44 px touch targets.

### P2 — "Next"
- [ ] D5 Nav: show the active page inside open dropdowns; page labels
      "Seasonal anomalies" (Seasons) and "Method & validation"; replace the
      Explorer's own "Open the calendar" CTA with a contextual one.
- [ ] D6 Compare: swap button; controls grouped Record / Scale; explain
      "Index, mean = 100" inline; stacked calendars on mobile, shared scale.
- [ ] D7 Seasons: takeaway sentence above the plot (computed); labels Below /
      Within / Above typical range / Above 90th percentile, with markers.
- [ ] D8 Trends: definitions at each metric label; define "sensor share" and
      flag when the ratio is unstable (<0 or >100%).
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
