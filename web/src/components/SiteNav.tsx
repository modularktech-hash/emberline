"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Calendar" },
  { href: "/anomaly", label: "Anomalies" },
  { href: "/live", label: "Live" },
  { href: "/method", label: "Method" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--hairline)] bg-[var(--surface-1)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-[var(--text-primary)]">
          Burning Activity Calendar
        </Link>
        <nav className="flex gap-4" aria-label="Views">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`text-sm transition-colors ${
                  active
                    ? "font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
