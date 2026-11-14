"use client";

import { useMemo, useState } from "react";
import { MONTHS, RAMP, fmt, rampIndex } from "@/lib/ember";
import type { CalendarResult } from "@/lib/types";

/** Radial calendar: one ring per year (inside = oldest), one slice per month. */
export function FirePulse({ cal, from = 2003, to = 2025, size = 520 }: { cal: CalendarResult; from?: number; to?: number; size?: number }) {
  const [hover, setHover] = useState<{ y: number; m: number; v: number | null } | null>(null);
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const c = size / 2, inner = size * 0.12, outer = size * 0.47;
  const ring = (outer - inner) / years.length;
  const max = Math.max(1, ...cal.rows.filter((r) => r.year >= from && r.year <= to).map((r) => r.value ?? 0));
  const arc = (r0: number, r1: number, a0: number, a1: number) => {
    const p = (r: number, a: number) => `${c + r * Math.sin(a)},${c - r * Math.cos(a)}`;
    return `M${p(r0, a0)} L${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
  };
  // Built once per data/range change: hovering re-renders only the centre label's inputs, not 276 animated paths.
  const slices = useMemo(() => years.flatMap((y, yi) => MONTHS.map((_, mi) => {
    const row = cal.rows.find((r) => r.year === y && r.month === mi + 1);
    const idx = rampIndex(row?.value ?? null, max);
    const a0 = (mi / 12) * Math.PI * 2 + 0.006, a1 = ((mi + 1) / 12) * Math.PI * 2 - 0.006;
    return { k: `${y}-${mi}`, y, m: mi + 1, v: row?.value ?? null, d: arc(inner + yi * ring + 0.4, inner + (yi + 1) * ring - 0.4, a0, a1), fill: idx === null ? "var(--surface-2)" : RAMP[idx] };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [cal, from, to, size]);
  return (
    <div className="relative mx-auto" style={{ maxWidth: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="Radial burning calendar">
        <g className="fade-in">{slices.map((sl) => (
          <path key={sl.k} d={sl.d} fill={sl.fill}
            onMouseEnter={() => setHover({ y: sl.y, m: sl.m, v: sl.v })} onMouseLeave={() => setHover(null)}
            className="cursor-pointer hover:opacity-80" />
        ))}</g>
        {MONTHS.map((m, mi) => {
          const a = ((mi + 0.5) / 12) * Math.PI * 2, r = outer + 14;
          return <text key={m} x={c + r * Math.sin(a)} y={c - r * Math.cos(a) + 3.5} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{m}</text>;
        })}
        <circle cx={c} cy={c} r={inner - 4} fill="var(--surface-1)" stroke="var(--hairline)" />
        <text x={c} y={c - 4} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">{hover ? `${MONTHS[hover.m - 1]} ${hover.y}` : `${from} → ${to}`}</text>
        <text x={c} y={c + 14} textAnchor="middle" fontSize="13" className="tabular" fill="var(--text-primary)">{hover ? fmt(hover.v) : "inside → out"}</text>
      </svg>
    </div>
  );
}
