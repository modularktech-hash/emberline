"use client";

import { useEffect, useState } from "react";
import { onDataset, type DatasetInfo } from "@/lib/queries";

/** The resolved dataset (null until a page has loaded data). */
export function useDataset(): DatasetInfo | null {
  const [info, setInfo] = useState<DatasetInfo | null>(null);
  useEffect(() => onDataset(setInfo), []);
  return info;
}

/**
 * Site-wide notice when the session fell back to the four-country dataset (E16).
 * Subscribes only; it never triggers a data load itself.
 */
export function DatasetBanner() {
  const info = useDataset();
  if (!info || info.dataset === "world") return null;
  return (
    <div role="status" data-testid="fallback-banner" className="border-b border-[var(--hairline)] bg-[var(--ember-soft)] px-4 py-2 text-center text-sm text-[var(--text-primary)]">
      World data failed to load — showing the four-country fallback (Australia, Canada, Chile, Portugal; fit {info.fitVersion}). World-only summaries are hidden.{" "}
      <button type="button" onClick={() => window.location.reload()} className="underline underline-offset-2 hover:text-[var(--ember)]">Try the world data again</button>
    </div>
  );
}
