"use client";

import { useEffect, useState } from "react";
import { MONTHS, RAMP, fmt, rampIndex } from "@/lib/ember";
import { loadJson } from "@/lib/queries";
import type { CalendarRow } from "@/lib/types";

interface MonthCell { harmonized: number; n_raw: number; days_covered: number; days_in_month: number; source: string }
interface File2026 { generated_utc: string; window_utc: [string, string]; label: string; countries: Record<string, Record<string, MonthCell | null>> }

let cache: Promise<File2026 | null> | null = null;
const get2026 = () => (cache ??= loadJson<File2026>("calendar_2026.json").catch(() => null));

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/**
 * 2026 so far, on the harmonized scale, as one more calendar row: NOAA-20 run through the
 * published fit and the country's bridge (validated on held-out 2022-2023). Same colour scale
 * as the calendar above, each month set against the median of that month 2003-2025.
 */
export function Year2026({ country, harm, max }: { country: string; harm: CalendarRow[]; max: number }) {
  const [f, setF] = useState<File2026 | null | undefined>(undefined);
  useEffect(() => { let on = true; get2026().then((d) => on && setF(d)); return () => { on = false; }; }, []);
  if (!f) return null;
  const c = f.countries[country];
  if (!c) return (
    <p className="mt-3 text-xs text-[var(--text-muted)]" data-testid="year-2026">2026 on the harmonized scale: not recorded for this area (the NOAA-20 bridge has been run for this area only where noted).</p>
  );
  const usual = MONTHS.map((_, i) => median(harm.filter((r) => r.month === i + 1 && r.year >= 2003 && r.year <= 2025 && r.value != null).map((r) => r.value as number)));
  return (
    <div className="mt-4 rounded-2xl border border-[var(--hairline)] p-4" data-testid="year-2026">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-primary)]"><span className="text-[var(--red)]">●</span> 2026 so far · harmonized · provisional</p>
        <p className="text-[11px] text-[var(--text-muted)]">to {f.window_utc[1]} · NOAA-20 through the tested bridge</p>
      </div>
      <div className="mt-3 grid gap-[3px]" style={{ gridTemplateColumns: "2.6rem repeat(12, minmax(0, 1fr))" }}>
        <span className="tabular flex items-center font-mono text-[11px] font-bold text-[var(--red)]">2026</span>
        {MONTHS.map((m, i) => {
          const cell = c[`2026-${String(i + 1).padStart(2, "0")}`];
          const v = cell ? cell.harmonized : null;
          const partial = !!cell && cell.days_covered < cell.days_in_month;
          const idx = rampIndex(v, max);
          const u = usual[i];
          // A month in progress is set against the median at its straight-line pace, not at its partial total.
          const pace = cell && v != null ? (v * cell.days_in_month) / cell.days_covered : null;
          const label = cell === undefined ? `${m} 2026: not yet` : cell === null ? `${m} 2026: not recorded` : `${m} 2026: ${fmt(v)} harmonized detections${partial ? ` (${cell.days_covered} of ${cell.days_in_month} days)` : ""}${u && pace != null ? `, ×${(pace / u).toFixed(1)} a usual ${m}${partial ? " at its current pace" : ""}` : ""}`;
          return (
            <div key={m} title={label} aria-label={label} role="img" className="flex flex-col items-center gap-1">
              <span className="h-[22px] w-full rounded-[4px]" style={{ background: idx === null ? "repeating-linear-gradient(135deg, transparent 0 3px, var(--hairline) 3px 4px)" : RAMP[idx], outline: partial ? "1.5px dashed var(--text-primary)" : undefined, outlineOffset: -1.5 }} />
              <span className="tabular text-[10px] leading-tight text-[var(--text-secondary)]">{v == null ? "–" : fmt(Math.round(v))}</span>
              {pace != null && u ? <span className={`tabular text-[10px] leading-tight ${pace / u >= 1.25 ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`}>×{(pace / u).toFixed(1)}{partial ? "*" : ""}</span> : null}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Each cell: harmonized detections, and below it the month against its 2003–2025 median. A dashed outline and * mark a month still in progress, compared at its current pace. Source: NOAA-20 VIIRS from NASA FIRMS (standard processing, then near-real-time), run through the same fit and this country&apos;s bridge, which matched the record within a median 7% on held-out 2022–2023. Provisional until NASA&apos;s archive covers 2026.
      </p>
    </div>
  );
}
