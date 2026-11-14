"use client";

import { QueryBoundary } from "@/components/QueryBoundary";
import { fetchHarmonizationReport } from "@/lib/queries";
import { useRpc } from "@/lib/useRpc";
import type { HarmonizationRow } from "@/lib/types";

/**
 * The validation table.
 *
 * Putting the fit statistics in the application, rather than only in the
 * write-up, is the difference between claiming the record is harmonized and
 * showing that it is. If this page is empty, no correction has been published
 * and the calendar's harmonized series is falling back to the raw one -- which
 * the page says outright rather than leaving the reader to assume otherwise.
 */
export default function MethodPage() {
  const state = useRpc<HarmonizationRow>(() => fetchHarmonizationReport(), "report");

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          How the record is harmonized
        </h1>
        <div className="mt-2 max-w-prose space-y-3 text-sm text-[var(--text-secondary)]">
          <p>
            MODIS resolves fires at about 1 km; VIIRS resolves them at 375 m and
            routinely detects small agricultural and grass fires that MODIS cannot
            see at all. Counting detections across that boundary therefore measures
            satellite capability, not burning.
          </p>
          <p>
            So the record is harmonized on energy rather than counts. Fire Radiative
            Power means the same thing whichever instrument measured it. VIIRS
            detections below a fitted FRP threshold are discarded, which degrades
            VIIRS to MODIS-equivalent sensitivity; the threshold is fitted per land
            cover class, because the size at which a fire becomes detectable differs
            between boreal forest and cropland. The correction is then fitted on the
            overlap period, when Aqua and Suomi-NPP were observing the same fires
            from nearly the same local overpass time.
          </p>
          <p>
            Each row below carries the statistics that justify it. A correction
            without an R², a bias and an RMSE is not a result.
          </p>
        </div>
      </section>

      <QueryBoundary
        state={state}
        emptyTitle="No correction has been published yet"
        emptyBody={
          <p>
            Until a fit is loaded into{" "}
            <code className="tabular">harmonization_factor</code> and selected in{" "}
            <code className="tabular">harmonization_active</code>, the harmonized
            series falls back to the raw sums and every cell is flagged uncorrected.
          </p>
        }
      >
        {(rows) => <ReportTable rows={rows} />}
      </QueryBoundary>
    </div>
  );
}

function ReportTable({ rows }: { rows: HarmonizationRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)]">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Per-biome censoring thresholds, correction factors and validation statistics
        </caption>
        <thead>
          <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
            <th scope="col" className="px-3 py-2 font-medium">Land cover</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">FRP cut</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Slope</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">R²</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Holdout R²</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Bias</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">RMSE</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">n cells</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.fit_version}-${row.landcover_class}`}
              className="border-b border-[var(--gridline)] last:border-0"
            >
              <td className="px-3 py-1.5 text-[var(--text-primary)]">
                {row.landcover_name}
                {row.is_active ? null : (
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    ({row.fit_version}, inactive)
                  </span>
                )}
              </td>
              <td className="tabular px-3 py-1.5 text-right">
                {row.frp_threshold_mw.toFixed(1)} MW
              </td>
              <td className="tabular px-3 py-1.5 text-right">{row.slope.toFixed(3)}</td>
              <td className="tabular px-3 py-1.5 text-right">{row.r2.toFixed(3)}</td>
              <td className="tabular px-3 py-1.5 text-right">
                {row.holdout_r2 === null ? "—" : row.holdout_r2.toFixed(3)}
              </td>
              <td className="tabular px-3 py-1.5 text-right">{row.bias.toFixed(2)}</td>
              <td className="tabular px-3 py-1.5 text-right">{row.rmse.toFixed(2)}</td>
              <td className="tabular px-3 py-1.5 text-right">
                {row.n_cells.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
