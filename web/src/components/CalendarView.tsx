"use client";

import { useMemo, useState } from "react";
import { areaKey, useArea } from "@/components/AreaProvider";
import { AreaSelector } from "@/components/AreaSelector";
import { CalendarHeatmap } from "@/components/CalendarHeatmap";
import { CalendarLegend } from "@/components/CalendarLegend";
import { EmptyState } from "@/components/EmptyState";
import { ModeToggle } from "@/components/ModeToggle";
import { MONTHS, MONTHS_SHORT, buildMatrix, formatValue } from "@/lib/calendarMatrix";
import { sqrtScale } from "@/lib/colorScale";
import { buildCalendarCsv, csvFilename } from "@/lib/csv";
import { getCalendar, getParams, listCountries } from "@/lib/queries";
import { useResolvedTheme } from "@/lib/theme";
import { useParquet } from "@/lib/useParquet";

/**
 * The home view: area + series + year-range controls, the calendar, the
 * legend and a table view. All state lives in AreaProvider.
 */

export function CalendarView() {
  const { area, mode, setMode, yearRange, setYearRange } = useArea();
  const theme = useResolvedTheme();
  const [attempt, setAttempt] = useState(0);

  const countries = useParquet(listCountries, `countries#${attempt}`);
  const params = useParquet(getParams, `params#${attempt}`);
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
  const fromMonth = yearRange.fromMonth ?? 1;
  const toMonth = yearRange.toMonth ?? 12;

  const matrix = useMemo(() => {
    if (!calendars.data) return null;
    const [raw, harm] = calendars.data;
    // A one-year range cannot end before it starts.
    const fm = from === to ? Math.min(fromMonth, toMonth) : fromMonth;
    const tm = from === to ? Math.max(fromMonth, toMonth) : toMonth;
    return buildMatrix(raw, harm, Math.min(from, to), Math.max(from, to), fm, tm);
  }, [calendars.data, from, to, fromMonth, toMonth]);

  const knownKeys = calendars.data?.[0].keys.length ?? 0;
  const unknownKeys = calendars.data?.[0].unknownKeys.length ?? 0;
  const notProcessed = area.scope === "h3_parent" && calendars.data !== null && knownKeys === 0;
  const coverageList = (countries.data ?? []).map((c) => c.replace(/_/g, " ")).join(", ");

  const splice = useMemo(() => {
    const rows = calendars.data?.[0].rows ?? [];
    const years = rows.filter((r) => r.basis === "VIIRS").map((r) => r.year);
    return years.length ? Math.min(...years) : null;
  }, [calendars.data]);

  const scale = useMemo(() => (matrix ? sqrtScale(matrix.min, matrix.max) : null), [matrix]);

  const retry = () => setAttempt((n) => n + 1);

  const canDownload =
    !!matrix && matrix.hasData && !calendars.loading && !!params.data && !!calendars.data && !notProcessed;
  const downloadCsv = () => {
    if (!matrix || !params.data || !calendars.data) return;
    const [raw] = calendars.data;
    const input = {
      matrix,
      mode,
      area: {
        scope: area.scope,
        label: area.label,
        bbox: area.bbox,
        usedKeys: raw.keys,
        unprocessedKeys: raw.unknownKeys,
      },
      fitVersion: params.data.fit_version,
      harmonizedUnit: params.data.unit,
      viirsFirstYear: splice,
      downloadedAt: new Date().toISOString(),
    };
    const blob = new Blob([buildCalendarCsv(input)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename(input);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
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

      <AreaSelector />

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <fieldset className="flex flex-wrap items-end gap-x-4 gap-y-2 text-xs text-[var(--text-secondary)]">
          <legend className="sr-only">Date range</legend>
          <div className="flex items-end gap-1.5">
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
              <span className="sr-only">From month</span>
              <select
                className={selectClass}
                value={fromMonth}
                disabled={!allYears}
                onChange={(e) => setYearRange({ ...yearRange, fromMonth: Number(e.target.value) })}
              >
                {MONTHS_SHORT.map((m, i) =>
                  from === to && i + 1 > toMonth ? null : (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <div className="flex items-end gap-1.5">
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
            <label className="flex flex-col gap-1">
              <span className="sr-only">To month</span>
              <select
                className={selectClass}
                value={toMonth}
                disabled={!allYears}
                onChange={(e) => setYearRange({ ...yearRange, toMonth: Number(e.target.value) })}
              >
                {MONTHS_SHORT.map((m, i) =>
                  from === to && i + 1 < fromMonth ? null : (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        </fieldset>
        <div className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          <span id="series-label">Series</span>
          <ModeToggle value={mode} onChange={setMode} />
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={!canDownload}
          title={
            params.error
              ? "params.json could not be read, so the export cannot state the fit version"
              : "Download the calendar shown below: this area, series and date range"
          }
          className="rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-page)] focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:opacity-50"
        >
          Download CSV
        </button>
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
        ) : notProcessed ? (
          <div data-testid="not-processed">
            <EmptyState title={`Not processed yet — coverage: ${coverageList || "loading…"}`} tone="setup">
              <p>
                None of the {unknownKeys} H3 res-2 cell{unknownKeys === 1 ? "" : "s"} this box touches
                has been processed, so there is no calendar for it. That means no data, not no fires.
              </p>
            </EmptyState>
          </div>
        ) : !matrix.hasData ? (
          <EmptyState title={`No calendar data for ${area.label}`}>
            <p>
              {calendars.data?.[0].unknownKeys.length
                ? "This area has not been processed yet."
                : "No detections were recorded in the selected years."}
            </p>
          </EmptyState>
        ) : (
          <div className="space-y-4" data-testid="calendar" data-scope={area.scope}>
            {area.scope === "h3_parent" && unknownKeys > 0 ? (
              <p
                className="rounded-md border border-dashed border-[var(--baseline)] px-3 py-2 text-xs text-[var(--text-secondary)]"
                data-testid="partial-note"
              >
                {`${unknownKeys} of the ${knownKeys + unknownKeys} cells this box touches ${unknownKeys === 1 ? "is" : "are"} not processed yet and ${unknownKeys === 1 ? "is" : "are"} not in this calendar; it sums the ${knownKeys} processed cell${knownKeys === 1 ? "" : "s"}.`}
              </p>
            ) : null}
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
                <p>* Faded bar: annual total over the months with data in the selected range only.</p>
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
                        {!matrix.inRange[r][c] ? "" : v === null ? "–" : formatValue(v, mode, true)}
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
            <p className="mt-1 text-xs text-[var(--text-muted)]">– = no data; blank = outside the selected date range.</p>
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
