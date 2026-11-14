"use client";

import { useMemo } from "react";
import { AoiPicker } from "@/components/AoiPicker";
import { useAoi } from "@/components/AoiProvider";
import { QueryBoundary } from "@/components/QueryBoundary";
import { fetchDetections } from "@/lib/queries";
import { formatMw } from "@/lib/scale";
import { useRpc } from "@/lib/useRpc";
import type { Detection } from "@/lib/types";

/**
 * View C -- the live layer.
 *
 * Reads the same `fire_detection` table the demo AOIs use. The offline job
 * that appends FIRMS near-real-time detections into it runs on a schedule;
 * until it does, this view honestly reports an empty window rather than
 * inventing recent activity.
 */
export default function LivePage() {
  const { aoi } = useAoi();

  const { from, to } = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    return { from: weekAgo.toISOString(), to: now.toISOString() };
  }, []);

  const state = useRpc<Detection>(
    () => fetchDetections(aoi.bbox, from, to),
    `${aoi.bbox.join(",")}|${from}|${to}`,
  );

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Last 7 days
        </h1>
        <p className="mt-1 max-w-prose text-sm text-[var(--text-secondary)]">
          Near-real-time detections for the selected area, highest energy first.
          These are raw hotspots, not harmonized: the correction is fitted on
          aggregated cells over a season, so applying it to a single afternoon&rsquo;s
          detections would imply a precision it does not have.
        </p>
      </section>

      <AoiPicker />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{aoi.name}</h2>
        <QueryBoundary
          state={state}
          emptyTitle="No detections in the last 7 days"
          emptyBody={
            <p>
              Nothing has been detected in this area in the past week, or the
              near-real-time ingest has not run. Fetch a window with{" "}
              <code className="tabular">firms-ingest nrt</code>.
            </p>
          }
        >
          {(rows) => <DetectionTable rows={rows} />}
        </QueryBoundary>
      </section>
    </div>
  );
}

function DetectionTable({ rows }: { rows: Detection[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)]">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Near-real-time fire detections for the selected area
        </caption>
        <thead>
          <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
            <th scope="col" className="px-3 py-2 font-medium">When</th>
            <th scope="col" className="px-3 py-2 font-medium">Platform</th>
            <th scope="col" className="px-3 py-2 font-medium">Position</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">FRP</th>
            <th scope="col" className="px-3 py-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((row, i) => (
            <tr
              key={`${row.acq_ts}-${row.lat}-${row.lon}-${i}`}
              className="border-b border-[var(--gridline)] last:border-0"
            >
              <td className="tabular px-3 py-1.5 text-[var(--text-secondary)]">
                {new Date(row.acq_ts).toISOString().replace("T", " ").slice(0, 16)}
              </td>
              <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                {row.platform}
              </td>
              <td className="tabular px-3 py-1.5 text-[var(--text-muted)]">
                {row.lat.toFixed(3)}, {row.lon.toFixed(3)}
              </td>
              <td className="tabular px-3 py-1.5 text-right text-[var(--text-primary)]">
                {formatMw(row.frp_mw)}
              </td>
              <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                {row.confidence_class ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 ? (
        <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
          Showing the 200 highest-energy of {rows.length} detections.
        </p>
      ) : null}
    </div>
  );
}
