"use client";

import { useState } from "react";

/** E08: copy the current URL (which carries the page's selections). */
export function CopyLink({ className = "" }: { className?: string }) {
  const [done, setDone] = useState<"" | "ok" | "fail">("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setDone("ok");
    } catch {
      setDone("fail");
    }
    window.setTimeout(() => setDone(""), 2500);
  };
  return (
    <button type="button" onClick={copy} data-testid="copy-link" aria-live="polite"
      className={`glass-thin min-h-[36px] px-3.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${className}`}>
      {done === "ok" ? "Link copied" : done === "fail" ? "Copy failed — use the address bar" : "Copy link"}
    </button>
  );
}
