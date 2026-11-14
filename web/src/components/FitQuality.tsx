"use client";

import { Eyebrow } from "@/components/Figure";
import { fmtInt, fmtNum, fmtPct, fmtR2 } from "@/lib/format";
import { evalPeriod, fitQuality, type QualityLevel } from "@/lib/quality";
import type { CountryFit, Params } from "@/lib/types";

const TONE: Record<QualityLevel, string> = {
  experimental: "border-[var(--ember)] bg-[var(--ember-soft)] text-[var(--ember)]",
  flagged: "border-[var(--ember)] text-[var(--ember)]",
  unflagged: "border-[var(--hairline)] text-[var(--text-secondary)]",
};

/** The quality label alone, for compact places (Compare, Seasons). */
export function FitQualityTag({ fit, className = "" }: { fit: CountryFit; className?: string }) {
  const q = fitQuality(fit);
  return (
    <span data-fit-quality={q.level} title={q.flags.length ? `Flags: ${q.flags.join("; ")}` : undefined}
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-snug ${TONE[q.level]} ${className}`}>
      {q.label}
    </span>
  );
}

/**
 * Compact quality card for one country's fit: origin, evaluation period and
 * unit, held-out R², bias, RMSE, sample size and a plain reading. Every number
 * is read from params_global.json; the category comes from fitFlags.
 */
export function FitQualityCard({ fit, params, className = "" }: { fit: CountryFit; params: Pick<Params, "test_years">; className?: string }) {
  const q = fitQuality(fit);
  const m = fit.validation_test.model;
  const ci = fit.validation_test_ci95;
  const rows: Array<[string, string]> = [
    ["Fit origin", q.origin],
    ["Evaluated on", evalPeriod(params)],
    ["Held-out R²", `${fmtR2(m.r2)} (95% CI ${fmtR2(ci.r2[0])} to ${fmtR2(ci.r2[1])})`],
    ["Bias (country total)", `${fmtPct(m.bias_pct)} (95% CI ${fmtPct(ci.bias_pct[0])} to ${fmtPct(ci.bias_pct[1])})`],
    ["RMSE", `${fmtNum(m.rmse, 2)} detections per cell-month`],
    ["Sample size", `${fmtInt(m.n_cell_months)} cell-months`],
    ["Best single FRP cut-off, R²", fmtR2(fit.validation_test.threshold.r2)],
  ];
  return (
    <section data-testid="fit-quality-card" data-fit-quality={q.level} aria-label="Fit quality" className={`rounded-2xl border p-4 text-sm ${q.level === "unflagged" ? "border-[var(--hairline)]" : "border-[var(--ember)]"} bg-[var(--surface-1)] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>Fit quality</Eyebrow>
        <FitQualityTag fit={fit} />
      </div>
      <dl className="tabular mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[var(--text-muted)]">{k}</dt>
            <dd className="text-[var(--text-primary)]">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">{q.interpretation}</p>
      {q.flags.length > 0 && <p className="mt-1 text-xs leading-relaxed text-[var(--ember)]">Flags (rules in docs/results.md): {q.flags.join("; ")}. The fit is shown, not hidden; the raw record stays one click away.</p>}
    </section>
  );
}
