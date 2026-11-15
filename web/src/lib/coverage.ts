import type { CoverageEntry, CoverageStatus, CoverageStatusFile } from "./types";
import { fmtInt } from "./format";

/**
 * Plain-language reading of coverage_status.json (docs/data-contract-additions.md §2).
 * Every unfitted status is a data-sufficiency outcome traced to the fit code,
 * not a processing failure; numerical_fit_failure is reserved (0 published).
 */

/** Short label per status, for tables and pills. */
export const STATUS_LABEL: Record<CoverageStatus, string> = {
  own_fit: "own fit",
  borrowed_fit: "borrowed (pooled) fit",
  insufficient_training_observations: "no training target",
  insufficient_reference_observations: "reference window empty",
  insufficient_heldout_variation: "too little held-out variation",
  numerical_fit_failure: "numerical fit failure",
  no_observations: "no observations",
};

export const isFitted = (s: CoverageStatus) => s === "own_fit" || s === "borrowed_fit";

/** One sentence: why this country has no fit (or which fit it has), from its counts. */
export function coverageReason(e: CoverageEntry): string {
  const c = e.counts;
  switch (e.status) {
    case "own_fit":
      return "Fitted with its own detection curve.";
    case "borrowed_fit":
      return `Fewer than 5,000 Suomi-NPP training detections (${fmtInt(c.n_train_viirs)}), so it uses the curve borrowed from the pooled fit.`;
    case "insufficient_training_observations":
      return `No training target: Aqua MODIS made no detections here in 2012–2018 (Suomi-NPP made ${fmtInt(c.n_train_viirs)}, none at or above 100 MW), so there is nothing to learn the correction from.`;
    case "insufficient_reference_observations": {
      const why: string[] = [];
      if (c.n_test_aqua === 0) why.push("no Aqua detections in the held-out years 2019–2021, so the correction cannot be scored");
      if (c.n_modis_2009_2011 === 0) why.push("no MODIS detections in 2009–2011, so the 2012 sensor-change check has no “before” window");
      if (c.n_any_2012_2014 === 0) why.push("no detections at all in 2012–2014, so that check has no “after” window");
      return `A reference window is empty: ${why.length ? why.join("; ") : "see the published condition"}.`;
    }
    case "insufficient_heldout_variation":
      return `Too little held-out variation: Aqua's ${fmtInt(c.n_test_aqua)} detections in 2019–2021 fall in ${fmtInt(c.n_test_cells_with_aqua)} of ${fmtInt(c.n_test_cells)} held-out grid cells (~250 km² each), too few to estimate a score and its uncertainty.`;
    case "no_observations":
      return "No observations: neither Aqua MODIS nor Suomi-NPP VIIRS detected a fire here in 2012–2021, the years the fit needs.";
    case "numerical_fit_failure":
      return "The fit stopped on a numerical error that the data counts do not explain.";
  }
}

/** The counts that matter for a status, as [label, value] pairs. */
export function coverageCounts(e: CoverageEntry): Array<[string, string]> {
  const c = e.counts;
  return [
    ["Aqua detections, 2012–2018 (training target)", fmtInt(c.n_train_aqua)],
    ["Suomi-NPP detections, 2012–2018", fmtInt(c.n_train_viirs)],
    ["Aqua detections, 2019–2021 (held out)", fmtInt(c.n_test_aqua)],
    ["Held-out grid cells with Aqua", `${fmtInt(c.n_test_cells_with_aqua)} of ${fmtInt(c.n_test_cells)}`],
    ["MODIS detections, 2009–2011", fmtInt(c.n_modis_2009_2011)],
    ["All detections, 2012–2014", fmtInt(c.n_any_2012_2014)],
  ];
}

export interface CoverageSummary {
  total: number; own: number; borrowed: number; unfitted: number;
  /** Unfitted with a raw calendar (shown raw, uncorrected) / with no calendar at all. */
  rawOnly: number; noCalendar: number;
  /** Unfitted statuses with a non-zero count, in the file's order. */
  reasons: Array<{ status: CoverageStatus; n: number }>;
}

/** Every count derived from the per-country entries, never typed in. */
export function coverageSummary(f: CoverageStatusFile): CoverageSummary {
  const all = Object.values(f.countries);
  const un = all.filter((e) => !isFitted(e.status));
  const count = (s: CoverageStatus) => all.filter((e) => e.status === s).length;
  return {
    total: all.length,
    own: count("own_fit"),
    borrowed: count("borrowed_fit"),
    unfitted: un.length,
    rawOnly: un.filter((e) => e.has_raw_calendar).length,
    noCalendar: un.filter((e) => !e.has_raw_calendar).length,
    reasons: f.statuses.filter((s) => !isFitted(s)).map((s) => ({ status: s, n: count(s) })).filter((r) => r.n > 0),
  };
}

export const NOT_A_FAILURE = "This is a data-sufficiency outcome traced to the fit code, not a processing failure.";

/** G: what a missing fit means in practice, for someone working in that country. */
export const UNFITTED_MEANING =
  "What this means if you work there: only the raw record is shown. Counts up to 2011 are MODIS and from 2012 are VIIRS, a more sensitive sensor, so a jump at 2012 is the sensor change, not more fire. Compare years within 2001–2011 or within 2012–2025, not across them; the shape of the fire season within one era is still usable. The harmonized views, the 2012-step check and the R² score do not exist for it.";
