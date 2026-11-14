"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { MISSING_FILL, MISSING_HATCH, type SqrtScale, type Theme } from "@/lib/colorScale";
import { BASIS_LABEL, MONTHS, MONTHS_SHORT, type CalendarMatrix, formatValue } from "@/lib/calendarMatrix";
import type { Series } from "@/lib/types";

/**
 * Month x year burning activity calendar, hand-rolled SVG.
 *
 * Rows are years, columns are months, a cell is the month's detection count.
 * To the right of each row, a bar of that year's total in the same series.
 *
 * The raw -> harmonized switch is the app's ONE animation: each cell's fill
 * interpolates to the other series' colour, staggered by row (<= ~0.8 s),
 * and is instant under prefers-reduced-motion.
 *
 * Keyboard: the grid is one tab stop; arrow keys / Home / End move between
 * months, and each cell carries a full aria-label.
 */

interface Props {
  matrix: CalendarMatrix;
  mode: Series;
  scale: SqrtScale;
  /** Shared maximum of the annual totals across both series. */
  annualMax: number;
  theme: Theme;
  /** Area name, for the SVG title. */
  areaLabel: string;
  unit: string;
}

type Hover = { row: number; col: number } | { row: number; col: "total" } | null;

const YEAR_W = 38;
const GRID_GAP = 14;
const TOP = 24;

