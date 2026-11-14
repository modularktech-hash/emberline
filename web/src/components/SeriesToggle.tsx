"use client";

import { motion } from "motion/react";
import type { Series } from "@/lib/types";

/**
 * Raw / harmonized switch.
 *
 * The raw series stays reachable on purpose. A tool that only ever showed the
 * corrected record would be asking to be trusted; one that lets you flip back
 * and see the uncorrected version is showing its work.
 */

const OPTIONS: Array<{ value: Series; label: string; hint: string }> = [
  { value: "raw", label: "Raw", hint: "Detections as each sensor reported them" },
  {
    value: "harmonized",
    label: "Harmonized",
    hint: "VIIRS censored to MODIS sensitivity, MODIS era corrected",
  },
];

interface Props {
  value: Series;
  onChange: (value: Series) => void;
}

export function SeriesToggle({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Series"
      className="inline-flex rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className="relative rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors"
          >
            {active ? (
              <motion.span
                layoutId="series-toggle-active"
                className="absolute inset-0 rounded-[6px] bg-[var(--series-1)]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
            <span
              className={
                active
                  ? "relative text-white"
                  : "relative text-[var(--text-secondary)]"
              }
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
