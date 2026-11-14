"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/ui";

/**
 * Region selector. Up to `inline` options render as chips; beyond that
 * (the world dataset has ~190) it becomes a searchable dropdown.
 */
export function CountryPicker({ value, options, onChange, inline = 8, label = "Region" }: { value: string; options: string[]; onChange: (v: string) => void; inline?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);
  const list = useMemo(() => options.filter((o) => o.replace(/_/g, " ").toLowerCase().includes(q.toLowerCase())), [options, q]);
  const pretty = (s: string) => s.replace(/_/g, " ");

  if (options.length <= inline) {
    return <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>{options.map((o) => <Chip key={o} on={o === value} onClick={() => onChange(o)}>{pretty(o)}</Chip>)}</div>;
  }
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="glass flex min-w-[14rem] items-center justify-between gap-3 rounded-full !border-[var(--ember)] px-4 py-2 text-sm">
        <span><span className="text-[var(--text-muted)]">{label}: </span>{pretty(value)}</span>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="glass glass-thick absolute left-0 top-12 z-40 w-[18rem] rounded-[20px] p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${options.length} regions…`}
              className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm" />
            <ul className="mt-2 max-h-72 overflow-y-auto">
              {list.map((o) => (
                <li key={o}><button type="button" onClick={() => { onChange(o); setOpen(false); setQ(""); }}
                  className={`w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-2)] ${o === value ? "bg-[var(--ember-soft)]" : ""}`}>{pretty(o)}</button></li>
              ))}
              {!list.length && <li className="px-3 py-2 text-sm text-[var(--text-muted)]">No match</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
