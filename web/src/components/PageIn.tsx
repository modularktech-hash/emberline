"use client";

import { useState, type ReactNode } from "react";
import { isCovering } from "@/lib/transition";

/**
 * The page fade-in as a CSS animation (.page-in, globals.css) instead of a Motion component, so
 * the server HTML starts fading in at first paint rather than staying invisible until hydration.
 * Skipped while the route curtain covers the screen (decided once, when the page mounts).
 */
export function PageIn({ children }: { children: ReactNode }) {
  const [fade] = useState(() => !isCovering());
  return <div className={fade ? "page-in" : undefined}>{children}</div>;
}
