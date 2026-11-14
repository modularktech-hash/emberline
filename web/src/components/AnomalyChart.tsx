"use client";

import { useMemo, useRef, useState } from "react";
import { axisFormatter, formatMw } from "@/lib/scale";
import type { AnomalyDay } from "@/lib/types";

/**
 * Observed burning activity against the day-of-year climatology.
 *
 * The bands are the historical distribution for the same calendar day, so a
 * line above the 90th percentile means "unusual for this time of year" rather
 * than merely "a lot" -- which is the distinction a fire manager in a strongly
 * seasonal landscape actually needs.
 *
 * Bands are neutral grey and the observation carries the one series hue, so
 * the reader never has to separate two similar colours. Exceedance uses the
 * reserved status palette with a labelled marker, never colour alone.
 */

const MARGIN = { top: 16, right: 16, bottom: 28, left: 56 };
const WIDTH = 900;
const HEIGHT = 280;
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

interface Props {
  days: AnomalyDay[];
  title?: string;
}

export function AnomalyChart({ days, title }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { points, yMax, xOf, yOf } = useMemo(() => {
    const sorted = [...days].sort((a, b) => a.acq_date.localeCompare(b.acq_date));
    const maxima = sorted.flatMap((d) => [d.observed_mw ?? 0, d.p95_mw ?? 0]);
    const max = Math.max(1, ...maxima);

    const xScale = (i: number) =>
      MARGIN.left + (sorted.length <= 1 ? 0 : (i / (sorted.length - 1)) * PLOT_W);
    const yScale = (v: number) => MARGIN.top + PLOT_H - (v / max) * PLOT_H;

    return { points: sorted, yMax: max, xOf: xScale, yOf: yScale };
  }, [days]);

  if (points.length === 0) return null;

  const band = (lower: keyof AnomalyDay, upper: keyof AnomalyDay) => {
    const top = points.map((d, i) => `${xOf(i)},${yOf((d[upper] as number) ?? 0)}`);
    const bottom = points
      .map((d, i) => `${xOf(i)},${yOf((d[lower] as number) ?? 0)}`)
      .reverse();
    return `M${top.join("L")}L${bottom.join("L")}Z`;
  };

  const zeroBand = () => {
    const top = points.map((d, i) => `${xOf(i)},${yOf(d.p50_mw ?? 0)}`);
    const bottom = points.map((d, i) => `${xOf(i)},${yOf(0)}`).reverse();
    return `M${top.join("L")}L${bottom.join("L")}Z`;
  };

  const line = points
    .map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(d.observed_mw ?? 0)}`)
    .join("");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const formatTick = axisFormatter(ticks);
  const hovered = hoverIndex === null ? null : points[hoverIndex];

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (x - MARGIN.left) / PLOT_W;
    const index = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, index)));
  };

  return (
    <figure className="m-0 w-full">
      {title ? (
        <figcaption className="mb-1 text-sm font-medium text-[var(--text-primary)]">
          {title}
        </figcaption>
      ) : null}

      <div className="relative w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          role="img"
          aria-label="Observed burning activity against day-of-year climatology bands"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={yOf(t)}
                y2={yOf(t)}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={yOf(t) + 3}
                textAnchor="end"
                className="tabular"
                fontSize={10}
                fill="var(--text-muted)"
              >
                {formatTick(t)}
              </text>
            </g>
          ))}

          <path d={zeroBand()} fill="var(--baseline)" opacity={0.18} />
          <path d={band("p50_mw", "p90_mw")} fill="var(--baseline)" opacity={0.3} />
          <path d={band("p90_mw", "p95_mw")} fill="var(--baseline)" opacity={0.45} />

          <path
            d={line}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Exceedance markers: reserved status colours, ringed against the surface */}
          {points.map((d, i) =>
            d.exceeds_p90 || d.exceeds_p95 ? (
              <circle
                key={d.acq_date}
                cx={xOf(i)}
                cy={yOf(d.observed_mw ?? 0)}
                r={4}
                fill={d.exceeds_p95 ? "var(--status-critical)" : "var(--status-serious)"}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            ) : null,
          )}

          {hovered ? (
            <line
              x1={xOf(hoverIndex!)}
              x2={xOf(hoverIndex!)}
              y1={MARGIN.top}
              y2={MARGIN.top + PLOT_H}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          <line
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={MARGIN.top + PLOT_H}
            y2={MARGIN.top + PLOT_H}
            stroke="var(--baseline)"
            strokeWidth={1}
          />

          {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
            <text
              key={i}
              x={xOf(i)}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              className="tabular"
              fontSize={10}
              fill="var(--text-muted)"
            >
              {points[i].acq_date}
            </text>
          ))}
        </svg>

        {hovered ? (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-xs shadow-lg"
            style={{
              left: `${(xOf(hoverIndex!) / WIDTH) * 100}%`,
              transform: "translateX(8px)",
            }}
          >
            <div className="font-medium text-[var(--text-primary)]">
              {hovered.acq_date}
            </div>
            <div className="tabular text-[var(--text-secondary)]">
              observed {formatMw(hovered.observed_mw)}
            </div>
            <div className="tabular text-[var(--text-muted)]">
              typical {formatMw(hovered.p50_mw)} · p90 {formatMw(hovered.p90_mw)}
            </div>
            {hovered.exceeds_p95 ? (
              <div className="mt-0.5 font-medium text-[var(--status-critical)]">
                ▲ Above the 95th percentile for this date
              </div>
            ) : hovered.exceeds_p90 ? (
              <div className="mt-0.5 font-medium text-[var(--status-serious)]">
                ▲ Above the 90th percentile for this date
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Legend />
    </figure>
  );
}

function Legend() {
  const items = [
    { label: "Observed", swatch: "var(--series-1)", shape: "line" as const },
    { label: "Typical range (p50–p95)", swatch: "var(--baseline)", shape: "area" as const },
    { label: "Above p90", swatch: "var(--status-serious)", shape: "dot" as const },
    { label: "Above p95", swatch: "var(--status-critical)", shape: "dot" as const },
  ];

  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-secondary)]">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={
              item.shape === "line"
                ? "inline-block h-[2px] w-4 rounded-full"
                : item.shape === "dot"
                  ? "inline-block h-2.5 w-2.5 rounded-full"
                  : "inline-block h-3 w-4 rounded-[2px] opacity-40"
            }
            style={{ background: item.swatch }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
