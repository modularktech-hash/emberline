"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DEFAULT_RESOLUTION, PRESET_AOIS, bboxToCells, type Bbox } from "@/lib/aoi";
import {
  getServerSnapshot,
  getSnapshot,
  setStoredAoi,
  subscribe,
} from "@/lib/aoiStore";
import type { AoiSelection } from "@/lib/types";

/**
 * The selected area of interest, shared across the three views.
 *
 * Every view answers "for this area", so switching views must not lose the
 * selection. The bbox lives in an external store (see aoiStore); the cell list
 * is derived from it here, because it is a pure function of the bbox and does
 * not need to be persisted.
 */

interface AoiContextValue {
  aoi: AoiSelection;
  truncated: boolean;
  setBbox: (bbox: Bbox, name?: string) => void;
  setPreset: (name: string) => void;
}

const AoiContext = createContext<AoiContextValue | null>(null);

export function AoiProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const { aoi, truncated } = useMemo(() => {
    const { cells, truncated: clipped } = bboxToCells(
      stored.bbox,
      DEFAULT_RESOLUTION,
    );
    return {
      aoi: { name: stored.name, bbox: stored.bbox, cells },
      truncated: clipped,
    };
  }, [stored]);

  const setBbox = useCallback((bbox: Bbox, name = "Custom area") => {
    setStoredAoi({ name, bbox });
  }, []);

  const setPreset = useCallback((name: string) => {
    const preset = PRESET_AOIS.find((p) => p.name === name);
    if (preset) setStoredAoi({ name: preset.name, bbox: preset.bbox });
  }, []);

  const value = useMemo(
    () => ({ aoi, truncated, setBbox, setPreset }),
    [aoi, truncated, setBbox, setPreset],
  );

  return <AoiContext.Provider value={value}>{children}</AoiContext.Provider>;
}

export function useAoi(): AoiContextValue {
  const context = useContext(AoiContext);
  if (!context) throw new Error("useAoi must be used inside <AoiProvider>");
  return context;
}
