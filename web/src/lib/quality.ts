import type { CountryFit, Params } from "./types";
import { fitFlags } from "./fitFlags";
import { fmtInt, fmtNum, fmtPct, fmtR2 } from "./format";

/**
 * Quality category of one country's published fit. Uses only the existing
 * fitFlags rules (which mirror scripts/report_global.py, docs/results.md
 * "Suspicious results"); no new thresholds:
 * - "experimental": the first rule fired -- held-out R² negative or undefined.
 * - "flagged": any other rule fired.
 * - "unflagged": no rule fired. Not a claim of high accuracy.
 */
export type QualityLevel = "experimental" | "flagged" | "unflagged";

export interface FitQuality {
  level: QualityLevel;
  label: string;
  flags: string[];
  origin: string;
  /** One or two plain sentences on what the held-out numbers mean. */
  interpretation: string;
}

export const QUALITY_LABEL: Record<QualityLevel, string> = {
  experimental: "Experimental correction — poor agreement at cell-month scale",
  flagged: "Check this fit — flagged by the published suspicious-result rules",
  unflagged: "No suspicious-result flags",
};

const ok = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

export function fitOrigin(fit: CountryFit): string {
  return fit.fit_source === "pooled" ? "borrowed curve (pooled fit)" : "own fit";
}

export function fitQuality(fit: CountryFit): FitQuality {
  const flags = fitFlags(fit);
  const r2 = fit.validation_test.model.r2;
  const bias = fit.validation_test.model.bias_pct;
  const level: QualityLevel = !ok(r2) || r2 < 0 ? "experimental" : flags.length ? "flagged" : "unflagged";
  const biasNote = ok(bias) ? ` The held-out country total is off by ${fmtPct(bias)} (bias), a separate, country-wide check.` : "";
  const interpretation = !ok(r2)
    ? `Held-out R² is undefined, so agreement at cell-month scale is unknown.${biasNote}`
    : r2 < 0
      ? `At cell-month scale this correction's predictions sit further from observed Aqua than simply predicting the average held-out cell-month would (R² ${fmtR2(r2)}). Negative R² is not “negative accuracy”: it compares squared errors with that average.${biasNote}`
      : `At cell-month scale the predictions track observed Aqua better than the held-out average does (R² ${fmtR2(r2)}; 1 is perfect). R² is not a percentage of fires detected correctly.${biasNote}`;
  return { level, label: QUALITY_LABEL[level], flags, origin: fitOrigin(fit), interpretation };
}

/** "held-out 2019–2021, H3 res-5 cell × month (~250 km²)" from the published params. */
export function evalPeriod(params: Pick<Params, "test_years">): string {
  return `held-out ${params.test_years[0]}–${params.test_years[1]}, H3 res-5 cell × month (~250 km²), vs observed Aqua MODIS`;
}

/** Header lines for a CSV export of one country. */
export function qualityCsvHeader(fit: CountryFit, params: Pick<Params, "test_years">): Record<string, string> {
  const q = fitQuality(fit);
  const m = fit.validation_test.model;
  return {
    fit_quality: q.label + (q.flags.length ? ` (${q.flags.join("; ")})` : ""),
    fit_origin: q.origin,
    fit_evaluation: `${evalPeriod(params)}: R2 ${fmtR2(m.r2)}, bias ${fmtPct(m.bias_pct)}, RMSE ${fmtNum(m.rmse, 2)} detections per cell-month, n ${fmtInt(m.n_cell_months)} cell-months`,
  };
}
