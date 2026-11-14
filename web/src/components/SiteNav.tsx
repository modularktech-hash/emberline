"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Calendar" },
  { href: "/anomaly", label: "Seasons" },
  { href: "/method", label: "Method & proof" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-3 z-30 px-3 sm:px-6">
      <div className="card mx-auto flex w-full max-w-5xl items-center justify-between gap-3 !rounded-[20px] px-4 py-2.5 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span aria-hidden className="relative flex h-6 w-6 items-center justify-center rounded-[7px] bg-[var(--ink)]">
            <span className="h-2 w-2 rounded-full bg-[var(--ember)]" />
          </span>
          <span className="text-[13px] font-medium uppercase tracking-[0.28em]">Emberline</span>
          <span className="eyebrow ml-3 hidden !text-[10px] md:inline">NASA Space Apps 2026</span>
        </Link>
        <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="Views">
          {LINKS.map((l, i) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            const last = i === LINKS.length - 1;
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  last ? "border border-[var(--ink)] bg-[#d6e2cf] text-[var(--text-primary)]"
                  : active ? "text-[var(--text-primary)] underline decoration-[var(--ember)] decoration-2 underline-offset-8"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
