import type { ReactNode } from "react";

/**
 * Empty states carry the difference between "not set up yet" and "nothing
 * here". During the build the database is empty for days, so the app has to
 * say which of the two it is instead of rendering a blank panel.
 */

interface Props {
  title: string;
  children?: ReactNode;
  tone?: "neutral" | "setup" | "error";
}

const TONE_CLASS: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "border-[var(--hairline)]",
  setup: "border-dashed border-[var(--baseline)]",
  error: "border-[var(--status-critical)]",
};

export function EmptyState({ title, children, tone = "neutral" }: Props) {
  return (
    <div
      className={`flex min-h-48 flex-col items-center justify-center rounded-xl border bg-[var(--surface-1)] px-6 py-10 text-center ${TONE_CLASS[tone]}`}
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      {children ? (
        <div className="mt-1.5 max-w-prose text-sm text-[var(--text-secondary)]">
          {children}
        </div>
      ) : null}
    </div>
  );
}
