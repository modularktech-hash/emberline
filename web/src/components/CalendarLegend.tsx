"use client";

import { useId } from "react";
import { MISSING_FILL, MISSING_HATCH, RAMP_NAME, type SqrtScale, type Theme } from "@/lib/colorScale";
import { formatValue } from "@/lib/calendarMatrix";
import type { Series } from "@/lib/types";

/**
 * Names the ramp and the scale, prints the actual data min / midpoint / max,
 * and shows the "no data" hatch so missing months are never read as zero.
 */

const W = 220;
const STOPS = 24;

export function CalendarLegend({
  scale,
  theme,
  mode,
  showMissing,
}: {
  scale: SqrtScale;
  theme: Theme;
  mode: Series;
  showMissing: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const ticks = [0, 0.5, 1].map((p) => ({ p, v: scale.valueAt(p) }));

  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3 text-xs text-[var(--text-secondary)]">
      <figure className="m-0">
        <figcaption className="mb-1">
          <span className="font-medium text-[var(--text-primary)]">{RAMP_NAME}</span> colour ramp,
          square-root scale · one scale for raw and harmonized
        </figcaption>
        <svg width={W + 24} height={30} aria-hidden="true" className="overflow-visible">
          <defs>
            <linearGradient id={`${uid}-ramp`}>
              {Array.from({ length: STOPS + 1 }, (_, i) => (
                <stop key={i} offset={i / STOPS} stopColor={scale.colorAt(i / STOPS, theme)} />
              ))}
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={W} height={10} rx={2} fill={`url(#${uid}-ramp)`} />
          {ticks.map(({ p, v }) => (
            <g key={p}>
              <line x1={p * W} x2={p * W} y1={10} y2={14} stroke="var(--baseline)" />
              <text
                x={p * W}
                y={26}
                textAnchor={p === 0 ? "start" : p === 1 ? "end" : "middle"}
                className="tabular fill-[var(--text-secondary)] text-[11px]"
              >
                {formatValue(v, mode, false)}
              </text>
            </g>
          ))}
        </svg>
        <p className="sr-only">
          {`Scale from ${formatValue(scale.min, mode, false)} to ${formatValue(scale.max, mode, false)} per month.`}
        </p>
      </figure>
      {showMissing ? (
        <div className="flex items-center gap-2 pb-3">
          <svg width={16} height={12} aria-hidden="true">
            <defs>
              <pattern id={`${uid}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="5" stroke={MISSING_HATCH[theme]} strokeWidth="1.2" />
              </pattern>
            </defs>
            <rect width={16} height={12} rx={2} fill={MISSING_FILL[theme]} />
            <rect width={16} height={12} rx={2} fill={`url(#${uid}-hatch)`} />
          </svg>
          <span>no data (not zero)</span>
        </div>
      ) : null}
    </div>
  );
}
