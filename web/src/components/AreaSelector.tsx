"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AoiMap } from "@/components/AoiMap";
import { DEFAULT_COUNTRY, countryArea, useArea, type Area } from "@/components/AreaProvider";
import {
  PARENT_CELL_AREA_KM2,
  bboxToInput,
  bboxToParentCells,
  boxLabel,
  parseBounds,
  type Bbox,
  type BoundsInput,
} from "@/lib/aoi";
import { listCountries, listParentCells } from "@/lib/queries";
import { useResolvedTheme } from "@/lib/theme";
import { useParquet } from "@/lib/useParquet";

/**
 * Area selection: a country, or a lat/lon box drawn on the map or typed in.
 * The map and the four inputs stay in sync both ways through the shared
 * area state; a box becomes an `h3_parent` area keyed by every res-2 cell it
 * touches (processed or not, so the calendar can report what is missing).
 */

export function boxArea(bbox: Bbox): Area {
  return { scope: "h3_parent", keys: bboxToParentCells(bbox), label: boxLabel(bbox), bbox };
}

const AREA_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const FIELDS: Array<{ name: keyof BoundsInput; label: string; placeholder: string }> = [
  { name: "south", label: "South", placeholder: "lat" },
  { name: "west", label: "West", placeholder: "lon" },
  { name: "north", label: "North", placeholder: "lat" },
  { name: "east", label: "East", placeholder: "lon" },
];

export function AreaSelector() {
  const { area, setArea } = useArea();
  const theme = useResolvedTheme();
  const countries = useParquet(listCountries, "countries");
  const coverage = useParquet(listParentCells, "parents");

  const bboxKey = area.bbox ? area.bbox.join(",") : "";
  const [input, setInput] = useState<BoundsInput>(() => bboxToInput(area.bbox));
  const [syncedKey, setSyncedKey] = useState(bboxKey);
  const [error, setError] = useState<string | null>(null);
  // A new box (drawn, typed, or cleared by a country choice) rewrites the inputs.
  if (bboxKey !== syncedKey) {
    setSyncedKey(bboxKey);
    setInput(bboxToInput(area.bbox));
  }

  const { selected, unprocessed } = useMemo(() => {
    if (area.scope !== "h3_parent" || !coverage.data) return { selected: [], unprocessed: [] };
    const processed = new Set(coverage.data);
    return {
      selected: area.keys.filter((k) => processed.has(k)),
      unprocessed: area.keys.filter((k) => !processed.has(k)),
    };
  }, [area, coverage.data]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = parseBounds(input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setArea(boxArea(result.bbox));
  };

  const inputClass =
    "w-full min-w-0 rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)] tabular focus-visible:outline-2 focus-visible:outline-[var(--focus)]";
  const buttonClass =
    "rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-page)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]";

  return (
    <section aria-label="Area of interest" className="grid gap-4 lg:grid-cols-5">
      <div className="min-w-0 lg:col-span-3">
        <AoiMap
          theme={theme}
          coverage={coverage.data}
          selected={selected}
          unprocessed={unprocessed}
          bbox={area.bbox ?? null}
          onDraw={(bbox) => {
            setError(null);
            setArea(boxArea(bbox));
          }}
        />
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
            Country
            <select
              className="rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
              value={area.scope === "country" ? area.keys[0] : ""}
              onChange={(e) => {
                if (!e.target.value) return;
                setError(null);
                setArea(countryArea(e.target.value));
              }}
              disabled={!countries.data}
            >
              {area.scope !== "country" ? <option value="">Custom box</option> : null}
              {(countries.data ?? (area.scope === "country" ? [area.keys[0]] : [])).map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setError(null);
              setArea(countryArea(DEFAULT_COUNTRY));
            }}
          >
            Reset
          </button>
        </div>

        <form onSubmit={submit} noValidate className="space-y-2" aria-label="Box bounds">
          <p className="text-xs text-[var(--text-secondary)]">
            Or a box in decimal degrees — draw it on the map, or type it:
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {FIELDS.map((f) => (
              <label key={f.name} className="flex min-w-0 flex-col gap-1 text-xs text-[var(--text-secondary)]">
                {f.label}
                <input
                  name={f.name}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={f.placeholder}
                  value={input[f.name]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "bounds-error" : undefined}
                  onChange={(e) => setInput({ ...input, [f.name]: e.target.value })}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className={buttonClass}>
              Apply box
            </button>
          </div>
          {error ? (
            <p id="bounds-error" role="alert" className="text-sm text-[var(--status-critical)]" data-testid="bounds-error">
              {error} The previous selection is still shown.
            </p>
          ) : null}
        </form>

        <div className="space-y-1.5 text-xs text-[var(--text-muted)]">
          {area.scope === "h3_parent" ? (
            <p className="text-[var(--text-secondary)]" data-testid="box-summary">
              {`This box touches ${area.keys.length} H3 res-2 cell${area.keys.length === 1 ? "" : "s"}, `}
              {coverage.data ? `${selected.length} of them processed.` : "checking coverage…"}
            </p>
          ) : null}
          <p>
            A box is resolved to whole H3 resolution-2 cells (about{" "}
            {AREA_FMT.format(PARENT_CELL_AREA_KM2)} km² each on average, per h3-js): every cell the box
            touches is counted in full, so the calendar usually covers more ground than the box itself.
          </p>
          <p>Cells on a country border only count detections inside the processed countries.</p>
        </div>
      </div>
    </section>
  );
}
