"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Chip } from "@/components/ui";
import { TAG_HINT, TAG_LABEL, prettyName, searchText, type FitTag } from "@/lib/names";

function TagPill({ t }: { t: FitTag | null | undefined }) {
  return t ? <span title={TAG_HINT[t]} className={`ml-2 shrink-0 rounded-full px-1.5 py-px font-mono text-[10px] uppercase tracking-wider ${t === "raw-only" ? "bg-[var(--surface-2)] text-[var(--text-muted)]" : "bg-[var(--ember-soft)] text-[var(--ember)]"}`}>{TAG_LABEL[t]}</span> : null;
}

/**
 * Region selector. Up to `inline` options render as chips; beyond that (the
 * world dataset has ~230) it is a searchable combobox: type to filter, arrow
 * keys to move, Enter to pick, Escape to close. Options are raw FIRMS keys;
 * they are shown with spaces. `tags` marks pooled fits and raw-only countries.
 */
export function CountryPicker({ value, options, onChange, inline = 8, label = "Region", tags, display }: {
  value: string; options: string[]; onChange: (v: string) => void; inline?: number; label?: string;
  tags?: Record<string, FitTag | null | undefined>; display?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  useEffect(() => {
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);
  const sorted = useMemo(() => [...options].sort((a, b) => prettyName(a).localeCompare(prettyName(b))), [options]);
  const list = useMemo(() => {
    const needle = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (!needle) return sorted;
    const starts = sorted.filter((o) => searchText(o).startsWith(needle));
    const rest = sorted.filter((o) => !starts.includes(o) && searchText(o).includes(needle));
    return [...starts, ...rest];
  }, [sorted, q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (o: string) => { onChange(o); setOpen(false); setQ(""); };
  const openList = () => { setOpen(true); setActive(Math.max(0, sorted.indexOf(value))); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) openList(); else setActive((a) => Math.min(list.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home" && open) { e.preventDefault(); setActive(0); }
    else if (e.key === "End" && open) { e.preventDefault(); setActive(list.length - 1); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (list[active]) pick(list[active]); }
    else if (e.key === "Escape") { setOpen(false); setQ(""); }
  };
  if (options.length <= inline) {
    return <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>{sorted.map((o) => <Chip key={o} on={o === value} onClick={() => onChange(o)}>{prettyName(o)}</Chip>)}</div>;
  }
  return (
    <div ref={box} className="relative max-w-full">
      <button type="button" onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
        className="glass flex w-full min-w-0 items-center justify-between gap-3 rounded-full !border-[var(--ember)] px-4 py-2 text-sm sm:w-auto sm:min-w-[15rem]">
        <span className="flex min-w-0 items-center truncate"><span className="text-[var(--text-muted)]">{label}:&nbsp;</span><span className="truncate">{display ?? prettyName(value)}</span>{!display && <TagPill t={tags?.[value]} />}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="glass glass-thick glass-menu absolute left-0 top-12 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-[20px] p-2">
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey}
              role="combobox" aria-expanded aria-controls={`${id}-list`} aria-activedescendant={list[active] ? `${id}-${active}` : undefined}
              aria-label={`Search ${options.length} regions`} placeholder={`Search ${options.length} regions…`}
              className="w-full field rounded-2xl px-3 py-2 text-sm" />
            <ul ref={listRef} id={`${id}-list`} role="listbox" aria-label={label} className="mt-2 max-h-72 overflow-y-auto overscroll-contain">
              {list.map((o, i) => (
                <li key={o} id={`${id}-${i}`} data-i={i} role="option" aria-selected={o === value}
                  onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm ${i === active ? "bg-[var(--surface-2)]" : ""} ${o === value ? "font-medium text-[var(--ember)]" : ""}`}>
                  <span className="truncate">{prettyName(o)}</span><TagPill t={tags?.[o]} />
                </li>
              ))}
              {!list.length && <li className="px-3 py-2 text-sm text-[var(--text-muted)]">No match</li>}
            </ul>
            <p className="px-3 pt-2 text-[11px] text-[var(--text-muted)]">{list.length} of {options.length} · ↑↓ to move, Enter to choose</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
