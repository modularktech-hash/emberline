"use client";

import type { KeyboardEvent } from "react";
import type { Series } from "@/lib/types";

/**
 * Raw / harmonized switch, as a radio group (arrow keys move and select).
 *
 * The raw series stays reachable on purpose: a tool that only ever showed
 * the corrected record would be asking to be trusted; one that lets you flip
 * back to the uncorrected version is showing its work.
 */

const OPTIONS: Array<{ value: Series; label: string }> = [
  { value: "raw", label: "Raw (uncorrected)" },
  { value: "harmonized", label: "Harmonized" },
];

export function ModeToggle({ value, onChange }: { value: Series; onChange: (v: Series) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const next = value === "raw" ? "harmonized" : "raw";
      onChange(next);
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Series"
      onKeyDown={onKeyDown}
      className="inline-flex rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-0.5"
    >
      {OPTIONS.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            data-value={option.value}
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)] ${
              checked
                ? "bg-[var(--text-primary)] text-[var(--surface-1)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
