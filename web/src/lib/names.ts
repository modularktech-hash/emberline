import type { Params } from "./types";

/**
 * Country keys are FIRMS archive spellings with underscores
 * ("Democratic_Republic_of_the_Congo", "Lao_PDR"). Lookups always use the raw
 * key; this is only for display.
 */
const OVERRIDES: Record<string, string> = {
  Cote_d_Ivoire: "Côte d’Ivoire",
  Macedonia_Former_Yugoslav_Republic_of: "Macedonia (former Yugoslav Rep.)",
  Dem_Rep_Korea: "Dem. Rep. Korea",
  Heard_I_and_McDonald_Islands: "Heard I. and McDonald Islands",
};

export function prettyName(key: string): string {
  return OVERRIDES[key] ?? key.replace(/_/g, " ");
}

/** Search text for a key: pretty and raw spellings, accents folded. */
export function searchText(key: string): string {
  return `${prettyName(key)} ${key.replace(/_/g, " ")}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export type FitTag = "pooled" | "raw-only";

/**
 * Per-country tag for pickers and tables: "pooled" when the country's curve
 * is the pooled one (too few training matches of its own), "raw-only" when it
 * has a raw calendar but no fit at all (reason-coded in coverage_status.json; uncorrected).
 */
export function fitTag(params: Params | null | undefined, key: string): FitTag | null {
  if (!params) return null;
  const fit = params.countries[key];
  if (!fit) return params.dataset === "world" ? "raw-only" : null;
  return fit.fit_source === "pooled" ? "pooled" : null;
}

export const TAG_LABEL: Record<FitTag, string> = { pooled: "pooled fit", "raw-only": "raw only" };
export const TAG_HINT: Record<FitTag, string> = {
  pooled: "Too few training matches for its own curve: uses the pooled curve of the own-fit countries",
  "raw-only": "No fit (not enough data of the kind the fit needs; reason on the Data page): the raw record only, uncorrected",
};

/** The four countries the method was first built and checked on (daily-resolution insights). */
export const ORIGINAL_FOUR = ["Australia", "Canada", "Chile", "Portugal"];
