import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Server-only: own-fit vs borrowed-curve country counts, read at build time from the published
 * coverage_status.json (E42), so summaries and metadata never carry a typed-in count.
 */
export function fitCounts(): { own: number; borrowed: number } | null {
  try {
    const d = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "coverage_status.json"), "utf8")) as { summary: Record<string, number> };
    return { own: d.summary.own_fit, borrowed: d.summary.borrowed_fit };
  } catch {
    return null;
  }
}

/** "130 countries with their own fitted curve and 41 on a borrowed (pooled) curve", or a count-free fallback. */
export function fitCountsPhrase(c = fitCounts()) {
  return c ? `${c.own} countries with their own fitted curve and ${c.borrowed} on a borrowed (pooled) curve` : "countries with their own fitted curve or a borrowed (pooled) curve";
}
