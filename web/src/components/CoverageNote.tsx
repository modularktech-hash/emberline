"use client";

import { Fragment } from "react";
import { Eyebrow } from "@/components/Figure";
import { NOT_A_FAILURE, STATUS_LABEL, UNFITTED_MEANING, coverageCounts, coverageReason, coverageSummary } from "@/lib/coverage";
import { prettyName } from "@/lib/names";
import { getCoverageStatus } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";
import type { CoverageStatusFile } from "@/lib/types";

/** coverage_status.json through the data layer; null while loading or if it cannot be read. */
export function useCoverage(): CoverageStatusFile | null {
  return useCoverageState().data;
}
export function useCoverageState() {
  return useParquet(() => getCoverageStatus(), "coverage-status");
}

/** Visible notice when coverage_status.json could not be used (instead of silently dropping the reasons). */
export function CoverageError({ state, className = "" }: { state: ReturnType<typeof useCoverageState>; className?: string }) {
  if (!state.error) return null;
  return (
    <p role="status" className={`text-xs text-[var(--text-secondary)] ${className}`}>
      Coverage reasons (coverage_status.json) are unavailable, so why a country has no fit is not shown: {state.error.message}{" "}
      <button type="button" onClick={state.retry} className="underline underline-offset-2 hover:text-[var(--ember)]">Retry</button>
    </p>
  );
}

/**
 * Why one country has no fit, from coverage_status.json: the reason-coded
 * status in plain language and the counts behind it. Renders nothing for a
 * fitted country, or when the file is unavailable.
 */
export function CoverageNote({ country, coverage, className = "" }: { country: string; coverage: CoverageStatusFile | null; className?: string }) {
  const e = coverage?.countries[country];
  if (!e || e.status === "own_fit" || e.status === "borrowed_fit") return null;
  return (
    <div data-coverage-status={e.status} className={`rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)] p-4 text-sm leading-relaxed text-[var(--text-secondary)] ${className}`}>
      <Eyebrow>Why there is no fit · {STATUS_LABEL[e.status]}</Eyebrow>
      <p className="mt-2 text-[var(--text-primary)]">{prettyName(country)}: {coverageReason(e)}</p>
      <p className="mt-1 text-xs">
        {e.has_raw_calendar ? "Its raw record is shown, uncorrected (it keeps the 2012 sensor step)." : "It has no calendar at all in the processed record."}
        {" "}{NOT_A_FAILURE}
      </p>
      {e.has_raw_calendar && <p className="mt-2 text-xs text-[var(--text-primary)]" data-testid="unfitted-meaning">{UNFITTED_MEANING}</p>}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-[var(--text-primary)]">The counts behind this</summary>
        <dl className="tabular mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          {coverageCounts(e).map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd className="text-right text-[var(--text-primary)]">{v}</dd></Fragment>))}
        </dl>
        <p className="mt-2 text-[var(--text-muted)]">From coverage_status.json, fit {coverage?.fit_version}. Detections are daytime vegetation fires; grid cells are H3 resolution 5.</p>
      </details>
    </div>
  );
}

/** One line of coverage counts, every number derived from coverage_status.json. */
export function CoverageSummaryText({ coverage }: { coverage: CoverageStatusFile }) {
  const s = coverageSummary(coverage);
  const n = (v: number) => <span className="tabular text-[var(--text-primary)]">{v}</span>;
  return (
    <>
      {n(s.own)} countries with their own fit, {n(s.borrowed)} on the pooled fit, {n(s.unfitted)} without a fit:{" "}
      {n(s.rawOnly)} with a raw calendar only (uncorrected) and {n(s.noCalendar)} with no calendar at all. Why no fit:{" "}
      {s.reasons.map((r, i) => <span key={r.status}>{i ? ", " : ""}{n(r.n)} {STATUS_LABEL[r.status]}</span>)} — data-sufficiency outcomes, not processing failures
    </>
  );
}
