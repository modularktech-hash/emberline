"use client";

import { useMemo, useState } from "react";
import { areaKey, countryArea, useArea } from "@/components/AreaProvider";
import { CalendarHeatmap } from "@/components/CalendarHeatmap";
import { CalendarLegend } from "@/components/CalendarLegend";
import { EmptyState } from "@/components/EmptyState";
import { ModeToggle } from "@/components/ModeToggle";
import { MONTHS, MONTHS_SHORT, buildMatrix, formatValue } from "@/lib/calendarMatrix";
import { sqrtScale } from "@/lib/colorScale";
import { getCalendar, listCountries } from "@/lib/queries";
import { useResolvedTheme } from "@/lib/theme";
import { useParquet } from "@/lib/useParquet";

/**
 * The home view: area + series + year-range controls, the calendar, the
 * legend and a table view. All state lives in AreaProvider.
 */

export function CalendarView() {
  const { area, setArea, mode, setMode, yearRange, setYearRange } = useArea();
  const theme = useResolvedTheme();
  const [attempt, setAttempt] = useState(0);

  const countries = useParquet(listCountries, `countries#${attempt}`);
  const calendars = useParquet(
    () =>
      Promise.all([
        getCalendar({ scope: area.scope, keys: area.keys, mode: "raw" }),
        getCalendar({ scope: area.scope, keys: area.keys, mode: "harmonized" }),
      ]),
    `${areaKey(area)}#${attempt}`,
  );

  const allYears = calendars.data?.[0].years ?? null;
  const from = Math.max(yearRange.from ?? allYears?.[0] ?? 0, allYears?.[0] ?? 0);
  const to = Math.min(yearRange.to ?? allYears?.[1] ?? 0, allYears?.[1] ?? 0);

  const matrix = useMemo(() => {
    if (!calendars.data) return null;
    const [raw, harm] = calendars.data;
    return buildMatrix(raw, harm, Math.min(from, to), Math.max(from, to));
  }, [calendars.data, from, to]);

  const splice = useMemo(() => {
    const rows = calendars.data?.[0].rows ?? [];
    const years = rows.filter((r) => r.basis === "VIIRS").map((r) => r.year);
    return years.length ? Math.min(...years) : null;
  }, [calendars.data]);

  const scale = useMemo(() => (matrix ? sqrtScale(matrix.min, matrix.max) : null), [matrix]);

  const retry = () => setAttempt((n) => n + 1);
  const error = calendars.error ?? countries.error;

  const yearOptions: number[] = [];
  if (allYears) for (let y = allYears[0]; y <= allYears[1]; y += 1) yearOptions.push(y);

  const firstHarmonized = (() => {
    if (!matrix) return null;
    for (let r = 0; r < matrix.years.length; r += 1) {
      const c = matrix.values.harmonized[r].findIndex((v) => v !== null);
      if (c >= 0) return `${MONTHS[c]} ${matrix.years[r]}`;
    }
    return null;
  })();
  const anyMissing = matrix
    ? matrix.values[mode].some((row) => row.some((v) => v === null))
    : false;

  const selectClass =
    "rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]";

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
            Burning activity calendar · {area.label}
          </h1>
          {mode === "raw" ? (
            <span className="rounded border border-[var(--text-primary)] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-primary)]">
              Uncorrected
            </span>
          ) : (
            <span className="rounded bg-[var(--text-primary)] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--surface-1)]">
              Harmonized
            </span>
          )}
        </div>
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]" aria-live="polite">
          {mode === "raw"
            ? splice !== null
              ? `Monthly raw detections (MODIS Terra+Aqua before ${splice}, VIIRS Suomi-NPP from ${splice}) — not corrected.`
              : "Monthly raw detections — not corrected."
            : calendars.data
              ? `Monthly ${calendars.data[1].unit}.`
              : "Monthly harmonized detections."}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          Area
          <select
            className={selectClass}
            value={area.scope === "country" ? area.keys[0] : ""}
            onChange={(e) => setArea(countryArea(e.target.value))}
            disabled={!countries.data}
          >
            {area.scope !== "country" ? <option value="">{area.label}</option> : null}
            {(countries.data ?? (area.scope === "country" ? [area.keys[0]] : [])).map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex items-end gap-2 text-xs text-[var(--text-secondary)]">
          <legend className="sr-only">Year range</legend>
          <label className="flex flex-col gap-1">
            From
            <select
              className={selectClass}
              value={from}
              disabled={!allYears}
              onChange={(e) => setYearRange({ ...yearRange, from: Number(e.target.value) })}
            >
              {yearOptions.filter((y) => y <= to).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            To
            <select
              className={selectClass}
              value={to}
              disabled={!allYears}
              onChange={(e) => setYearRange({ ...yearRange, to: Number(e.target.value) })}
            >
              {yearOptions.filter((y) => y >= from).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <div className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          <span id="series-label">Series</span>
          <ModeToggle value={mode} onChange={setMode} />
        </div>
      </div>

      <section
        aria-label="Calendar"
        className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] p-3 sm:p-5"
      >
        {error ? (
          <EmptyState title="Could not read the data files" tone="error">
            <p className="tabular">{error.message}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 rounded-md border border-[var(--hairline)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-page)]"
            >
              Retry
            </button>
          </EmptyState>
        ) : calendars.loading || !matrix || !scale ? (
          <Skeleton />
        ) : !matrix.hasData ? (
          <EmptyState title={`No calendar data for ${area.label}`}>
            <p>
              {calendars.data?.[0].unknownKeys.length
                ? "This area has not been processed yet."
                : "No detections were recorded in the selected years."}
            </p>
          </EmptyState>
        ) : (
          <div className="space-y-4" data-testid="calendar">
            <CalendarHeatmap
              key={areaKey(area)}
              matrix={matrix}
              mode={mode}
              scale={scale}
              annualMax={matrix.annualMax}
              theme={theme}
              areaLabel={area.label}
              unit={matrix.unit[mode]}
            />
            <CalendarLegend scale={scale} theme={theme} mode={mode} showMissing />
            <div className="space-y-1 text-xs text-[var(--text-muted)]">
              {mode === "harmonized" && anyMissing && firstHarmonized ? (
                <p>Hatched months have no harmonized value: the harmonized record starts {firstHarmonized}.</p>
              ) : null}
              {matrix.totals[mode].some((t) => t.value !== null && t.months < 12) ? (
                <p>* Faded bar: annual total over the months with data only.</p>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {matrix && matrix.hasData && !calendars.loading ? (
        <details className="text-sm text-[var(--text-secondary)]">
          <summary className="cursor-pointer select-none">Show the values as a table</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="tabular w-full border-collapse text-right text-xs">
              <caption className="sr-only">
                {`${area.label}, ${mode === "raw" ? "raw detections, not corrected" : matrix.unit.harmonized}`}
              </caption>
              <thead>
                <tr className="text-[var(--text-primary)]">
                  <th scope="col" className="px-1.5 py-1 text-left">Year</th>
                  {MONTHS_SHORT.map((m) => (
                    <th key={m} scope="col" className="px-1.5 py-1 font-medium">{m}</th>
                  ))}
                  <th scope="col" className="px-1.5 py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.years.map((year, r) => (
                  <tr key={year} className="border-t border-[var(--hairline)]">
                    <th scope="row" className="px-1.5 py-1 text-left font-medium">{year}</th>
                    {matrix.values[mode][r].map((v, c) => (
                      <td key={c} className="px-1.5 py-1">
                        {v === null ? "–" : formatValue(v, mode, true)}
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-[var(--text-primary)]">
                      {matrix.totals[mode][r].value === null
                        ? "–"
                        : formatValue(matrix.totals[mode][r].value as number, mode, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-[var(--text-muted)]">– = no data.</p>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Loading the calendar" className="animate-pulse space-y-1">
      <div className="mb-3 h-3 w-1/2 rounded bg-[var(--gridline)]" />
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="flex gap-1">
          <div className="h-4 w-8 rounded bg-[var(--gridline)]" />
          <div className="h-4 flex-1 rounded bg-[var(--gridline)]" />
          <div className="h-4 w-1/5 rounded bg-[var(--gridline)]" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
