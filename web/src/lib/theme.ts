"use client";

import { useSyncExternalStore } from "react";
import type { Theme } from "@/lib/colorScale";

/**
 * The resolved colour theme, for code that needs concrete colours rather
 * than CSS variables (the calendar interpolates cell fills in JS).
 *
 * Follows prefers-color-scheme unless <html data-theme="light|dark"> is set,
 * matching the token rules in globals.css.
 */

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function getSnapshot(): Theme {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return window.matchMedia(QUERY).matches ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
