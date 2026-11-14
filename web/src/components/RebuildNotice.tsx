import { EmptyState } from "@/components/EmptyState";

/**
 * Placeholder for a view whose data wiring is being rebuilt on the static
 * Parquet read path. Shows no numbers: nothing is displayed until it comes
 * from the published data files.
 */
export function RebuildNotice({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h1>
      <EmptyState title="This view is being rebuilt" tone="setup">
        <p>
          It is being reconnected to the published data files. No figures are shown
          until they come from our own fit.
        </p>
      </EmptyState>
    </div>
  );
}
