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

/** The burning activity calendar: one row per year, one column per month. */
export function MonthYearCalendar({ cal, from, to, max }: { cal: CalendarResult; from: number; to: number; max: number }) {
  const [hover, setHover] = useState<{ year: number; month: number } | null>(null);
  const years: number[] = [];
  for (let y = from; y <= to; y += 1) years.push(y);
  const at = (y: number, m: number) => cal.rows.find((r) => r.year === y && r.month === m);
  const h = hover ? at(hover.year, hover.month) : null;
  const breaks = rampBreaks(max);
  return (
    <div>
      <div className="cal-wipe grid gap-[3px]" style={{ gridTemplateColumns: "2.6rem repeat(12, minmax(0, 1fr))" }} onMouseLeave={() => setHover(null)}>
        <div />
        {MONTHS.map((m) => (
          <div key={m} className="pb-1 text-center text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{m}</div>
        ))}
        {years.map((y, yi) => (
          <div key={y} className="contents">
            <div className={`tabular flex items-center text-[11px] ${y === 2012 ? "text-[var(--ember)]" : "text-[var(--text-muted)]"}`}>{y}</div>
            {MONTHS.map((_, mi) => {
              const row = at(y, mi + 1);
              const idx = rampIndex(row?.value ?? null, max);
              return (
                <button
                  key={mi}
                  type="button"
                  onMouseEnter={() => setHover({ year: y, month: mi + 1 })}
                  onFocus={() => setHover({ year: y, month: mi + 1 })}
                  aria-label={`${MONTHS[mi]} ${y}: ${row?.value == null ? "no data" : fmt(row.value)}`}
                  className="h-[18px] rounded-[4px] outline-none ring-[var(--text-primary)] hover:ring-1 focus-visible:ring-1 sm:h-[22px]"
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-[var(--text-secondary)]">
        <div className="tabular min-h-[1.25rem]">
          {hover && h ? (
            <span>
              <span className="text-[var(--text-primary)]">{MONTHS[hover.month - 1]} {hover.year}</span> ·{" "}
              {h.value == null ? "no data" : <><span className="text-[var(--ember)]">{fmt(h.value)}</span> detections · {BASIS[h.basis]}</>}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">Hover a month for its count.</span>
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
