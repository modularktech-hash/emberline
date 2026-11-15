"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { useChartScale } from "@/lib/useChartScale";
import { fmtCompact, type YearTotal } from "@/lib/ember";
import type { Series } from "@/lib/types";

const W = 720, H = 250, L = 44, R = 14, T = 16, B = 28;

function path(totals: YearTotal[], max: number): string {
  const n = totals.length;
  return totals
    .map((t, i) => {
      const x = L + (i / Math.max(1, n - 1)) * (W - L - R);
      const y = T + (1 - (t.value ?? 0) / max) * (H - T - B);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Annual totals. The active series morphs between raw and harmonized; raw is always blue, harmonized always ember. Hover or tap for a year's values. */
export function AnnualLine({ raw, harmonized, mode }: { raw: YearTotal[]; harmonized: YearTotal[]; mode: Series }) {
  const { ref, fs, narrow } = useChartScale(W);
  const [hi, setHi] = useState<number | null>(null);
  const tone = mode === "raw" ? "var(--c-raw)" : "var(--c-harm)", otherTone = mode === "raw" ? "var(--c-harm)" : "var(--c-raw)";
  const max = Math.max(1, ...raw.map((t) => t.value ?? 0), ...harmonized.map((t) => t.value ?? 0)) * 1.06;
  const active = mode === "raw" ? raw : harmonized;
  const years = raw.map((t) => t.year);
  const x = (year: number) => L + ((year - years[0]) / Math.max(1, years.length - 1)) * (W - L - R);
  const ticks = (narrow ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => f * max);
  const has2012 = years[0] <= 2011 && years[years.length - 1] >= 2012;
  if (years.length === 1) {
    // One year: a single labelled bar (a line or area needs two points).
    const one = active[0]?.value ?? null, other = (mode === "raw" ? harmonized : raw)[0]?.value ?? null;
    const top = (v: number) => T + (1 - v / max) * (H - T - B);
    return (
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Detections in ${years[0]}, ${mode}: ${one == null ? "no data" : Math.round(one)}`}>
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--gridline)" />
        {other != null && <rect x={W / 2 + 46} width={60} y={top(other)} height={H - B - top(other)} rx="4" fill="var(--text-muted)" opacity="0.25" />}
        {one != null && <rect x={W / 2 - 46} width={80} y={top(one)} height={H - B - top(one)} rx="4" fill="var(--ember)" />}
        <text x={W / 2 - 6} y={one != null ? top(one) - 8 : H / 2} textAnchor="middle" fontSize={fs(13)} fill="var(--text-primary)" className="tabular">{one == null ? "no data" : fmtCompact(one)}</text>
        {other != null && <text x={W / 2 + 76} y={top(other) - 8} textAnchor="middle" fontSize={fs(10)} fill="var(--text-muted)" className="tabular">{mode === "raw" ? "harm." : "raw"} {fmtCompact(other)}</text>}
        <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={fs(11)} fill="var(--text-muted)" className="tabular">{years[0]}</text>
      </svg>
    );
  }
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y overflow-visible" role="img" aria-label={`Annual detections, ${mode}`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const vx = ((e.clientX - r.left) / r.width) * W;
        setHi(Math.max(0, Math.min(years.length - 1, Math.round(((vx - L) / (W - L - R)) * (years.length - 1)))));
      }}
      onPointerLeave={() => setHi(null)}>
      <defs>
        <linearGradient id="glow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={tone} stopOpacity="0.2" />
          <stop offset="1" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((v) => {
        const y = T + (1 - v / max) * (H - T - B);
        return (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--gridline)" />
            <text x={L - 8} y={y + 3.5} textAnchor="end" fontSize={fs(10)} fill="var(--text-muted)" className="tabular">{fmtCompact(v)}</text>
          </g>
        );
      })}
      {years.filter((y) => (narrow ? y % 8 === 0 : y % 4 === 0) || y === years[0]).map((y) => (
        <text key={y} x={x(y)} y={H - 8} textAnchor="middle" fontSize={fs(10)} fill="var(--text-muted)" className="tabular">{y}</text>
      ))}
      {has2012 && (
        <g>
          <line x1={x(2011.5)} x2={x(2011.5)} y1={T} y2={H - B} stroke="var(--text-muted)" strokeDasharray="3 4" />
          <text x={x(2011.5) + 6} y={T + 10} fontSize={fs(10)} fill="var(--text-secondary)">{narrow ? "2012" : "2012 · VIIRS record begins"}</text>
        </g>
      )}
      <path d={path(mode === "raw" ? harmonized : raw, max)} fill="none" stroke={otherTone} strokeWidth="1.5" strokeDasharray="1 5" strokeLinecap="round" opacity="0.8" />
      <motion.path
        key={`area-${years[0]}-${years.length}`}
        initial={false}
        d={`${path(active, max)} L${W - R},${H - B} L${L},${H - B} Z`}
        animate={{ d: `${path(active, max)} L${W - R},${H - B} L${L},${H - B} Z` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        fill="url(#glow)"
      />
      <motion.path
        key={`line-${years[0]}-${years.length}`}
        initial={false}
        d={path(active, max)}
        animate={{ d: path(active, max) }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        fill="none" stroke={tone} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round"
      />
      {hi != null && (() => {
        const yr = years[hi], a = active[hi]?.value ?? null, o = (mode === "raw" ? harmonized : raw)[hi]?.value ?? null;
        const yOf = (v: number) => T + (1 - v / max) * (H - T - B);
        const left = x(yr) > W * 0.62;
        return (
          <g pointerEvents="none">
            <line x1={x(yr)} x2={x(yr)} y1={T} y2={H - B} stroke="var(--text-primary)" strokeWidth="1" />
            {o != null && <circle cx={x(yr)} cy={yOf(o)} r="3.5" fill="var(--surface)" stroke={otherTone} strokeWidth="1.5" />}
            {a != null && <circle cx={x(yr)} cy={yOf(a)} r="4.5" fill={tone} stroke="var(--surface)" strokeWidth="1.5" />}
            <g transform={`translate(${x(yr) + (left ? -10 : 10)} ${T + 4})`} textAnchor={left ? "end" : "start"} fontFamily="var(--font-code)" fontSize={fs(10.5)}>
              <text fill="var(--text-primary)" fontWeight="700">{yr}</text>
              <text y={fs(14)} fill={tone}>{mode === "raw" ? "raw" : "harmonized"} {a == null ? "no data" : fmtCompact(a)}</text>
              <text y={fs(28)} fill={otherTone}>{mode === "raw" ? "harmonized" : "raw"} {o == null ? "no data" : fmtCompact(o)}</text>
            </g>
          </g>
        );
      })()}
    </svg>
  );
}
