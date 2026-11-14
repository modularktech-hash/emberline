"use client";

import { AnomalyChart } from "@/components/AnomalyChart";
import { AoiPicker } from "@/components/AoiPicker";
import { useAoi } from "@/components/AoiProvider";
import { QueryBoundary } from "@/components/QueryBoundary";
import { fetchAnomaly } from "@/lib/queries";
import { useRpc } from "@/lib/useRpc";
import type { AnomalyDay } from "@/lib/types";

/** View B -- unusual conditions and critical periods. */
export default function AnomalyPage() {
  const { aoi } = useAoi();

  const state = useRpc<AnomalyDay>(
    () => fetchAnomaly(aoi.cells),
    aoi.cells.join(","),
  );

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Unusual conditions
        </h1>
        <p className="mt-1 max-w-prose text-sm text-[var(--text-secondary)]">
          Observed activity against what is normal for the same calendar day,
          derived from the harmonized record. Comparing each day against its own
          day-of-year distribution is what separates &ldquo;a lot of fire&rdquo;
          from &ldquo;more fire than this date usually brings&rdquo; — in a
          strongly seasonal landscape those are rarely the same thing.
        </p>
      </section>

      <AoiPicker />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{aoi.name}</h2>
        <QueryBoundary
          state={state}
          emptyTitle="No climatology available for this area"
          emptyBody={
            <p>
              Anomalies need a day-of-year baseline. Build one with{" "}
              <code className="tabular">firms-ingest climatology</code> and load it
              into <code className="tabular">fire_climatology</code>.
            </p>
          }
        >
          {(rows) => <AnomalyChart days={rows} />}
        </QueryBoundary>
      </section>
    </div>
  );
}
