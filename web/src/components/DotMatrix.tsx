"use client";

import { useInView } from "motion/react";
import { memo, useRef, useSyncExternalStore } from "react";

/**
 * Current time on the client, null during server render. `useNow` ticks each
 * second and should only be used by small leaf components (the dot clock);
 * `useToday` ticks once a minute, for date labels.
 */
const ticker = (ms: number) => {
  let cached = 0;
  return {
    subscribe: (cb: () => void) => { const t = setInterval(cb, ms); return () => clearInterval(t); },
    snap: () => { const n = Math.floor(Date.now() / ms) * ms; if (n !== cached) cached = n; return cached; },
  };
};
const perSecond = ticker(1000), perMinute = ticker(60_000);
const server = () => 0;
export function useNow(): Date | null {
  const t = useSyncExternalStore(perSecond.subscribe, perSecond.snap, server);
  return t ? new Date(t) : null;
}
export function useToday(): Date | null {
  const t = useSyncExternalStore(perMinute.subscribe, perMinute.snap, server);
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
  "-": ["000", "000", "000", "111", "000", "000", "000"],
  "+": ["000", "000", "010", "111", "010", "000", "000"],
  ",": ["0", "0", "0", "0", "0", "1", "1"],
  "×": ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
};
G["−"] = G["-"]; G["—"] = ["0000", "0000", "0000", "1111", "0000", "0000", "0000"];

/** True when every character has a dot-matrix glyph. */
export const dotable = (t: string) => [...t.toUpperCase()].every((c) => c in G);

/**
 * A key stat in dot-matrix numerals, falling back to the plain text when a
 * character has no glyph. Same dot rhythm as the home widgets (gap ≈ dot/3).
 */
export function DotStat({ text, dot = 6, className = "" }: { text: string; dot?: number; className?: string }) {
  if (!dotable(text)) return <span className={className}>{text}</span>;
  return <DotText text={text} dot={dot} gap={dot / 3} className={className} />;
}

/** A dotted divider: a row of dim dots with an ember one leading. */
export function DotRule({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`dot-rule ${className}`} />
  );
}

/** Dot-matrix loading state: a 3x3 grid of dots lighting in a ripple. */
export function DotLoader({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex flex-col items-center gap-3">
      <span className="dot-loader" aria-hidden>{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ animationDelay: `${((i % 3) + Math.floor(i / 3)) * 90}ms` }} />)}</span>
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</span>
    </span>
  );
}

/**
 * Text drawn as a dot-matrix display. Plain circles (memoized, no per-dot
 * animation); on first view the whole display wipes in left to right with one
 * clip-path animation (.dot-wipe in globals.css).
 */
export const DotText = memo(function DotText({ text, dot = 7, gap = 2.4, lit = "currentColor", dim = "rgba(127,127,127,0.12)", className = "" }:
  { text: string; dot?: number; gap?: number; lit?: string; dim?: string; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true });
  const step = dot + gap;
  let x = 0;
  const on: string[] = [], off: string[] = [];
  for (const ch of text.toUpperCase()) {
    const g = G[ch] ?? G[" "];
    g.forEach((row, r) => [...row].forEach((v, c) => (v === "1" ? on : off).push(`M${x + c * step + dot / 2 - dot / 2},${r * step + dot / 2}a${dot / 2},${dot / 2} 0 1,0 ${dot},0a${dot / 2},${dot / 2} 0 1,0 ${-dot},0`)));
    x += g[0].length * step + step;
  }
  const w = Math.max(0, x - step), h = 7 * step - gap;
  return (
    <svg ref={ref} viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={`max-w-full ${seen ? "dot-wipe" : "opacity-0"} ${className}`} role="img" aria-label={text}>
      <path d={off.join("")} fill={dim} />
      <path d={on.join("")} fill={lit} />
    </svg>
  );
});

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
