"use client";

import { AoiMap } from "@/components/AoiMap";
import { useAoi } from "@/components/AoiProvider";
import { PRESET_AOIS, formatBbox } from "@/lib/aoi";

/** Preset regions plus a draw-your-own map. */
export function AoiPicker() {
  const { aoi, truncated, setBbox, setPreset } = useAoi();

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESET_AOIS.map((preset) => {
          const active = preset.name === aoi.name;
          return (
            <button
              key={preset.name}
              type="button"
              title={preset.note}
              onClick={() => setPreset(preset.name)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-transparent bg-[var(--series-1)] text-white"
                  : "border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      <AoiMap bbox={aoi.bbox} onSelect={(bbox) => setBbox(bbox)} className="h-72" />

      <p className="tabular text-xs text-[var(--text-muted)]">
        {aoi.name} · {formatBbox(aoi.bbox)} · {aoi.cells.length} cells
        {truncated ? " (clipped — draw a smaller area for full coverage)" : ""}
      </p>
    </section>
  );
}
