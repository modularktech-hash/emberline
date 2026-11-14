"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import type { QueryState } from "@/lib/useParquet";

/**
 * Renders loading / error / empty / data for a useParquet query.
 *
 * "The file failed to load" and "no fires here" are different answers and
 * are never collapsed into one blank panel.
 */

interface Props<T> {
  state: QueryState<T>;
  isEmpty?: (data: T) => boolean;
  emptyTitle: string;
  emptyBody?: ReactNode;
  children: (data: T) => ReactNode;
}

export function QueryBoundary<T>({
  state,
  isEmpty,
  emptyTitle,
  emptyBody,
  children,
}: Props<T>) {
  if (state.loading) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)]">
        <span className="text-sm text-[var(--text-muted)]">Loading…</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <EmptyState title="Could not read the data files" tone="error">
        <p className="tabular">{state.error.message}</p>
      </EmptyState>
    );
  }

  if (state.data === null || (isEmpty && isEmpty(state.data))) {
    return <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>;
  }

  return <>{children(state.data)}</>;
}
