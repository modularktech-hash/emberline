"use client";

import { useParquet } from "@/lib/useParquet";
import { fmt } from "@/lib/ember";

/**
 * E27: coefficient-only intervals for harmonized country totals, read from
 * web/public/data/harmonized_uncertainty.json (docs/data-contract-additions.md §10).
 * Never a confidence interval of the fire count.
 */
export const UNC_LABEL = "Range from fit-coefficient uncertainty only — excludes κ, model-form, matching-rule and drift uncertainty.";
export const UNC_NOT_TOTAL = "Not the total uncertainty of the count, and not a confidence interval of the fire count.";

type Triple = [number, number, number];
export interface UncCountry {
  status: "estimated" | "not estimated";
  reason?: string;
  annual: Record<string, Triple> | null;
  monthly: Record<string, Triple> | null;
}
export interface UncFile {
  fit_version: string;
  unit: string;
  interval: string;
  pre_2012: string;
  covers: { included: string[]; not_included: string[] };
  countries: Record<string, UncCountry>;
}

let p: Promise<UncFile | null> | null = null;
export function loadUncertainty(): Promise<UncFile | null> {
  p ??= fetch("/data/harmonized_uncertainty.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return p;
}
export function useUncertainty() {
  return useParquet(loadUncertainty, "harmonized_uncertainty");
}

export type UncResult =
  | { kind: "interval"; point: number; lo: number; hi: number }
  | { kind: "none"; text: string };

/** Interval for one country and period ("2023" or "2023-07"). */
export function uncFor(file: UncFile | null | undefined, fitVersion: string, country: string, year: number, month?: number): UncResult {
  if (!file) return { kind: "none", text: "not available (harmonized_uncertainty.json not loaded)" };
  if (file.fit_version !== fitVersion) return { kind: "none", text: `not shown: interval file is for fit ${file.fit_version}, page uses ${fitVersion}` };
  const c = file.countries[country];
  if (!c) return { kind: "none", text: "not estimated (no fit)" };
  if (c.status !== "estimated") return { kind: "none", text: "uncertainty not estimated (pooled, borrowed curve)" };
  if (year < 2012) return { kind: "none", text: "no interval: observed Aqua counts before 2012" };
  const t = month ? c.monthly?.[`${year}-${String(month).padStart(2, "0")}`] : c.annual?.[String(year)];
  if (!t) return { kind: "none", text: "not available for this period" };
  return { kind: "interval", point: t[0], lo: t[1], hi: t[2] };
}

export function fmtUnc(u: UncResult): string {
  return u.kind === "interval" ? `${fmt(u.lo)}–${fmt(u.hi)} (point ${fmt(u.point)})` : u.text;
}
