"use client";

import { useState } from "react";
import { AoiPicker } from "@/components/AoiPicker";
import { useAoi } from "@/components/AoiProvider";
import { CalendarHeatmap } from "@/components/CalendarHeatmap";
import { QueryBoundary } from "@/components/QueryBoundary";
import { SeriesToggle } from "@/components/SeriesToggle";
import { fetchCalendar } from "@/lib/queries";
import { useRpc } from "@/lib/useRpc";
import type { CalendarDay, Series } from "@/lib/types";

/** View A -- the burning activity calendar. */
export default function CalendarPage() {
  const { aoi } = useAoi();
  const [series, setSeries] = useState<Series>("harmonized");

  const state = useRpc<CalendarDay>(
    () => fetchCalendar(aoi.cells),
    aoi.cells.join(","),
  );

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Burning activity calendar
        </h1>
        <p className="mt-1 max-w-prose text-sm text-[var(--text-secondary)]">
          Twenty-five years of active fire detections for one area, years down and
          day of year across. Switch to the raw series to see the step change that
          appears in 2012 when VIIRS joins the record — that step is the sensor
          getting better, not the fires getting worse.
        </p>
      </section>

      <AoiPicker />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            {aoi.name}
          </h2>
          <SeriesToggle value={series} onChange={setSeries} />
        </div>

        <QueryBoundary
          state={state}
          emptyTitle="No detections recorded for this area"
          emptyBody={
            <p>
              Either the cell-day table has not been loaded for this region yet, or
              there genuinely were no vegetation fires here above the confidence
              threshold.
            </p>
          }
        >
          {(rows) => <CalendarHeatmap days={rows} series={series} />}
        </QueryBoundary>
      </section>
    </div>
  );
}
