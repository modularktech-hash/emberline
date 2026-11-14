import type { CountryFit } from "./types";
import { fmtNum, fmtPct, fmtR2, fmtRatio } from "./format";

/**
 * Why a country's fit looks suspicious, in plain words: the same rules as
 * scripts/report_global.py (docs/results.md, "Suspicious results"). Flags,
 * not removals -- the fit stays published and shown. Empty when none apply.
 */
export function fitFlags(fit: CountryFit): string[] {
  const out: string[] = [];
  const ok = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
  const t = fit.validation_test.model;
  if (!ok(t.r2)) out.push("held-out R² undefined");
  else if (t.r2 < 0) out.push(`held-out R² ${fmtR2(t.r2)}`);
  const p50 = fit.frp_at_p50_mw;
  if (!ok(p50) || p50 < 1 || p50 > 100) out.push(`50% detection at ${ok(p50) ? fmtNum(p50, 1) : "n/a"} MW`);
  if (!ok(fit.kappa) || fit.kappa < 0.05 || fit.kappa > 2) out.push(`κ ${ok(fit.kappa) ? fmtNum(fit.kappa, 3) : "n/a"}`);
  const a = fit.null_control?.aqua_only_step_ratio_2012, h = fit.null_control?.harmonized_step_ratio_2012;
  if (ok(a) && ok(h) && a > 0 && h > 0) {
    if (Math.max(h / a, a / h) > 1.5) out.push(`2012 step ${fmtRatio(h)} vs Aqua alone ${fmtRatio(a)}`);
  } else out.push("2012 step undefined");
  if (ok(t.bias_pct) && Math.abs(t.bias_pct) > 50) out.push(`held-out bias ${fmtPct(t.bias_pct)}`);
  return out;
}

/**
 * Whether the curve's coefficient and FRP-at-50% intervals were estimated.
 * Pooled (borrowed) fits publish the point value twice; that is "not
 * estimated", not a zero-width interval. Files without the field (the
 * four-country fallback, all own fits) count as estimated unless pooled.
 * Held-out score intervals (validation_test_ci95) are separate and unaffected.
 */
export function coefCiEstimated(fit: CountryFit): boolean {
  return fit.coef_ci_estimated ?? fit.fit_source !== "pooled";
}

/** What to show instead of a coefficient interval for a borrowed curve. */
export const CI_NOT_ESTIMATED = "interval not estimated — curve borrowed from the pooled fit";

/** "8.9–9.3 MW" for an own fit; the not-estimated wording for a borrowed one. */
export function frpP50Interval(fit: CountryFit): string {
  if (!coefCiEstimated(fit)) return CI_NOT_ESTIMATED;
  const [lo, hi] = fit.frp_at_p50_ci95_mw;
  return `95% CI ${fmtNum(lo, 1)}–${fmtNum(hi, 1)} MW`;
}
