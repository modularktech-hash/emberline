"use client";

import { useMemo, useState } from "react";
import { MONTH_TICKS, doyToLabel, formatMw, quantileScale } from "@/lib/scale";
import type { CalendarDay, Series } from "@/lib/types";

/**
 * The burning activity calendar: years down, day-of-year across.
 *
 * Laid out this way, a fire season is a horizontal band and a shift in its
 * timing is a visible slope. The 2012 sensor boundary is annotated because on
 * the raw series it produces a step change that is an artifact of VIIRS
 * launching, not of anything that happened on the ground -- labelling it is
 * the point of the chart, so it is drawn rather than left for the reader to
 * infer.
 *
 * Only days present in the data get a rect; the rest of each year is one
 * background row. A 25-year calendar is ~9,000 cells and most areas of
 * interest are quiet on most of them, so this keeps the DOM small.
 */

const CELL_W = 3;
const CELL_H = 11;
const GAP = 1;
const DAYS = 366;
const MARGIN = { top: 22, right: 12, bottom: 28, left: 46 };

const PLOT_W = DAYS * (CELL_W + GAP);

/** First full year of the VIIRS record. */
const VIIRS_FIRST_YEAR = 2012;

interface Props {
  days: CalendarDay[];
  series: Series;
  /** Title is required: with one series there is no legend box to name it. */
  title?: string;
}

interface HoverState {
  day: CalendarDay;
  x: number;
  y: number;
}

export function CalendarHeatmap({ days, series, title }: Props) {
  const [hover, setHover] = useState<HoverState | null>(null);

  const value = (day: CalendarDay) =>
    series === "harmonized" ? day.frp_harmonized_mw : day.frp_raw_mw;

  const { years, scale, rows, uncorrectedDays } = useMemo(() => {
    const allYears = days.map((d) => d.year);
    const min = allYears.length ? Math.min(...allYears) : new Date().getFullYear();
    const max = allYears.length ? Math.max(...allYears) : min;
    const yearList = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    // Both series share one scale, so flipping the toggle changes the colours
    // because the values changed -- not because the scale silently rebinned.
    const allValues = days.flatMap((d) => [d.frp_raw_mw, d.frp_harmonized_mw]);

    return {
      years: yearList,
      scale: quantileScale(allValues),
      rows: new Map(yearList.map((y, i) => [y, i])),
      uncorrectedDays: days.filter((d) => d.uncorrected_cells > 0).length,
    };
  }, [days]);

  const plotH = years.length * (CELL_H + GAP);
  const width = MARGIN.left + PLOT_W + MARGIN.right;
  const height = MARGIN.top + plotH + MARGIN.bottom;

  const viirsRow = rows.get(VIIRS_FIRST_YEAR);

  return (
    <figure className="m-0 w-full">
      {title ? (
        <figcaption className="mb-1 text-sm font-medium text-[var(--text-primary)]">
          {title}
        </figcaption>
      ) : null}

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[720px]"
          role="img"
          aria-label={`Burning activity by day of year, ${years[0]} to ${
            years[years.length - 1]
          }, ${series} series`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Month gridlines, recessive */}
          {MONTH_TICKS.map(({ doy, label }) => {
            const x = MARGIN.left + (doy - 1) * (CELL_W + GAP);
            return (
              <g key={label}>
                <line
                  x1={x}
                  x2={x}
                  y1={MARGIN.top - 4}
                  y2={MARGIN.top + plotH}
                  stroke="var(--gridline)"
                  strokeWidth={1}
                />
                <text
                  x={x + 2}
                  y={MARGIN.top - 8}
                  className="tabular"
                  fontSize={9}
                  fill="var(--text-muted)"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* One background row per year, then only the days that have data */}
          {years.map((year, i) => (
            <rect
              key={`bg-${year}`}
              x={MARGIN.left}
              y={MARGIN.top + i * (CELL_H + GAP)}
              width={PLOT_W}
              height={CELL_H}
              fill="var(--seq-0)"
              rx={1}
            />
          ))}

          {years.map((year, i) => (
            <text
              key={`label-${year}`}
              x={MARGIN.left - 8}
              y={MARGIN.top + i * (CELL_H + GAP) + CELL_H - 2}
              textAnchor="end"
              className="tabular"
              fontSize={9}
              fill="var(--text-muted)"
            >
              {year}
            </text>
          ))}

          {days.map((day) => {
            const row = rows.get(day.year);
            if (row === undefined) return null;
            return (
              <rect
                key={`${day.acq_date}`}
                x={MARGIN.left + (day.doy - 1) * (CELL_W + GAP)}
                y={MARGIN.top + row * (CELL_H + GAP)}
                width={CELL_W}
                height={CELL_H}
                rx={1}
                fill={scale.color(value(day))}
                /*
                 * The one animation in the application. Transitioning the fill
                 * is what makes the false 2012 step change visibly dissolve
                 * when the toggle flips -- a CSS transition rather than a
                 * motion library because this is thousands of nodes at once.
                 */
                style={{ transition: "fill 600ms ease-in-out" }}
                onMouseEnter={(event) =>
                  setHover({
                    day,
                    x: event.nativeEvent.offsetX,
                    y: event.nativeEvent.offsetY,
                  })
                }
              />
            );
          })}

          {/* The sensor boundary: an annotation, because it is the thesis */}
          {viirsRow !== undefined ? (
            <g>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + PLOT_W}
                y1={MARGIN.top + viirsRow * (CELL_H + GAP) - GAP / 2}
                y2={MARGIN.top + viirsRow * (CELL_H + GAP) - GAP / 2}
                stroke="var(--series-2)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={MARGIN.left + PLOT_W}
                y={MARGIN.top + viirsRow * (CELL_H + GAP) - 4}
                textAnchor="end"
                fontSize={9}
                fill="var(--series-2)"
              >
                VIIRS joins the record
              </text>
            </g>
          ) : null}
        </svg>

        {hover ? (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-xs shadow-lg"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            <div className="font-medium text-[var(--text-primary)]">
              {doyToLabel(hover.day.doy, hover.day.year)} {hover.day.year}
            </div>
            <div className="tabular text-[var(--text-secondary)]">
              {formatMw(value(hover.day))} · {hover.day.n_detections} detections
            </div>
            <div className="text-[var(--text-muted)]">{hover.day.sensor_mix}</div>
          </div>
        ) : null}
      </div>

      <Legend scale={scale} />

      {uncorrectedDays > 0 ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {uncorrectedDays} day{uncorrectedDays === 1 ? "" : "s"} include cells with
          no fitted correction factor and are shown uncorrected.
        </p>
      ) : null}
    </figure>
  );
}

function Legend({ scale }: { scale: ReturnType<typeof quantileScale> }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-[10px] text-[var(--text-muted)]">
      <span className="mr-1">Activity</span>
      <span
        className="inline-block h-3 w-4 rounded-[2px]"
        style={{ background: "var(--seq-0)" }}
        aria-hidden
      />
      <span className="mr-2">none</span>
      {scale.breaks.map((breakValue, i) => (
        <span key={breakValue} className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-4 rounded-[2px]"
            style={{ background: `var(--seq-${i + 1})` }}
            aria-hidden
          />
          <span className="tabular mr-1">&le; {formatMw(breakValue)}</span>
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-4 rounded-[2px]"
          style={{ background: `var(--seq-${scale.breaks.length + 1})` }}
          aria-hidden
        />
        <span className="tabular">to {formatMw(scale.max)}</span>
      </span>
    </div>
  );
}
