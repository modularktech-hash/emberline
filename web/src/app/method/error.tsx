"use client";

import { EmptyState } from "@/components/EmptyState";

export default function MethodError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
        How the record is harmonized
      </h1>
      <EmptyState title="This page could not be shown" tone="error">
        <p>No figures are shown. {error.message}</p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-3 rounded-md border border-[var(--hairline)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-page)]"
        >
          Try again
        </button>
      </EmptyState>
    </div>
  );
}
