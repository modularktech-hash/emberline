"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { RpcState } from "@/lib/useRpc";

/**
 * Renders the four states an RPC can be in.
 *
 * "Not connected" and "no fires here" are different answers and are never
 * collapsed into one blank panel -- the first is a setup problem, the second
 * is a result.
 */

interface Props<T> {
  state: RpcState<T>;
  emptyTitle: string;
  emptyBody?: ReactNode;
  children: (rows: T[]) => ReactNode;
}

export function QueryBoundary<T>({
  state,
  emptyTitle,
  emptyBody,
  children,
}: Props<T>) {
  if (state.status === "loading") {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)]">
        <span className="text-sm text-[var(--text-muted)]">Loading…</span>
      </div>
    );
  }

  if (state.status === "unconfigured") {
    return (
      <EmptyState title="Not connected to a database yet" tone="setup">
        <p>
          Set <code className="tabular">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="tabular">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then apply
          the migrations in <code className="tabular">db/migrations</code> and load a
          cell-day table with <code className="tabular">firms-ingest aggregate</code>.
        </p>
      </EmptyState>
    );
  }

  if (state.status === "error") {
    return (
      <EmptyState title="The query failed" tone="error">
        <p className="tabular">{state.message}</p>
      </EmptyState>
    );
  }

  if (state.rows.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>;
  }

  return <>{children(state.rows)}</>;
}
