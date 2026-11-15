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
/** Diverging, colour-blind-safe steps for the anomaly view: blue below a usual month, neutral near it, orange to red above. */
const ANOM_STEPS = [
  { below: 0.5, color: "#2f6db0", label: "under ×0.5" },
  { below: 0.8, color: "#9dc0e6", label: "×0.5–0.8" },
  { below: 1.25, color: "#dcdcd6", label: "usual" },
  { below: 2, color: "#f5b97a", label: "×1.25–2" },
  { below: 4, color: "#e2702a", label: "×2–4" },
  { below: Infinity, color: "#b3261e", label: "over ×4" },
];

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
  // Anomaly view: each month against the median of the same calendar month over every year in the record.
  const [anom, setAnom] = useState(false);
  const usual = MONTHS.map((_, mi) => {
    const v = cal.rows.filter((r) => r.month === mi + 1 && r.value != null).map((r) => r.value as number).sort((a, b) => a - b);
    const n = v.length;
    return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null;
  });
  const ratioOf = (value: number | null | undefined, m: number) => { const u = usual[m - 1]; return value == null || u == null || u <= 0 ? null : value / u; };
  const anomIdx = (ratio: number) => ANOM_STEPS.findIndex((st) => ratio < st.below);
  // Roving tabindex (E22): the grid is one Tab stop; arrows move by month (left/right) and
  // year (up/down), Home/End jump within a year, Ctrl+Home/End to the corners, Enter/Space
  // select, Escape returns focus to the scroll region so a further Tab leaves.
  const [cursor, setCursor] = useState<CellRef | null>(null);
  const [asTable, setAsTable] = useState(false);
  // Year scrubbing: a slider that picks one year, outlines its row and reads out its total.
  const [scrub, setScrub] = useState<number | null>(null);
  const yearTotal = (y: number) => { const v = cal.rows.filter((r) => r.year === y && r.value !== null); return v.length ? v.reduce((a, r) => a + (r.value ?? 0), 0) : null; };
  // A gentle tilt of the whole calendar under a mouse (3 degrees at most); none in low-power or reduced-motion mode.
  const tilt = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || document.documentElement.dataset.perf === "low" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    el.style.setProperty("--ty", `${(((e.clientX - r.left) / r.width - 0.5) * 3).toFixed(2)}deg`);
    el.style.setProperty("--tx", `${(-((e.clientY - r.top) / r.height - 0.5) * 3).toFixed(2)}deg`);
  };
  const untilt = (e: React.PointerEvent<HTMLDivElement>) => { e.currentTarget.style.setProperty("--tx", "0deg"); e.currentTarget.style.setProperty("--ty", "0deg"); };
  const gridRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const clampY = (y: number) => Math.min(to, Math.max(from, y));
  const active: CellRef = cursor && cursor.year >= from && cursor.year <= to ? cursor : sel && sel.year >= from && sel.year <= to ? sel : { year: from, month: 1 };
  const unit = cal.mode === "raw" ? "raw detections (uncorrected)" : "harmonized detections, on the old satellite's scale";
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
      <div className="mb-2 flex flex-wrap justify-end gap-2">
        <div className="flex rounded-full border border-[var(--hairline)] p-0.5 text-xs" role="group" aria-label="Colour the calendar by">
          {([[false, "Detections"], [true, "Against a usual month"]] as const).map(([v, label]) => (
            <button key={label} type="button" data-testid={v ? "anomaly-on" : "anomaly-off"} aria-pressed={anom === v} onClick={() => setAnom(v)}
              className={`rounded-full px-3 py-1 ${anom === v ? "bg-[var(--ink)] text-[var(--on-ink)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{label}</button>
          ))}
        </div>
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
      <div className="tilt" onPointerMove={tilt} onPointerLeave={untilt}>
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
            <div role="rowheader" className={`tabular sticky left-0 z-[1] flex items-center bg-[var(--surface)] font-mono text-[11px] ${y === scrub ? "font-bold text-[var(--text-primary)]" : y === 2012 ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`}>{y === scrub && <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--red)]" />}{y}</div>
            {MONTHS.map((_, mi) => {
              const row = at(y, mi + 1);
              const idx = rampIndex(row?.value ?? null, max);
              const ratio = anom ? ratioOf(row?.value, mi + 1) : null;
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
                  className={`h-[28px] rounded-[4px] outline-none ring-[var(--text-primary)] hover:ring-1 focus-visible:ring-2 sm:h-[22px] ${scrub != null && y !== scrub ? "opacity-35" : ""} ${sel && sel.year === y && sel.month === mi + 1 ? "ring-2 ring-[var(--ink)]" : ""}`}
                  style={{
                    background: idx === null || (anom && ratio === null) ? "repeating-linear-gradient(135deg, transparent 0 3px, var(--hairline) 3px 4px)" : anom ? ANOM_STEPS[anomIdx(ratio as number)].color : RAMP[idx],
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
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
        <label htmlFor={`scrub-${from}-${to}`} className="eyebrow">Scrub years</label>
        <input id={`scrub-${from}-${to}`} type="range" min={from} max={to} step={1} value={scrub ?? to} onChange={(e) => setScrub(Number(e.target.value))} className="w-44" aria-valuetext={scrub != null ? String(scrub) : "all years"} />
        {scrub != null
          ? <span className="tabular flex items-center gap-2"><span className="dot-num text-xl text-[var(--text-primary)]">{scrub}</span> total {yearTotal(scrub) == null ? "no data" : fmt(yearTotal(scrub))}<button type="button" onClick={() => setScrub(null)} className="link-ul">show all years</button></span>
          : <span className="text-[var(--text-muted)]">drag to single out one year</span>}
      </div>
      </>)}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-[var(--text-secondary)]">
        <div className="tabular min-h-[1.25rem]" aria-live="polite">
          {shownCell && h ? (
            <span>
              <span className="font-medium text-[var(--text-primary)]">{MONTHS[shownCell.month - 1]} {shownCell.year}</span>
              {areaName && <> · {areaName}</>} · {cal.mode === "raw" ? "Raw detections (as recorded)" : "Harmonized (corrected) detections"} ·{" "}
              {h.value == null ? "no data" : <span className="text-[var(--ember)]">{fmt(h.value)}</span>}
              {(() => { const q = ratioOf(h.value, shownCell.month); return q == null ? null : <span> · ×{q >= 10 ? q.toFixed(0) : q.toFixed(1)} a usual {MONTHS[shownCell.month - 1]}</span>; })()}
              <span className="text-[var(--text-muted)]"> · {BASIS[h.basis]}{sel && !hover ? " · selected (click again to clear)" : ""}</span>
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">Hover, tap or focus a month for its count; click or press Enter to keep it.</span>
          )}
        </div>
        {anom ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="Colour scale: each month against the median of the same month, blue below, orange above">
            {ANOM_STEPS.map((st) => (
              <span key={st.label} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]"><span className="h-3 w-5 rounded-[3px]" style={{ background: st.color }} />{st.label}</span>
            ))}
            <span className="ml-1 hidden text-[10px] text-[var(--text-muted)] sm:inline">× the median of that month, all years shown</span>
          </div>
        ) : (
        <div className="flex items-center gap-2" aria-label={`Colour scale: ${RAMP_NAME}`}>
          <span className="tabular text-[10px] text-[var(--text-muted)]">0</span>
          {RAMP.map((c, i) => (
            <span key={c} title={i === 0 ? "0" : `≥ ${fmt(breaks[i - 1])}`} className="h-3 w-5 rounded-[3px]" style={{ background: c }} />
          ))}
          <span className="tabular text-[10px] text-[var(--text-muted)]">{fmtCompact(max)}</span>
          <span className="ml-2 hidden text-[10px] text-[var(--text-muted)] sm:inline">{RAMP_NAME}, √ scale</span>
        </div>
        )}
      </div>
    </div>
  );
}
