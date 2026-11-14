"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "@/lib/nav";

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [path, setPath] = useState(pathname);
  if (path !== pathname) { setPath(pathname); setOpen(null); setMobile(false); }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(null), setMobile(false));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-3 z-50 px-3 sm:px-6" onMouseLeave={() => setOpen(null)}>
      <div className="glass relative mx-auto flex w-full max-w-6xl items-center justify-between gap-3 !rounded-full !overflow-visible py-2 pl-5 pr-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Emberline home">
          <span aria-hidden className="relative flex h-6 w-6 items-center justify-center rounded-[7px] bg-[var(--ink)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--ember)] shadow-[0_0_10px_2px_rgba(217,67,26,0.6)]" />
          </span>
          <span className="text-[13px] font-medium uppercase tracking-[0.28em]">Emberline</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((g) => {
            const on = g.items.some((i) => active(i.href));
            return (
              <div key={g.label} className="relative" onMouseEnter={() => setOpen(g.label)}>
                <button type="button" aria-expanded={open === g.label} onClick={() => setOpen(open === g.label ? null : g.label)}
                  className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm transition-colors ${on ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                  {g.label}
                  <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open === g.label ? "rotate-180" : ""}`}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
                  {on && <motion.span layoutId="nav-dot" className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--ember)]" />}
                </button>
                <AnimatePresence>
                  {open === g.label && (
                    <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.18 }} className="glass-thick absolute left-1/2 top-12 w-[22rem] -translate-x-1/2 p-2">
                      {g.items.map((i) => (
                        <Link key={i.href} href={i.href} className={`block rounded-[14px] px-3.5 py-3 transition-colors hover:bg-white/60 ${active(i.href) ? "bg-[var(--ember-soft)]" : ""}`}>
                          <span className="text-sm font-medium">{i.label}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-secondary)]">{i.blurb}</span>
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          <Link href="/about" className={`rounded-full px-3.5 py-1.5 text-sm ${active("/about") ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>About</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/explorer" className="glass-dark hidden px-4 py-1.5 text-sm font-medium sm:inline-block">Open the calendar</Link>
          <button type="button" className="glass-thin flex h-9 w-9 items-center justify-center lg:hidden" aria-label="Menu" aria-expanded={mobile} onClick={() => setMobile(!mobile)}>
            <svg width="16" height="12" viewBox="0 0 16 12"><path d={mobile ? "M2 1l12 10M14 1 2 11" : "M1 1h14M1 6h14M1 11h14"} stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobile && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="glass-thick mx-auto mt-2 max-h-[80vh] max-w-6xl !overflow-y-auto p-3 lg:hidden">
            {NAV.map((g) => (
              <div key={g.label} className="mb-2">
                <p className="eyebrow px-3 pb-1 pt-2">{g.label}</p>
                {g.items.map((i) => (
                  <Link key={i.href} href={i.href} className={`block rounded-xl px-3 py-2.5 ${active(i.href) ? "bg-[var(--ember-soft)]" : ""}`}>
                    <span className="text-[15px] font-medium">{i.label}</span>
                    <span className="block text-xs text-[var(--text-secondary)]">{i.blurb}</span>
                  </Link>
                ))}
              </div>
            ))}
            <Link href="/about" className="block rounded-xl px-3 py-2.5 text-[15px] font-medium">About</Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
