import { MONTHS_SHORT, type CalendarMatrix } from "./calendarMatrix";
import type { Series } from "./types";

/**
 * CSV export of the calendar matrix exactly as it is on screen: one row per
 * year of the selected range, Jan..Dec, annual_total. Pure: no DOM, no
 * fetch, no clock -- the caller passes the download time.
 *
 * Every number comes from the matrix (built from the data files) or from
 * params.json via the caller. An empty cell means no data or outside the
 * selected date range; it is never written as 0.
 */

export interface CsvArea {
  scope: "country" | "h3_parent";
  label: string;
  /** [west, south, east, north] when the area is a box. */
  bbox?: [number, number, number, number];
  /** Keys whose rows were summed (processed). */
  usedKeys: string[];
  /** Requested keys that have no data files yet. */
  unprocessedKeys: string[];
}

export interface CsvInput {
  matrix: CalendarMatrix;
  mode: Series;
  area: CsvArea;
  /** params.json */
  fitVersion: string;
  harmonizedUnit: string;
  /** First year of the raw VIIRS record (from the data), or null if none. */
  viirsFirstYear: number | null;
  /** ISO timestamp of the click. */
  downloadedAt: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** RFC 4180 field quoting. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Strip anything that would break a one-line `#` comment. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ");

/**
 * Numbers as stored, without float noise from summation
 * (0.30000000000000004 -> 0.3). Raw counts are integers and print as such.
 */
function num(v: number | null): string {
  if (v === null) return "";
  return String(Number(v.toFixed(6)));
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function csvFilename(input: Pick<CsvInput, "matrix" | "mode" | "area">): string {
  const { matrix, mode, area } = input;
  const first = matrix.years[0];
  const last = matrix.years[matrix.years.length - 1];
  const areaPart =
    area.scope === "h3_parent" && area.bbox
      ? `box_${area.bbox[1]}_${area.bbox[0]}_${area.bbox[3]}_${area.bbox[2]}`
      : area.label;
  return `emberline_${slug(areaPart)}_${mode}_${first}-${pad2(matrix.fromMonth)}-to-${last}-${pad2(matrix.toMonth)}.csv`;
}

/** First year in the matrix whose harmonized value is predicted from VIIRS. */
function predictedFromYear(matrix: CalendarMatrix): number | null {
  for (let r = 0; r < matrix.years.length; r += 1) {
    if (matrix.basis.harmonized[r].some((b) => b === "predicted_from_viirs")) return matrix.years[r];
  }
  return null;
}

export function buildCalendarCsv(input: CsvInput): string {
  const { matrix, mode, area, fitVersion, harmonizedUnit, viirsFirstYear, downloadedAt } = input;
  const first = matrix.years[0];
  const last = matrix.years[matrix.years.length - 1];
  const lines: string[] = [];
  const meta = (key: string, value: string) => lines.push(`# ${key}: ${oneLine(value)}`);

  meta("title", "Burning activity calendar (monthly active-fire detections)");
  if (area.scope === "h3_parent" && area.bbox) {
    const [west, south, east, north] = area.bbox;
    meta("area", `box south=${south} west=${west} north=${north} east=${east} (degrees)`);
    meta(
      "area_resolution",
      "the box is resolved to whole H3 resolution-2 cells (every cell it touches); cells on a border only count detections inside the processed countries",
    );
    meta(`h3_res2_cells_used (${area.usedKeys.length})`, area.usedKeys.join(" ") || "none");
    if (area.unprocessedKeys.length > 0) {
      meta(
        `h3_res2_cells_not_processed (${area.unprocessedKeys.length})`,
        `${area.unprocessedKeys.join(" ")} (no data files yet; not included)`,
      );
    }
  } else {
    meta("area", `${area.label.replace(/_/g, " ")} (country)`);
  }
  meta("date_range", `${first}-${pad2(matrix.fromMonth)} to ${last}-${pad2(matrix.toMonth)} (inclusive)`);
  meta("mode", mode === "raw" ? "raw (uncorrected)" : "harmonized");

  const splice = viirsFirstYear !== null ? String(viirsFirstYear) : "the VIIRS start year";
  if (mode === "raw") {
    meta(
      "unit",
      `raw detections (MODIS Terra+Aqua before ${splice}, VIIRS Suomi-NPP from ${splice}) — NOT corrected`,
    );
    meta("fit_version", `${fitVersion} (does not apply to these raw values)`);
  } else {
    meta("unit", harmonizedUnit);
    meta("fit_version", fitVersion);
  }

  const predicted = predictedFromYear(matrix);
  meta(
    "harmonized_basis",
    predicted !== null
      ? `harmonized values from ${predicted} are Aqua-MODIS-equivalent, predicted from VIIRS (Suomi-NPP) with the published fit; before ${predicted} they are observed Aqua MODIS`
      : "harmonized values in this range are all observed Aqua MODIS (none predicted from VIIRS)",
  );
  meta("annual_total", "sum of the months with data in the selected range");
  meta("empty_cell", "no data, or outside the selected date range — not zero");
  meta("data_source", "NASA FIRMS");
  meta("downloaded", downloadedAt);

  lines.push(["year", ...MONTHS_SHORT, "annual_total"].map(csvField).join(","));
  matrix.years.forEach((year, r) => {
    const cells = matrix.values[mode][r].map(num);
    const total = num(matrix.totals[mode][r].value);
    lines.push([String(year), ...cells, total].map(csvField).join(","));
  });

  return lines.join("\n") + "\n";
}
