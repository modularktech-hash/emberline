"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { searchText } from "@/lib/names";

/**
 * Search + sort for the long per-country tables (~170 rows). `get` returns the
 * sortable value of a column for a row; null and NaN always sort last.
 */
export function useTable<R, K extends string>(rows: R[], name: (r: R) => string, get: (r: R, k: K) => string | number | null | undefined, initial: { k: K; dir: 1 | -1 }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initial);
  const shown = useMemo(() => {
    const needle = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const r = needle ? rows.filter((x) => searchText(name(x)).includes(needle)) : rows;
    return [...r].sort((a, b) => {
      const x = get(a, sort.k), y = get(b, sort.k);
      const bad = (v: unknown) => v == null || (typeof v === "number" && !Number.isFinite(v));
      if (bad(x) || bad(y)) return bad(x) === bad(y) ? 0 : bad(x) ? 1 : -1;
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y) * sort.dir;
      return ((x as number) - (y as number)) * sort.dir;
    });
  }, [rows, q, sort, name, get]);
  const toggle = (k: K) => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : (k === initial.k ? initial.dir : -1) }));
  return { q, setQ, sort, setSort, toggle, shown };
}

/** A sortable column header. */
export function SortTh<K extends string>({ k, sort, toggle, children, title, className = "" }: {
  k: K; sort: { k: K; dir: 1 | -1 }; toggle: (k: K) => void; children: ReactNode; title?: string; className?: string;
}) {
  const on = sort.k === k;
  return (
    <th title={title} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`sticky top-0 z-10 bg-[var(--surface-page)] px-3 py-2.5 font-normal first:pl-0 ${className}`}>
      <button type="button" onClick={() => toggle(k)} className={`inline-flex items-center gap-1 text-left hover:text-[var(--text-primary)] ${on ? "text-[var(--text-primary)]" : ""}`}>
        {children}<span aria-hidden className="w-2 text-[10px]">{on ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
      </button>
    </th>
  );
}

/** Search box with a row count, for the top of a long table. */
export function TableSearch({ q, setQ, shown, total, label = "Search countries…" }: { q: string; setQ: (s: string) => void; shown: number; total: number; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={label} aria-label={label}
        className="field w-full rounded-full px-4 py-2 text-sm sm:w-64" />
      <span className="tabular text-xs text-[var(--text-muted)]">{shown === total ? `${total} rows` : `${shown} of ${total} rows`}</span>
    </div>
  );
}

/**
 * Scroll box: the table scrolls inside it (both ways), so the page never
 * scrolls sideways; headers stay on top and the first column stays pinned.
 * When columns are hidden to the right, a cue says so and the edge fades.
 */
export function ScrollBox({ children, h = "34rem", className = "", label = "Scrollable table" }: { children: ReactNode; h?: string; className?: string; /** Unique accessible name for the scroll region (axe landmark-unique). */ label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  }, []);
  return (
    <div className="relative mt-4">
      {more && <p className="mb-1 text-right text-[11px] text-[var(--text-muted)]" aria-hidden>Scroll sideways for more columns →</p>}
      <div ref={box} tabIndex={0} role="region" aria-label={label}
        className={`sticky-first max-w-full overflow-auto overscroll-x-contain rounded-xl border border-[var(--hairline)] px-3 ${className}`} style={{ maxHeight: h }}>{children}</div>
      {more && <div aria-hidden className="pointer-events-none absolute bottom-0 right-0 top-5 w-10 rounded-r-xl bg-[linear-gradient(to_right,transparent,var(--surface-page))]" />}
    </div>
  );
}