export function CalendarHeatmap({ matrix, mode, scale, annualMax, theme, areaLabel, unit }: Props) {
  const uid = useId().replace(/:/g, "");
  const reduceMotion = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<Hover>(null);
  const [active, setActive] = useState<{ row: number; col: number }>({ row: 0, col: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { years, viirsFirstYear } = matrix;
  const values = matrix.values[mode];
  const basis = matrix.basis[mode];
  const totals = matrix.totals[mode];

  const geo = useMemo(() => {
    const W = Math.max(width, 300);
    const compact = W < 560;
    // Room for the longest annual-total label in either series (~6.5 px per glyph at 11 px).
    const longest = Math.max(
      7,
      ...(["raw", "harmonized"] as const).flatMap((m) =>
        matrix.totals[m].map((t) => (t.value === null ? 7 : formatValue(t.value, m, false).length + 1)),
      ),
    );
    const valueW = Math.ceil(longest * 6.5) + 8;
    const minBarZone = (compact ? 56 : 110) + valueW;
    const cellW = Math.min(46, Math.floor((W - YEAR_W - minBarZone - GRID_GAP) / 12));
    // Whatever the capped cells leave goes to the annual bars, up to a limit.
    const barZone = Math.max(minBarZone, Math.min(360, W - YEAR_W - GRID_GAP - cellW * 12));
    const cellH = compact ? 17 : 20;
    const gridX = YEAR_W;
    const gridW = cellW * 12;
    const barX = gridX + gridW + GRID_GAP;
    const barMaxW = Math.max(20, barZone - valueW - 6);
    // A labelled gap row at the VIIRS splice, when it falls inside the range.
    const splitRow =
      viirsFirstYear !== null ? years.findIndex((y) => y === viirsFirstYear) : -1;
    const sepH = splitRow > 0 ? 22 : 0;
    const rowY = (r: number) => TOP + r * cellH + (splitRow > 0 && r >= splitRow ? sepH : 0);
    const height = rowY(years.length - 1) + cellH + 4;
    const svgW = barX + barMaxW + valueW + 6;
    return { compact, cellW, cellH, gridX, barX, barMaxW, splitRow, sepH, rowY, height, svgW };
  }, [width, years, viirsFirstYear, matrix.totals]);

  const move = useCallback(
    (row: number, col: number) => {
      const r = Math.max(0, Math.min(years.length - 1, row));
      const c = Math.max(0, Math.min(11, col));
      setActive({ row: r, col: c });
      setHover({ row: r, col: c });
      svgRef.current?.querySelector<SVGRectElement>(`[data-cell="${r}-${c}"]`)?.focus();
    },
    [years.length],
  );

  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    const { row, col } = active;
    const keys: Record<string, [number, number]> = {
      ArrowRight: [row, col + 1],
      ArrowLeft: [row, col - 1],
      ArrowDown: [row + 1, col],
      ArrowUp: [row - 1, col],
      Home: [row, 0],
      End: [row, 11],
    };
    const next = keys[event.key];
    if (next) {
      event.preventDefault();
      move(next[0], next[1]);
    } else if (event.key === "Escape") {
      setHover(null);
    }
  };

  const transitionFor = (row: number) =>
    reduceMotion
      ? { duration: 0 }
      : { duration: 0.32, delay: row * (0.45 / Math.max(1, years.length)), ease: "easeInOut" as const };

  const { compact, cellW, cellH, gridX, barX, barMaxW, splitRow, sepH, rowY, height, svgW } = geo;
  const monthNames = compact ? MONTHS.map((m) => m[0]) : MONTHS_SHORT;
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  const tooltip = (() => {
    if (!hover || width === 0) return null;
    const year = years[hover.row];
    if (hover.col === "total") {
      const t = totals[hover.row];
      return {
        x: barX,
        y: rowY(hover.row),
        lines: [
          `${year} · annual total`,
          t.value === null ? "No data" : formatValue(t.value, mode, true),
          t.value !== null && t.months < 12 ? `${t.months} of 12 months have data` : null,
          mode === "raw" ? "Raw, not corrected" : "Harmonized",
        ],
      };
    }
    const v = values[hover.row][hover.col];
    return {
      x: gridX + hover.col * cellW,
      y: rowY(hover.row),
      lines: [
        `${MONTHS[hover.col]} ${year}`,
        v === null ? "No data" : formatValue(v, mode, true),
        BASIS_LABEL[basis[hover.row][hover.col]],
      ],
    };
  })();

  return (
    <div ref={wrapRef} className="relative w-full">
      {width > 0 ? (
        <svg
          ref={svgRef}
          width={svgW}
          height={height}
          viewBox={`0 0 ${svgW} ${height}`}
          role="group"
          aria-labelledby={`${uid}-title`}
          aria-describedby={`${uid}-desc`}
          className="block max-w-full overflow-visible"
          onMouseLeave={() => setHover(null)}
        >
          <title id={`${uid}-title`}>
            {`Burning activity calendar, ${areaLabel}, ${firstYear}–${lastYear}, ${mode === "raw" ? "raw (not corrected)" : "harmonized"}`}
          </title>
          <desc id={`${uid}-desc`}>
            {`Monthly active-fire detections, one row per year and one column per month, coloured on a square-root scale. Unit: ${unit}. A bar per year shows the annual total. Use the arrow keys to move between months.`}
          </desc>
          <defs>
            <pattern
              id={`${uid}-hatch`}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="5" stroke={MISSING_HATCH[theme]} strokeWidth="1.2" />
            </pattern>
          </defs>

          {/* Month labels */}
          <g aria-hidden="true" className="fill-[var(--text-secondary)] text-[11px]">
            {monthNames.map((m, c) => (
              <text key={m + c} x={gridX + c * cellW + (cellW - 2) / 2} y={TOP - 8} textAnchor="middle">
                {m}
              </text>
            ))}
            <text x={barX} y={TOP - 8}>
              Annual total
            </text>
          </g>

          {/* Sensor boundary */}
          {splitRow > 0 ? (
            <g aria-hidden="true">
              <line
                x1={gridX}
                x2={svgW}
                y1={rowY(splitRow) - sepH / 2 - 1}
                y2={rowY(splitRow) - sepH / 2 - 1}
                stroke={mode === "raw" ? "var(--text-primary)" : "var(--text-muted)"}
                strokeWidth={mode === "raw" ? 1.5 : 1}
                strokeDasharray={mode === "raw" ? undefined : "3 3"}
              />
              <text
                x={gridX}
                y={rowY(splitRow) - sepH / 2 + 3}
                className={`text-[11px] ${mode === "raw" ? "fill-[var(--text-primary)] font-semibold" : "fill-[var(--text-secondary)]"}`}
                stroke="var(--surface-1)"
                strokeWidth={5}
                paintOrder="stroke"
              >
                {mode === "raw"
                  ? `VIIRS starts ${viirsFirstYear}`
                  : `${viirsFirstYear} on: Aqua-equivalent, predicted from VIIRS`}
              </text>
            </g>
          ) : null}

          {/* Cells */}
          <g role="grid" aria-label="Months by year" onKeyDown={onKeyDown}>
            {years.map((year, r) => (
              <g key={year} role="row">
                <text
                  x={YEAR_W - 8}
                  y={rowY(r) + cellH / 2 + 3}
                  textAnchor="end"
                  aria-hidden="true"
                  className="tabular fill-[var(--text-secondary)] text-[11px]"
                >
                  {year}
                </text>
                {values[r].map((v, c) => {
                  const x = gridX + c * cellW;
                  const y = rowY(r);
                  const fill = v === null ? MISSING_FILL[theme] : scale.color(v, theme);
                  const isActive = active.row === r && active.col === c;
                  return (
                    <g key={c}>
                      <motion.rect
                        data-cell={`${r}-${c}`}
                        data-value={v ?? ""}
                        role="gridcell"
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`${MONTHS[c]} ${year}: ${v === null ? "no data" : formatValue(v, mode, true)}. ${BASIS_LABEL[basis[r][c]]}.`}
                        x={x}
                        y={y}
                        width={cellW - 2}
                        height={cellH - 2}
                        rx={2}
                        initial={false}
                        animate={{ fill }}
                        transition={transitionFor(r)}
                        onMouseEnter={() => setHover({ row: r, col: c })}
                        onFocus={() => {
                          setActive({ row: r, col: c });
                          setHover({ row: r, col: c });
                        }}
                        onBlur={() => setHover(null)}
                        style={{ outline: "none" }}
                      />
                      {v === null ? (
                        <rect
                          x={x}
                          y={y}
                          width={cellW - 2}
                          height={cellH - 2}
                          rx={2}
                          fill={`url(#${uid}-hatch)`}
                          pointerEvents="none"
                          aria-hidden="true"
                        />
                      ) : null}
                    </g>
                  );
                })}
              </g>
            ))}
          </g>

          {/* Hover / focus ring */}
          {hover && hover.col !== "total" ? (
            <rect
              x={gridX + hover.col * cellW - 1.5}
              y={rowY(hover.row) - 1.5}
              width={cellW + 1}
              height={cellH + 1}
              rx={3}
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth={1.5}
              pointerEvents="none"
              aria-hidden="true"
            />
          ) : null}

          {/* Annual totals */}
          <g aria-label="Annual totals" role="list">
            {years.map((year, r) => {
              const t = totals[r];
              const y = rowY(r);
              const w = t.value === null || annualMax <= 0 ? 0 : Math.max(1, (t.value / annualMax) * barMaxW);
              const partial = t.value !== null && t.months < 12;
              return (
                <g
                  key={year}
                  role="listitem"
                  data-year={year}
                  data-total={t.value ?? ""}
                  aria-label={`${year} annual total: ${t.value === null ? "no data" : formatValue(t.value, mode, true)}${partial ? ` (${t.months} of 12 months)` : ""}`}
                  onMouseEnter={() => setHover({ row: r, col: "total" })}
                >
                  <rect x={barX} y={y} width={barMaxW + 46} height={cellH} fill="transparent" />
                  <motion.rect
                    x={barX}
                    y={y + 3}
                    height={cellH - 8}
                    rx={2}
                    initial={false}
                    animate={{ width: w }}
                    transition={transitionFor(r)}
                    fill="var(--bar-fill)"
                    opacity={partial ? 0.45 : 1}
                  />
                  <text
                    x={barX + w + 5}
                    y={y + cellH / 2 + 2}
                    aria-hidden="true"
                    className={`tabular text-[11px] ${partial || t.value === null ? "fill-[var(--text-muted)]" : "fill-[var(--text-secondary)]"}`}
                  >
                    {t.value === null ? "no data" : `${formatValue(t.value, mode, false)}${partial ? "*" : ""}`}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div style={{ height: 520 }} />
      )}

      {tooltip ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: Math.max(0, Math.min(tooltip.x - 8, width - 200)),
            top: tooltip.y + cellH + 4,
          }}
        >
          {tooltip.lines.filter(Boolean).map((line, i) => (
            <div
              key={i}
              className={
                i === 0
                  ? "font-medium text-[var(--text-primary)]"
                  : i === 1
                    ? "tabular text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)]"
              }
            >
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
