"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Pill } from "@/components/ui";
import { getCountryTable } from "@/lib/data";
import { prettyName, searchText } from "@/lib/names";

/**
 * "Where are you?": one country field with autocomplete (countries.json, the same
 * entries as the search palette), or the browser's location as a 1° box. Either opens
 * /report, which picks the area's most unusual month itself when no month is given.
 * The suggestion list floats over the page and the helper line keeps one fixed line,
 * so nothing below moves.
 */
interface Opt { key: string; raw: boolean }

const HELP = "Type a country, or share your location for a 1° box around you.";

export function WhereBox() {
  const router = useRouter();
  const id = useId();
  const [opts, setOpts] = useState<Opt[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    getCountryTable().then((t) => setOpts([
      ...t.countries.map((c) => ({ key: c.country, raw: false })),
      ...(t.not_fitted ?? []).filter((c) => c.has_raw_calendar).map((c) => ({ key: c.country, raw: true })),
    ].sort((a, b) => prettyName(a.key).localeCompare(prettyName(b.key))))).catch(() => setMsg("The country list did not load. Your location still works."));
  }, []);
  useEffect(() => {
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);

  const list = useMemo(() => {
    const n = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (!n) return [];
    const starts = opts.filter((o) => searchText(o.key).startsWith(n));
    return [...starts, ...opts.filter((o) => !starts.includes(o) && searchText(o.key).includes(n))].slice(0, 8);
  }, [opts, q]);

  const go = (o: Opt | undefined) => {
    if (!o) { setMsg(q.trim() ? `No country matches “${q.trim()}”.` : HELP); return; }
    setOpen(false); setQ(prettyName(o.key));
    router.push(`/report?country=${encodeURIComponent(o.key)}`);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); go(open ? list[active] : list[0]); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(list.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Escape") setOpen(false);
  };
  const locate = () => {
    if (!("geolocation" in navigator)) { setMsg("This browser cannot share a location. Type a country instead."); return; }
    setLocating(true); setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude.toFixed(2), lon = p.coords.longitude.toFixed(2);
        router.push(`/report?at=${lat},${lon}`);
      },
      () => { setLocating(false); setMsg("Location was not shared. Type a country instead."); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const showList = open && list.length > 0;
  return (
    <section aria-labelledby={`${id}-h`} className="mt-12" data-testid="where-box">
      <form ref={box} onSubmit={submit} role="search" className="tile p-5 sm:p-6">
        <label id={`${id}-h`} htmlFor={`${id}-in`} className="display block text-[clamp(1.25rem,1rem+0.8vw,1.6rem)]">Where are you?</label>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <input id={`${id}-in`} value={q} placeholder="Country, e.g. Brazil" autoComplete="off" spellCheck={false}
              role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={`${id}-list`}
              aria-activedescendant={showList && list[active] ? `${id}-${active}` : undefined} aria-describedby={`${id}-help`}
              onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); setMsg(null); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
              className="field w-full px-5 py-3 text-[16px] outline-none" />
            {showList && (
              <ul id={`${id}-list`} role="listbox" aria-label="Countries"
                className="glass glass-thick glass-menu absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-72 overflow-y-auto overscroll-contain rounded-[20px] p-2">
                {list.map((o, i) => (
                  <li key={o.key} id={`${id}-${i}`} role="option" aria-selected={i === active}
                    onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(o); }}
                    className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-[15px] ${i === active ? "bg-[var(--surface-2)]" : ""}`}>
                    <span className="truncate">{prettyName(o.key)}</span>
                    {o.raw && <span className="ml-2 shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">raw only</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Pill type="submit" tone="red">Open report</Pill>
            <button type="button" onClick={locate} disabled={locating}
              className="rounded-full px-2 py-2 text-[15px] underline decoration-dotted underline-offset-4 hover:decoration-solid disabled:opacity-60">
              or use my location
            </button>
          </div>
        </div>
        <p id={`${id}-help`} aria-live="polite" className="mt-3 line-clamp-2 min-h-10 text-[13px] leading-5 text-[var(--text-secondary)]">{msg ?? HELP}</p>
      </form>
    </section>
  );
}
