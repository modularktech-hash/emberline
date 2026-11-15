import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Server-only: own-fit vs borrowed-curve country counts, read at build time from the published
 * coverage_status.json (E42), so summaries and metadata never carry a typed-in count.
 */
export function fitCounts(): { own: number; borrowed: number; raw: number } | null {
  try {
    const d = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "coverage_status.json"), "utf8")) as { summary: Record<string, number> };
    const total = Object.values(d.summary).reduce((a, b) => a + b, 0);
    return { own: d.summary.own_fit, borrowed: d.summary.borrowed_fit, raw: total - d.summary.own_fit - d.summary.borrowed_fit };
  } catch {
    return null;
  }
}

/** "171 countries harmonized: 130 with their own fit, 41 with a pooled fit; 66 shown raw (too few detections to fit)", or a count-free fallback. */
export function fitCountsPhrase(c = fitCounts()) {
  return c ? `${c.own + c.borrowed} countries harmonized: ${c.own} with their own fit, ${c.borrowed} with a pooled fit; ${c.raw} shown raw (too few detections to fit)` : "countries with their own fit or a pooled fit; the rest shown raw";
}
