"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CalendarScope, Series } from "@/lib/types";

/**
 * The one place that holds what the calendar is showing: the area, the
 * series (raw / harmonized) and the year range. Every view and every later
 * feature (map box selection, CSV export) reads and writes this.
 *
 * An area is data-layer shaped -- a scope plus the keys to sum over -- not a
 * country name, so a map selection of H3 res-2 parents plugs straight in:
 *   setArea({ scope: "h3_parent", keys: [...], label: "Selected area" })
 */

export interface Area {
  scope: CalendarScope;
  keys: string[];
  /** Human-readable name shown in titles. */
  label: string;
}

/** Inclusive year bounds; null = every year in the data. */
export interface YearRange {
  from: number | null;
  to: number | null;
}

export const DEFAULT_COUNTRY = "Portugal";

export const countryArea = (name: string): Area => ({
  scope: "country",
  keys: [name],
  label: name,
});

interface AreaContextValue {
  area: Area;
  setArea: (area: Area) => void;
  mode: Series;
  setMode: (mode: Series) => void;
  yearRange: YearRange;
  setYearRange: (range: YearRange) => void;
}

const AreaContext = createContext<AreaContextValue | null>(null);

export function AreaProvider({ children }: { children: ReactNode }) {
  const [area, setArea] = useState<Area>(() => countryArea(DEFAULT_COUNTRY));
  const [mode, setMode] = useState<Series>("raw");
  const [yearRange, setYearRange] = useState<YearRange>({ from: null, to: null });

  const value = useMemo(
    () => ({ area, setArea, mode, setMode, yearRange, setYearRange }),
    [area, mode, yearRange],
  );

  return <AreaContext.Provider value={value}>{children}</AreaContext.Provider>;
}

export function useArea(): AreaContextValue {
  const context = useContext(AreaContext);
  if (!context) throw new Error("useArea must be used inside <AreaProvider>");
  return context;
}

/** Stable string identity of an area, for query keys. */
export const areaKey = (area: Area) => `${area.scope}:${[...area.keys].sort().join(",")}`;
