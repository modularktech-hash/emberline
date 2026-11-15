"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { INFO } from "@/content/info";
import { getCountryTable } from "@/lib/data";
import { ALL } from "@/lib/nav";
import { prettyName } from "@/lib/names";

/**
 * Search: a full-screen command palette (the top-bar button, or Cmd/Ctrl-K). It indexes countries
 * (with their fit status), pages, story chapters, glossary terms and datasets, and matches on the
 * client with a small scorer. Choosing a country opens the Explorer on it.
 */
interface Hit { kind: string; label: string; note?: string; href?: string; text?: string }

const CHAPTERS: Hit[] = [
  ["Problem", "The 2012 jump in the raw record", "/#problem"], ["Repair", "How the record was rebuilt", "/#repair"], ["Proof", "Step collapse, False-Record Counter, Find the Seam", "/#proof"],
  ["Your area", "Is this season unusual where I am?", "/#area"], ["Now", "This month so far and the live globe", "/#now"],
].map(([label, note, href]) => ({ kind: "Chapter", label, note, href }));
const DATASETS: Hit[] = [
  ["calendar_harmonized_global.parquet", "Harmonized monthly calendar, every fitted country and grid cell", "/data"],
  ["calendar_raw_global.parquet", "Raw monthly calendar", "/data"], ["params_global.json", "The fit: detection curves, κ and held-out scores", "/data"],
  ["countries.json", "One row per country: totals, 2012 step, held-out R²", "/data"], ["proof.json", "Step collapse, benchmark and blind tests", "/method#proof"],
  ["season.json", "Season onset, peak and end per country and year", "/trends"], ["month_to_date.json", "This month so far, provisional; harmonized where the NOAA-20 bridge passed", "/seasons"],
  ["bridge.json", "NOAA-20 to Suomi-NPP bridge and its held-out test", "/method#bridge"],
  ["manifest.json", "Every published file with hash, columns and units", "/data"], ["CITATION.cff", "How to cite Emberline", "https://github.com/modularktech-hash/emberline/blob/main/CITATION.cff"],
].map(([label, note, href]) => ({ kind: "Dataset", label, note, href }));

/** Subsequence score: all query letters in order; earlier, adjacent and word-start matches score higher. */
function score(q: string, s: string): number {
  const t = s.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) return 1000 - at * 4 - (t.length - q.length);
  let i = 0, last = -2, sc = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] !== q[i]) continue;
    sc += j === last + 1 ? 8 : j === 0 || t[j - 1] === " " ? 6 : 1;
    last = j; i++;
  }
  return i === q.length ? sc : -1;
}

const OPEN = "emberline:search";
export function SearchButton() {
  return (
    <button type="button" aria-label="Search (Ctrl K)" onClick={() => window.dispatchEvent(new Event(OPEN))}
      className="glass-thin inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--text-primary)]">
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
  );
}

