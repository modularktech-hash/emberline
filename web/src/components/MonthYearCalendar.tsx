"use client";

import { useState } from "react";
import { MONTHS, RAMP, RAMP_NAME, fmt, fmtCompact, rampBreaks, rampIndex } from "@/lib/ember";
import type { CalendarResult } from "@/lib/types";

const BASIS: Record<string, string> = {
  MODIS: "raw MODIS (Terra + Aqua)",
  VIIRS: "raw VIIRS (Suomi-NPP)",
  observed_aqua: "observed Aqua MODIS",
  predicted_from_viirs: "Aqua-equivalent, predicted from VIIRS",
};

export type CellRef = { year: number; month: number };

/**
 * The burning activity calendar: one row per year, one column per month.
 * Hover or focus previews a month; click, tap or Enter selects it, and the
 * detail strip keeps showing the selection (controlled by `selected` /
 * `onSelect` when given, so it survives a raw/harmonized switch).
 */
export function MonthYearCalendar({ cal, from, to, max, selected, onSelect, areaName }: {
  cal: CalendarResult; from: number; to: number; max: number;
  selected?: CellRef | null; onSelect?: (c: CellRef | null) => void; areaName?: string;
}) {
  const [hover, setHover] = useState<CellRef | null>(null);
  const [ownSel, setOwnSel] = useState<CellRef | null>(null);
  const sel = selected !== undefined ? selected : ownSel;
  const choose = (c: CellRef) => { const same = sel && sel.year === c.year && sel.month === c.month; (onSelect ?? setOwnSel)(same ? null : c); };
  const shownCell = hover ?? sel;
  const years: number[] = [];
  for (let y = from; y <= to; y += 1) years.push(y);
  const at = (y: number, m: number) => cal.rows.find((r) => r.year === y && r.month === m);
  const h = shownCell ? at(shownCell.year, shownCell.month) : null;
  const breaks = rampBreaks(max);
  return (
    <div>
      {/* On phones the matrix keeps readable cells (>= 28 px) and scrolls sideways inside this box, year labels pinned. */}
      <div className="max-w-full overflow-x-auto overscroll-x-contain" tabIndex={0} role="region" aria-label="Burning activity calendar, months by year (scrolls sideways on small screens)">
      <div className="cal-wipe grid min-w-[26.5rem] gap-[3px] sm:min-w-0" style={{ gridTemplateColumns: "2.6rem repeat(12, minmax(28px, 1fr))" }} onMouseLeave={() => setHover(null)}>
        <div />
        {MONTHS.map((m) => (
          <div key={m} className="pb-1 text-center text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{m}</div>
        ))}
        {years.map((y, yi) => (
          <div key={y} className="contents">
            <div className={`tabular sticky left-0 z-[1] flex items-center bg-[var(--surface-page)] text-[11px] ${y === 2012 ? "text-[var(--ember)]" : "text-[var(--text-muted)]"}`}>{y}</div>
            {MONTHS.map((_, mi) => {
              const row = at(y, mi + 1);
              const idx = rampIndex(row?.value ?? null, max);
              return (
                <button
                  key={mi}
                  type="button"
                  onMouseEnter={() => setHover({ year: y, month: mi + 1 })}
                  onFocus={() => setHover({ year: y, month: mi + 1 })}
                  onBlur={() => setHover(null)}
                  onClick={() => choose({ year: y, month: mi + 1 })}
                  aria-pressed={!!sel && sel.year === y && sel.month === mi + 1}
                  aria-label={`${MONTHS[mi]} ${y}: ${row?.value == null ? "no data" : fmt(row.value)}`}
                  className={`h-[28px] rounded-[4px] outline-none ring-[var(--text-primary)] hover:ring-1 focus-visible:ring-2 sm:h-[22px] ${sel && sel.year === y && sel.month === mi + 1 ? "ring-2 ring-[var(--ink)]" : ""}`}
                  style={{
                    background: idx === null ? "repeating-linear-gradient(135deg, transparent 0 3px, rgba(18,23,21,0.1) 3px 4px)" : RAMP[idx],
                    transition: `background-color 600ms cubic-bezier(0.22,1,0.36,1) ${yi * 14}ms`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-[var(--text-secondary)]">
        <div className="tabular min-h-[1.25rem]" aria-live="polite">
          {shownCell && h ? (
            <span>
              <span className="font-medium text-[var(--text-primary)]">{MONTHS[shownCell.month - 1]} {shownCell.year}</span>
              {areaName && <> · {areaName}</>} · {cal.mode === "raw" ? "Raw detections (uncorrected)" : "Harmonized, Aqua-equivalent detections"} ·{" "}
              {h.value == null ? "no data" : <span className="text-[var(--ember)]">{fmt(h.value)}</span>}
              <span className="text-[var(--text-muted)]"> · {BASIS[h.basis]}{sel && !hover ? " · selected (click again to clear)" : ""}</span>
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">Hover, tap or focus a month for its count; click or press Enter to keep it.</span>
          )}
        </div>
        <div className="flex items-center gap-2" aria-label={`Colour scale: ${RAMP_NAME}`}>
          <span className="tabular text-[10px] text-[var(--text-muted)]">0</span>
          {RAMP.map((c, i) => (
            <span key={c} title={i === 0 ? "0" : `≥ ${fmt(breaks[i - 1])}`} className="h-3 w-5 rounded-[3px]" style={{ background: c }} />
          ))}
          <span className="tabular text-[10px] text-[var(--text-muted)]">{fmtCompact(max)}</span>
          <span className="ml-2 hidden text-[10px] text-[var(--text-muted)] sm:inline">{RAMP_NAME}, √ scale</span>
        </div>
      </div>
    </div>
  );
}
