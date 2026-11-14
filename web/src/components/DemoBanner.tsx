"use client";

import { DEMO_DATA_ENABLED } from "@/lib/fixtures";

/**
 * Says, on every page, that the numbers on screen are not measurements.
 *
 * Synthetic data that is not labelled as synthetic is the fastest way to lose
 * a science project's credibility, so the label is not dismissible and not
 * subtle.
 */
export function DemoBanner() {
  if (!DEMO_DATA_ENABLED) return null;

  return (
    <div
      role="status"
      className="border-b border-[var(--status-critical)] bg-[var(--status-critical)] px-4 py-2 text-center text-xs font-medium text-white sm:px-6"
    >
      Synthetic sample data — NEXT_PUBLIC_DEMO_DATA is on. Nothing on this screen
      is a measurement. Unset it to query the real record.
    </div>
  );
}
