import type { AnomalyDay, CalendarDay, Detection, HarmonizationRow } from "@/lib/types";

/**
 * Synthetic data for developing the UI before the pipeline lands.
 *
 * Enabled only by NEXT_PUBLIC_DEMO_DATA=true, and every view that uses it
 * shows a banner saying so. This exists because the offline pipeline takes
 * weeks and the charts cannot be designed, reviewed or tested against an empty
 * database -- not to stand in for a result.
 *
 * NOTHING HERE IS A MEASUREMENT. The numbers are drawn from a seeded generator
 * with a plausible seasonal shape. They must never appear in a demo, a
 * screenshot presented as output, or a submission.
 */

export const DEMO_DATA_ENABLED = process.env.NEXT_PUBLIC_DEMO_DATA === "true";

/** Deterministic PRNG, so the synthetic record does not change between reloads. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const FIRST_YEAR = 2001;
const LAST_YEAR = 2025;
const VIIRS_FIRST_YEAR = 2012;

/**
 * The synthetic record deliberately contains the artifact the project exists
 * to remove: from 2012 the raw series jumps, because VIIRS starts contributing
 * detections MODIS could not see. The harmonized series does not jump.
 */
export function demoCalendar(seedText: string): CalendarDay[] {
  const random = seeded(hash(seedText));
  const days: CalendarDay[] = [];

  for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
    const yearStrength = 0.6 + random() * 0.9;
    const viirsEra = year >= VIIRS_FIRST_YEAR;

    for (let doy = 1; doy <= 365; doy += 1) {
      // A single broad dry-season peak, with the peak drifting slightly later.
      const peak = 225 + (year - FIRST_YEAR) * 0.6;
      const seasonal = Math.exp(-((doy - peak) ** 2) / (2 * 38 ** 2));
      if (random() > seasonal * 0.75 + 0.02) continue;

      const base = seasonal * yearStrength * (400 + random() * 900);
      // The step: VIIRS adds small fires, inflating the raw sum by ~55%.
      const raw = viirsEra ? base * 1.55 : base;

      days.push({
        acq_date: isoDate(year, doy),
        year,
        doy,
        sensor_mix: viirsEra ? "MODIS+VIIRS" : "MODIS",
        n_detections: Math.max(1, Math.round(base / 22)),
        frp_raw_mw: round(raw),
        frp_harmonized_mw: round(base),
        uncorrected_cells: 0,
      });
    }
  }

  return days;
}

export function demoAnomaly(seedText: string): AnomalyDay[] {
  const random = seeded(hash(seedText) + 7);
  const rows: AnomalyDay[] = [];
  const today = new Date();

  for (let back = 364; back >= 0; back -= 1) {
    const date = new Date(today.getTime() - back * 24 * 3600 * 1000);
    const doy = dayOfYear(date);
    const seasonal = Math.exp(-((doy - 230) ** 2) / (2 * 40 ** 2));

    const p50 = round(seasonal * 500 + 5);
    const p75 = round(p50 * 1.5 + 8);
    const p90 = round(p50 * 2.2 + 14);
    const p95 = round(p50 * 2.9 + 20);

    // A short run of genuinely unusual days, so the exceedance path is visible.
    const spike = back > 120 && back < 134 ? 2.6 : 1;
    const observed = round(p50 * (0.5 + random() * 1.3) * spike);

    rows.push({
      acq_date: date.toISOString().slice(0, 10),
      doy,
      observed_mw: observed,
      p50_mw: p50,
      p75_mw: p75,
      p90_mw: p90,
      p95_mw: p95,
      exceeds_p90: observed > p90,
      exceeds_p95: observed > p95,
    });
  }

  return rows;
}

export function demoDetections(
  bbox: [number, number, number, number],
): Detection[] {
  const random = seeded(hash(bbox.join(",")) + 13);
  const [west, south, east, north] = bbox;
  const platforms = ["Aqua", "Terra", "Suomi-NPP", "NOAA-20"];

  return Array.from({ length: 60 }, (_, i) => {
    const platform = platforms[Math.floor(random() * platforms.length)];
    return {
      lat: south + random() * (north - south),
      lon: west + random() * (east - west),
      acq_ts: new Date(Date.now() - random() * 7 * 24 * 3600 * 1000).toISOString(),
      sensor: platform.startsWith("N") || platform === "Suomi-NPP" ? "VIIRS" : "MODIS",
      platform,
      frp_mw: round(random() * 180 + 1),
      confidence_class: random() > 0.3 ? "nominal" : "high",
      event_id: i,
    } satisfies Detection;
  }).sort((a, b) => (b.frp_mw ?? 0) - (a.frp_mw ?? 0));
}

export function demoHarmonizationReport(): HarmonizationRow[] {
  const classes: Array<[number, string, number, number, number]> = [
    [2, "Evergreen Broadleaf Forest", 6.8, 1.31, 0.87],
    [8, "Woody Savanna", 4.2, 1.44, 0.91],
    [9, "Savanna", 3.9, 1.48, 0.93],
    [10, "Grassland", 3.1, 1.52, 0.84],
    [12, "Cropland", 2.4, 1.77, 0.71],
  ];

  return classes.map(([id, name, threshold, slope, r2]) => ({
    fit_version: "demo",
    landcover_class: id,
    landcover_name: name,
    frp_threshold_mw: threshold,
    slope,
    intercept: 0,
    r2,
    bias: round((1 - r2) * -12),
    rmse: round((1 - r2) * 180),
    n_cells: 1200 + id * 90,
    holdout_r2: round(r2 - 0.03),
    is_active: true,
  }));
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isoDate(year: number, doy: number): string {
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(doy);
  return date.toISOString().slice(0, 10);
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000) + 1;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