export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [countries, setCountries] = useState<Hit[]>([]);
  const [info, setInfo] = useState<Hit | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const last = useRef<HTMLElement | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const show = () => { last.current = document.activeElement as HTMLElement | null; setOpen(true); };
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); show(); } };
    window.addEventListener(OPEN, show);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener(OPEN, show); window.removeEventListener("keydown", key); };
  }, []);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    document.body.style.overflow = "hidden";
    if (!loaded.current) {
      loaded.current = true;
      getCountryTable().then((t) => setCountries([
        ...t.countries.map((c) => ({ kind: "Country", label: prettyName(c.country), note: c.fit_source === "pooled" ? "harmonized · borrowed curve" : "harmonized · own fit", href: `/explorer?country=${encodeURIComponent(c.country)}` })),
        ...(t.not_fitted ?? []).filter((c) => c.has_raw_calendar).map((c) => ({ kind: "Country", label: prettyName(c.country), note: "uncorrected · raw only", href: `/explorer?country=${encodeURIComponent(c.country)}` })),
      ])).catch(() => { loaded.current = false; });
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const index = useMemo<Hit[]>(() => [
    { kind: "Page", label: "Story", note: "The five chapters", href: "/" },
    ...ALL.map((p) => ({ kind: "Page", label: p.label, note: p.blurb, href: p.href })),
    { kind: "Page", label: "About", note: "Team, credits and limits", href: "/about" },
    ...CHAPTERS, ...countries,
    ...Object.values(INFO).map((g) => ({ kind: "Glossary", label: g.title, text: g.text })),
    ...DATASETS,
  ], [countries]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return index.filter((h) => h.kind === "Page" || h.kind === "Chapter");
    return index.map((h) => ({ h, sc: Math.max(score(s, h.label), score(s, `${h.kind} ${h.label}`) - 20, h.note ? score(s, h.note) - 400 : -1) }))
      .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 24).map((x) => x.h);
  }, [q, index]);

  const close = () => { setOpen(false); setQ(""); setSel(0); setInfo(null); last.current?.focus(); };
  const go = (h: Hit | undefined) => {
    if (!h) return;
    if (!h.href) { setInfo(h); return; }
    close();
    if (/^https?:/.test(h.href)) window.open(h.href, "_blank", "noopener");
    else router.push(h.href);
  };
  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-[95] flex flex-col bg-[var(--bg)]" role="dialog" aria-modal="true" aria-label="Search"
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
        else if (e.key === "Enter") { e.preventDefault(); go(hits[sel]); }
      }}>
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 pt-6 sm:px-8 sm:pt-12">
        <span aria-hidden className="live-dot shrink-0" />
        <input ref={input} id="site-search" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); setInfo(null); }} placeholder="Country, page, term or file"
          role="combobox" aria-expanded="true" aria-controls="search-results" aria-activedescendant={hits[sel] ? `hit-${sel}` : undefined} autoComplete="off" spellCheck={false}
          className="display min-w-0 flex-1 border-0 bg-transparent py-3 text-[clamp(1.6rem,1rem+3vw,2.8rem)] outline-none placeholder:text-[var(--grey-1)] focus-visible:!shadow-none" />
        <button type="button" onClick={close} className="glass-thin shrink-0 px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em]">Esc</button>
      </div>
      <div className="mx-auto mt-2 h-[6px] w-full max-w-3xl px-5 sm:px-8"><div className="dot-rule" /></div>
      <ul id="search-results" role="listbox" aria-label="Results" className="mx-auto mt-3 w-full max-w-3xl flex-1 overflow-y-auto px-3 pb-10 sm:px-6">
        {hits.length === 0 && <li className="px-3 py-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Nothing matches “{q}”.</li>}
        {hits.map((h, i) => (
          <li key={`${h.kind}-${h.label}`} id={`hit-${i}`} role="option" aria-selected={i === sel}>
            <button type="button" tabIndex={-1} onMouseEnter={() => setSel(i)} onClick={() => go(h)}
              className={`flex w-full items-center gap-4 rounded-full px-4 py-3 text-left transition-colors ${i === sel ? "bg-[var(--ink)] text-[var(--on-ink)]" : ""}`}>
              <span className="w-[5.5rem] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] opacity-60">{h.kind}</span>
              <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{h.label}</span>
              {h.note && <span className="hidden min-w-0 max-w-[45%] truncate text-[13px] opacity-60 sm:block">{h.note}</span>}
            </button>
            {info === h && h.text && <p className="mx-4 mb-2 mt-1 rounded-[var(--r-tile)] border-[length:var(--stroke)] border-[var(--hairline)] bg-[var(--surface)] p-4 text-[14px] leading-relaxed text-[var(--text-secondary)]">{h.text}</p>}
          </li>
        ))}
      </ul>
      <p className="border-t-[length:var(--stroke)] border-[var(--hairline)] px-6 py-3 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--text-muted)]">↑ ↓ to move · Enter to open · Esc to close</p>
    </div>
  );
}
