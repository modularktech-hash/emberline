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
