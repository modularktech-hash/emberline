"use client";

import { motion } from "motion/react";
import { useSyncExternalStore } from "react";

/** Current time, ticking each second on the client; null during server render. */
let cached = 0;
const subscribe = (cb: () => void) => { const t = setInterval(cb, 1000); return () => clearInterval(t); };
const snap = () => { const n = Math.floor(Date.now() / 1000) * 1000; if (n !== cached) cached = n; return cached; };
export function useNow(): Date | null {
  const t = useSyncExternalStore(subscribe, snap, () => 0);
  return t ? new Date(t) : null;
}

/* 5x7 dot-matrix glyphs, rows top to bottom, 1 = lit. */
const G: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  ".": ["0", "0", "0", "0", "0", "0", "1"],
  ":": ["0", "0", "1", "0", "1", "0", "0"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  " ": ["00", "00", "00", "00", "00", "00", "00"],
};

/** Text drawn as a dot-matrix display; dots light up in sequence on first view. */
export function DotText({ text, dot = 7, gap = 2.4, lit = "currentColor", dim = "rgba(127,127,127,0.12)", className = "" }:
  { text: string; dot?: number; gap?: number; lit?: string; dim?: string; className?: string }) {
  const step = dot + gap;
  let x = 0;
  const cells: { cx: number; cy: number; on: boolean; k: string }[] = [];
  for (const [ci, ch] of [...text.toUpperCase()].entries()) {
    const g = G[ch] ?? G[" "];
    g.forEach((row, r) => [...row].forEach((v, c) => cells.push({ cx: x + c * step + dot / 2, cy: r * step + dot / 2, on: v === "1", k: `${ci}-${r}-${c}` })));
    x += g[0].length * step + step;
  }
  const w = Math.max(0, x - step), h = 7 * step - gap;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={`max-w-full ${className}`} role="img" aria-label={text}>
      {cells.map((d, i) => (
        <motion.circle key={d.k} cx={d.cx} cy={d.cy} r={dot / 2} fill={d.on ? lit : dim}
          initial={d.on ? { opacity: 0, scale: 0.3 } : false} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
          transition={{ delay: (i % 60) * 0.006, duration: 0.25 }} style={{ transformOrigin: `${d.cx}px ${d.cy}px` }} />
      ))}
    </svg>
  );
}

/** A dotted analogue clock in UTC, the time base every FIRMS record uses. */
export function DotClock({ size = 150 }: { size?: number }) {
  const now = useNow();
  const c = size / 2, R = size / 2 - 10;
  const hand = (frac: number, len: number, n: number, r: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = frac * 2 * Math.PI - Math.PI / 2, d = ((i + 1) / n) * len;
      return <circle key={i} cx={c + Math.cos(a) * d} cy={c + Math.sin(a) * d} r={r} fill="currentColor" />;
    });
  const h = now ? (now.getUTCHours() % 12 + now.getUTCMinutes() / 60) / 12 : 0;
  const m = now ? (now.getUTCMinutes() + now.getUTCSeconds() / 60) / 60 : 0;
  const s = now ? now.getUTCSeconds() / 60 : 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-label="Current UTC time">
      {[0, 0.25, 0.5, 0.75].map((f) => <circle key={f} cx={c + Math.cos(f * 2 * Math.PI) * R} cy={c + Math.sin(f * 2 * Math.PI) * R} r={2} fill="currentColor" opacity={0.35} />)}
      {now && <>{hand(h, R * 0.5, 5, 3.2)}{hand(m, R * 0.82, 9, 2.4)}<circle cx={c + Math.cos(s * 2 * Math.PI - Math.PI / 2) * R} cy={c + Math.sin(s * 2 * Math.PI - Math.PI / 2) * R} r={3.4} fill="var(--ember)" /></>}
      <circle cx={c} cy={c} r={3.4} fill="currentColor" />
    </svg>
  );
}

/** Compact form for a dot display: 120306 -> 120K, 4523110 -> 4.5M. */
export const dotCompact = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}K` : String(Math.round(v)));
