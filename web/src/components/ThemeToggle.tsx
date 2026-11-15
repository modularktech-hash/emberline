"use client";

import { useSyncExternalStore } from "react";

/**
 * Light / dark switch. The choice is stored and applied as data-theme on <html> (an inline script
 * in the root layout applies it before first paint); with no choice the system setting decides.
 */
const EVT = "emberline:theme";
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(EVT, cb); mq.addEventListener("change", cb);
  return () => { window.removeEventListener(EVT, cb); mq.removeEventListener("change", cb); };
};
export function useDark(): boolean { return useSyncExternalStore(subscribe, isDark, () => false); }

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}})()`;

export function ThemeToggle() {
  const dark = useDark();
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* storage blocked: the choice lasts for this page */ }
    window.dispatchEvent(new Event(EVT));
  };
  return (
    <button type="button" onClick={flip} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} aria-pressed={dark}
      className="glass-thin inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--text-primary)]">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden suppressHydrationWarning>
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.8a6.2 6.2 0 0 0 0 12.4z" fill="currentColor" />
      </svg>
    </button>
  );
}
