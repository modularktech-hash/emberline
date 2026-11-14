export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <h1 className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
        How the record is harmonized
      </h1>
      <p className="text-sm text-[var(--text-secondary)]">Loading the published fit…</p>
    </div>
  );
}
