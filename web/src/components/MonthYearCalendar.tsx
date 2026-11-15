"use client";

import { useRef, useState, type KeyboardEvent } from "react";
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
export function MonthYearCalendar({ cal, from, to, max, selected, onSelect, areaName, inRange }: {
  cal: CalendarResult; from: number; to: number; max: number;
  selected?: CellRef | null; onSelect?: (c: CellRef | null) => void; areaName?: string;
  /** R8: months outside a month-level date range are shown faded and say so. */
  inRange?: (c: CellRef) => boolean;
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
  // Roving tabindex (E22): the grid is one Tab stop; arrows move by month (left/right) and
  // year (up/down), Home/End jump within a year, Ctrl+Home/End to the corners, Enter/Space
  // select, Escape returns focus to the scroll region so a further Tab leaves.
  const [cursor, setCursor] = useState<CellRef | null>(null);
  const [asTable, setAsTable] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const clampY = (y: number) => Math.min(to, Math.max(from, y));
  const active: CellRef = cursor && cursor.year >= from && cursor.year <= to ? cursor : sel && sel.year >= from && sel.year <= to ? sel : { year: from, month: 1 };
  const unit = cal.mode === "raw" ? "raw detections (uncorrected)" : "harmonized Aqua-equivalent detections";
  const cellName = (y: number, m: number) => {
    const row = at(y, m);
    return `${MONTHS[m - 1]} ${y}: ${row?.value == null ? "no data" : `${fmt(row.value)} ${unit}`}${row ? `, basis ${BASIS[row.basis] ?? row.basis}` : ""}${inRange && !inRange({ year: y, month: m }) ? ", outside the selected date range" : ""}`;
  };
  const focusCell = (c: CellRef) => {
    setCursor(c);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${c.year}-${c.month}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const { year: y, month: m } = active;
    let next: CellRef | null = null;
    switch (e.key) {
      case "ArrowRight": next = m < 12 ? { year: y, month: m + 1 } : y < to ? { year: y + 1, month: 1 } : null; break;
      case "ArrowLeft": next = m > 1 ? { year: y, month: m - 1 } : y > from ? { year: y - 1, month: 12 } : null; break;
      case "ArrowDown": next = { year: clampY(y + 1), month: m }; break;
      case "ArrowUp": next = { year: clampY(y - 1), month: m }; break;
      case "Home": next = e.ctrlKey ? { year: from, month: 1 } : { year: y, month: 1 }; break;
      case "End": next = e.ctrlKey ? { year: to, month: 12 } : { year: y, month: 12 }; break;
      case "Enter": case " ": e.preventDefault(); choose(active); return;
      case "Escape": e.preventDefault(); setHover(null); regionRef.current?.focus(); return;
      default: return;
    }
    e.preventDefault();
    if (next) focusCell(next);
  };
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
          className="rounded-full border border-[var(--hairline)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          {asTable ? "Show as calendar" : "Show as table"}
        </button>
      </div>
      {asTable ? (
        <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Burning activity table, months by year">
          <table className="tabular w-full min-w-[40rem] text-right text-[11px]">
            <caption className="mb-1 text-left text-xs text-[var(--text-secondary)]">{areaName ? `${areaName} · ` : ""}Monthly {unit}, {from}–{to}. Cells marked * are {BASIS.predicted_from_viirs}.</caption>
            <thead><tr><th scope="col" className="text-left font-normal text-[var(--text-muted)]">Year</th>{MONTHS.map((mm) => <th key={mm} scope="col" className="px-1 font-normal text-[var(--text-muted)]">{mm}</th>)}</tr></thead>
            <tbody>
              {years.map((y) => (
                <tr key={y}>
                  <th scope="row" className="text-left font-normal text-[var(--text-muted)]">{y}</th>
                  {MONTHS.map((_, mi) => { const row = at(y, mi + 1); return <td key={mi} className="px-1" title={row ? BASIS[row.basis] : undefined}>{row?.value == null ? "–" : fmt(row.value)}{row?.basis === "predicted_from_viirs" ? "*" : ""}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (<>
      {/* On phones the matrix keeps readable cells (>= 28 px) and scrolls sideways inside this box, year labels pinned. */}
      <div ref={regionRef} className="max-w-full overflow-x-auto overscroll-x-contain outline-none focus-visible:ring-2 ring-[var(--text-primary)]" tabIndex={-1} role="region" aria-label="Burning activity calendar, months by year (scrolls sideways on small screens)">
      <div ref={gridRef} role="grid" aria-label={`Burning activity calendar${areaName ? `, ${areaName}` : ""}: ${unit}. Arrow keys move by month and year, Enter selects, Escape leaves.`} aria-rowcount={years.length + 1} aria-colcount={13} onKeyDown={onKey} className="cal-wipe grid min-w-[26.5rem] gap-[3px] sm:min-w-0" style={{ gridTemplateColumns: "2.6rem repeat(12, minmax(28px, 1fr))" }} onMouseLeave={() => setHover(null)}>
        <div role="row" className="contents">
        <div role="columnheader"><span className="sr-only">Year</span></div>
        {MONTHS.map((m) => (
          <div key={m} role="columnheader" className="pb-1 text-center text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{m}</div>
        ))}
        </div>
        {years.map((y, yi) => (
          <div key={y} role="row" className="contents">
            <div role="rowheader" className={`tabular sticky left-0 z-[1] flex items-center bg-[var(--surface)] font-mono text-[11px] ${y === 2012 ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`}>{y}</div>
            {MONTHS.map((_, mi) => {
              const row = at(y, mi + 1);
              const idx = rampIndex(row?.value ?? null, max);
              return (
                <div role="gridcell" key={mi} className="contents" aria-selected={!!sel && sel.year === y && sel.month === mi + 1}>
                <button
                  type="button"
                  data-cell={`${y}-${mi + 1}`}
                  tabIndex={active.year === y && active.month === mi + 1 ? 0 : -1}
                  onMouseEnter={() => setHover({ year: y, month: mi + 1 })}
                  onFocus={() => { setCursor({ year: y, month: mi + 1 }); setHover({ year: y, month: mi + 1 }); }}
                  onBlur={() => setHover(null)}
                  onClick={() => { setCursor({ year: y, month: mi + 1 }); choose({ year: y, month: mi + 1 }); }}
                  aria-label={cellName(y, mi + 1)}
                  className={`h-[28px] rounded-[4px] outline-none ring-[var(--text-primary)] hover:ring-1 focus-visible:ring-2 sm:h-[22px] ${sel && sel.year === y && sel.month === mi + 1 ? "ring-2 ring-[var(--ink)]" : ""}`}
                  style={{
                    background: idx === null ? "repeating-linear-gradient(135deg, transparent 0 3px, var(--hairline) 3px 4px)" : RAMP[idx],
                    opacity: inRange && !inRange({ year: y, month: mi + 1 }) ? 0.18 : undefined,
                    transition: `background-color 600ms cubic-bezier(0.22,1,0.36,1) ${yi * 14}ms`,
                    ["--ci" as string]: yi + mi,
                  }}
                />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>
      </>)}
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
