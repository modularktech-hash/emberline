"use client";

import { motion } from "motion/react";
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

/** Annual totals. The active series morphs between raw and harmonized — the only animation in the app. */
export function AnnualLine({ raw, harmonized, mode }: { raw: YearTotal[]; harmonized: YearTotal[]; mode: Series }) {
  const max = Math.max(1, ...raw.map((t) => t.value ?? 0), ...harmonized.map((t) => t.value ?? 0)) * 1.06;
  const active = mode === "raw" ? raw : harmonized;
  const years = raw.map((t) => t.year);
  const x = (year: number) => L + ((year - years[0]) / Math.max(1, years.length - 1)) * (W - L - R);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const has2012 = years[0] <= 2011 && years[years.length - 1] >= 2012;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Annual detections, ${mode}`}>
      <defs>
        <linearGradient id="glow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff7a1a" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ff7a1a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((v) => {
        const y = T + (1 - v / max) * (H - T - B);
        return (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--gridline)" />
            <text x={L - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)" className="tabular">{fmtCompact(v)}</text>
          </g>
        );
      })}
      {years.filter((y) => y % 4 === 0 || y === years[0]).map((y) => (
        <text key={y} x={x(y)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-muted)" className="tabular">{y}</text>
      ))}
      {has2012 && (
        <g>
          <line x1={x(2011.5)} x2={x(2011.5)} y1={T} y2={H - B} stroke="var(--text-muted)" strokeDasharray="3 4" />
          <text x={x(2011.5) + 6} y={T + 10} fontSize="10" fill="var(--text-secondary)">2012 · VIIRS begins</text>
        </g>
      )}
      <path d={path(mode === "raw" ? harmonized : raw, max)} fill="none" stroke="var(--text-muted)" strokeWidth="1.2" strokeDasharray="2 4" opacity="0.7" />
      <motion.path
        d={`${path(active, max)} L${W - R},${H - B} L${L},${H - B} Z`}
        animate={{ d: `${path(active, max)} L${W - R},${H - B} L${L},${H - B} Z` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        fill="url(#glow)"
      />
      <motion.path
        d={path(active, max)}
        animate={{ d: path(active, max) }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        fill="none" stroke="var(--ember)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  );
}
