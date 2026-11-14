"use client";

import { CELL_SIZE_NOTE, fmtBounds, type BoxScope } from "@/lib/scope";

/** E14: the actual spatial scope of a custom area, shown beside its result. */
export function ScopePanel({ scope, mode }: { scope: BoxScope; mode: "raw" | "harmonized" }) {
  const s = scope;
  const status = (c: string) => (s.summed.includes(c) ? "summed" : s.rawOnly.includes(c) ? "raw only, left out" : "no data");
  return (
    <div data-testid="scope-panel" className="mt-6 rounded-2xl border border-[var(--ember)] px-4 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">
      <p className="font-medium text-[var(--text-primary)]">Coarse scope: whole grid cells are summed, not your box.</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-[var(--text-muted)]">Requested bounds</dt>
        <dd className="tabular break-words">{fmtBounds(s.requested, 4)} (W, S, E, N){s.antimeridian && " — crosses the 180° meridian"}</dd>
        <dt className="text-[var(--text-muted)]">Effective bounds</dt>
        <dd className="tabular break-words">{s.effective ? <>{fmtBounds(s.effective, 2)} (extent of the summed cells)</> : "none — no cell summed"}</dd>
        <dt className="text-[var(--text-muted)]">Grid</dt>
        <dd>H3 resolution {s.resolution} ({CELL_SIZE_NOTE})</dd>
        <dt className="text-[var(--text-muted)]">Cells</dt>
        <dd className="tabular">{s.touched.length} touched · {s.withRaw.length} with data · {s.summed.length} summed in the {mode === "raw" ? "raw" : "harmonized"} series</dd>
      </dl>
      <p className="mt-2 text-[var(--ember)]">
        Every cell the box touches is summed whole, so fire activity outside your box — possibly across national borders — is included in these numbers.
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-[var(--text-primary)]">Cell IDs ({s.touched.length})</summary>
        <ul className="mt-1 max-h-48 overflow-auto font-mono text-[11px]">
          {s.touched.map((c) => <li key={c}>{c} · {status(c)}</li>)}
        </ul>
      </details>
    </div>
  );
}
