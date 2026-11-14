import type { CalendarBasis, CalendarResult, Series } from "@/lib/types";

/**
 * The year x month matrix the calendar draws, for both series at once, so
 * the raw -> harmonized switch can interpolate and share one colour domain.
 * This is also the shape a CSV export of "what is on screen" reads.
 */

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export const BASIS_LABEL: Record<CalendarBasis, string> = {
  MODIS: "Raw MODIS (Terra + Aqua), not corrected",
  VIIRS: "Raw VIIRS (Suomi-NPP), not corrected",
  observed_aqua: "Observed Aqua MODIS",
  predicted_from_viirs: "Aqua-equivalent, predicted from VIIRS",
};

export interface AnnualTotal {
  /** Sum of the months with data; null if no month has data. */
  value: number | null;
  /** Months (of 12) that have data. */
  months: number;
}

export interface CalendarMatrix {
  years: number[];
  /** First / last month (1-12) shown in the first / last year of the range. */
  fromMonth: number;
  toMonth: number;
  /**
   * inRange[yearIndex][monthIndex]: false for months outside the selected date
   * range. Their value is null, and they are drawn as out of range, not as
   * missing and never as zero.
   */
  inRange: boolean[][];
  /** values[mode][yearIndex][monthIndex]; null = no data (not zero) or out of range. */
  values: Record<Series, (number | null)[][]>;
  basis: Record<Series, CalendarBasis[][]>;
  totals: Record<Series, AnnualTotal[]>;
  unit: Record<Series, string>;
  /** First year whose raw value comes from VIIRS, if it is in the range. */
  viirsFirstYear: number | null;
  /** Min / max of every non-null monthly value across both series. */
  min: number;
  max: number;
  /** Max annual total across both series. */
  annualMax: number;
  hasData: boolean;
}

export function buildMatrix(
  raw: CalendarResult,
  harmonized: CalendarResult,
  from: number,
  to: number,
  fromMonth = 1,
  toMonth = 12,
): CalendarMatrix {
  const years: number[] = [];
  for (let y = from; y <= to; y += 1) years.push(y);
  const isIn = (year: number, month: number) =>
    !(year === from && month < fromMonth) && !(year === to && month > toMonth);
  const inRange = years.map((y) => Array.from({ length: 12 }, (_, i) => isIn(y, i + 1)));

  const values = { raw: [], harmonized: [] } as unknown as CalendarMatrix["values"];
  const basis = { raw: [], harmonized: [] } as unknown as CalendarMatrix["basis"];
  const totals = { raw: [], harmonized: [] } as unknown as CalendarMatrix["totals"];
  let min = Infinity;
  let max = -Infinity;
  let annualMax = 0;
  // From the whole record, not the visible range: the splice year is a
  // property of the data, and is only drawn if it falls inside the range.
  let viirsFirstYear: number | null = null;
  for (const r of raw.rows) {
    if (r.basis === "VIIRS" && (viirsFirstYear === null || r.year < viirsFirstYear)) {
      viirsFirstYear = r.year;
    }
  }
  if (viirsFirstYear !== null && (viirsFirstYear <= from || viirsFirstYear > to)) {
    viirsFirstYear = null;
  }

  for (const [mode, result] of [
    ["raw", raw],
    ["harmonized", harmonized],
  ] as const) {
    const byYm = new Map(result.rows.map((r) => [r.year * 12 + r.month - 1, r]));
    for (const year of years) {
      const rowValues: (number | null)[] = [];
      const rowBasis: CalendarBasis[] = [];
      let sum = 0;
      let months = 0;
      for (let month = 1; month <= 12; month += 1) {
        const r = byYm.get(year * 12 + month - 1);
        const v = isIn(year, month) ? (r?.value ?? null) : null;
        rowValues.push(v);
        rowBasis.push(r?.basis ?? (mode === "raw" ? "MODIS" : "observed_aqua"));
        if (v !== null) {
          sum += v;
          months += 1;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      values[mode].push(rowValues);
      basis[mode].push(rowBasis);
      const total = months > 0 ? sum : null;
      totals[mode].push({ value: total, months });
      if (total !== null && total > annualMax) annualMax = total;
    }
  }

  const hasData = Number.isFinite(max);
  return {
    years,
    fromMonth,
    toMonth,
    inRange,
    values,
    basis,
    totals,
    unit: { raw: raw.unit, harmonized: harmonized.unit },
    viirsFirstYear,
    min: hasData ? min : 0,
    max: hasData ? max : 0,
    annualMax,
    hasData,
  };
}

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDp = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Raw counts are integers; harmonized values are model output, shown to 0.1 when exact. */
export function formatValue(v: number, mode: Series, exact: boolean): string {
  if (mode === "harmonized" && exact) return oneDp.format(v);
  return whole.format(v);
}
