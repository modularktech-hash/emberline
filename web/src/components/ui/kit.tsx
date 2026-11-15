"use client";

/**
 * The component kit. One set of parts, used on every page.
 *
 * Tile          surface block. shape: "square" (one radius) | "circle" | "pill"; tone: "paper" | "alt" | "ink"; tilt: lifts with the pointer.
 * StatTile      one dot-matrix number + mono label + optional "i" (info), unit, note, source.
 * InfoDot       the "i". `k` reads content/info.ts; or pass `title` and children.
 * Pill          pill button or link. tone: "ink" | "red" (the one primary action) | "line".
 * IconButton    circular icon button; `label` is required.
 * SegmentedControl  same as Segmented in ./base.
 * Toggle        on/off switch with a label.
 * Popover       anchored panel used by InfoDot; Tooltip is its hover form.
 * Sheet         modal panel from the right (bottom on phones). Esc closes, focus returns.
 * Expand        progressive disclosure (details/summary).
 * DotDigits     dot-matrix number that counts up once when scrolled into view. No layout shift.
 * DotSkeleton   dot-grid placeholder shaped like the thing that is loading.
 * SectionHead   eyebrow + headline + one sentence.
 * SourceChip    NASA source badge.
 * ChartFrame    title, "i", legend, source line and actions around a chart.
 */
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { INFO, type InfoKey } from "@/content/info";
import { isPerfLow } from "@/lib/perf";
import { Eyebrow } from "@/components/Figure";
import { Segmented } from "./base";

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");
const still = () => typeof window === "undefined" || isPerfLow() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ Tile */
export function Tile({ shape = "square", tone = "paper", tilt = false, as: Tag = "div", className, children, ...rest }: {
  shape?: "square" | "circle" | "pill"; tone?: "paper" | "alt" | "ink"; tilt?: boolean; as?: "div" | "section" | "article" | "li";
  className?: string; children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement | null>(null);
  const onMove = useCallback((e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || still()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ty", `${(px * 6).toFixed(2)}deg`);
    el.style.setProperty("--tx", `${(-py * 6).toFixed(2)}deg`);
    el.style.setProperty("--tl", "-3px");
  }, []);
  const onLeave = useCallback(() => { const el = ref.current; if (el) { el.style.setProperty("--tx", "0deg"); el.style.setProperty("--ty", "0deg"); el.style.setProperty("--tl", "0"); } }, []);
  const T = Tag as "div";
  return (
    <T ref={ref as React.Ref<HTMLDivElement>} {...rest} onPointerMove={tilt ? onMove : undefined} onPointerLeave={tilt ? onLeave : undefined}
      className={cx("tile", tone === "alt" && "tile-alt", tone === "ink" && "tile-ink", shape === "circle" && "tile-circle", shape === "pill" && "!rounded-full", tilt && "tilt", className)}>
      {children}
    </T>
  );
}

/* ------------------------------------------------------------- Popover / InfoDot */
export function Popover({ open, onClose, anchor, children, id, align = "end" }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; children: ReactNode; id?: string; align?: "start" | "end" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { onClose(); anchor.current?.focus(); } };
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !anchor.current?.contains(t)) onClose(); };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", down); };
  }, [open, onClose, anchor]);
  if (!open) return null;
  return (
    <div ref={ref} id={id} role="tooltip"
      className={cx("fade-in absolute top-[calc(100%+8px)] z-40 w-[min(18rem,calc(100vw-2.5rem))] rounded-[var(--r-tile)] border-[length:var(--stroke)] border-[var(--text-primary)] bg-[var(--surface)] p-4 text-left text-[13px] font-normal normal-case leading-relaxed tracking-normal text-[var(--text-secondary)] shadow-[var(--shadow-2)]", align === "end" ? "right-0" : "left-0")}>
      {children}
    </div>
  );
}

/** The "i": a small circle that explains its block in one or two plain sentences. */
export function InfoDot({ k, title, children, className, align = "end" }: { k?: InfoKey; title?: string; children?: ReactNode; className?: string; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const entry = k ? INFO[k] : undefined;
  const heading = title ?? entry?.title;
  const close = useCallback(() => setOpen(false), []);
  return (
    <span className={cx("relative inline-flex align-middle", className)}>
      <button ref={btn} type="button" aria-label={`About ${heading ?? "this"}`} aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cx("inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-[length:var(--stroke)] font-mono text-[11px] font-bold leading-none transition-colors",
          open ? "border-[var(--red)] bg-[var(--red)] text-white" : "border-[var(--grey-2)] text-[var(--text-muted)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]")}>i</button>
      <Popover open={open} onClose={close} anchor={btn} id={id} align={align}>
        {heading && <span className="mb-1 block font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]">{heading}</span>}
        <span className="block">{children ?? entry?.text}</span>
      </Popover>
    </span>
  );
}
export const Tooltip = InfoDot;

/* --------------------------------------------------------------- Buttons */
type PillTone = "ink" | "red" | "line";
const pillCls = (tone: PillTone, size: "sm" | "md") => cx(tone === "red" ? "pill-red" : tone === "ink" ? "pill-dark" : "glass-thin text-[var(--text-primary)]",
  "inline-flex items-center justify-center gap-2 font-medium", size === "sm" ? "px-4 py-1.5 text-sm" : "px-6 py-3 text-[15px]");
export function Pill({ href, tone = "ink", size = "md", className, children, ...rest }: { href?: string; tone?: PillTone; size?: "sm" | "md"; className?: string; children: ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  if (href) return /^https?:/.test(href)
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={cx(pillCls(tone, size), className)}>{children}</a>
    : <Link href={href} className={cx(pillCls(tone, size), className)}>{children}</Link>;
  return <button type="button" {...rest} className={cx(pillCls(tone, size), className)}>{children}</button>;
}
export function IconButton({ label, className, children, ...rest }: { label: string; className?: string; children: ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-label">) {
  return <button type="button" aria-label={label} {...rest} className={cx("glass-thin inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--text-primary)]", className)}>{children}</button>;
}
export const SegmentedControl = Segmented;
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="inline-flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
      <span className={cx("relative h-6 w-11 rounded-full border-[length:var(--stroke)] transition-colors", on ? "border-[var(--ink)] bg-[var(--ink)]" : "border-[var(--grey-2)]")}>
        <span className={cx("absolute top-[3px] h-[15px] w-[15px] rounded-full transition-[left,background-color] duration-200", on ? "left-[22px] bg-[var(--red)]" : "left-[3px] bg-[var(--grey-2)]")} />
      </span>
      {label}
    </button>
  );
}

/* ----------------------------------------------------------------- Sheet */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const last = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    last.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),input,select,[tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        const first = f[0], end = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
        else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = prev; last.current?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="fade-in absolute inset-0 cursor-default bg-[color-mix(in_srgb,var(--ink)_45%,transparent)]" />
      <div ref={panel} tabIndex={-1} className="page-in relative max-h-[86vh] w-full overflow-y-auto rounded-t-[var(--r-tile)] border-[length:var(--stroke)] border-[var(--text-primary)] bg-[var(--surface)] p-6 outline-none sm:max-h-none sm:w-[min(34rem,92vw)] sm:rounded-none sm:rounded-l-[var(--r-tile)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2 className="display t-d3">{title}</h2>
          <IconButton label="Close" onClick={onClose}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg></IconButton>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Expand */
export function Expand({ label, children, className, open }: { label: ReactNode; children: ReactNode; className?: string; open?: boolean }) {
  return (
    <details className={cx("foot-group group border-t-[length:var(--stroke)] border-[var(--hairline)]", className)} open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[15px] font-medium text-[var(--text-primary)]">
        <span>{label}</span>
        <span aria-hidden className="foot-plus inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[length:var(--stroke)] border-[var(--grey-2)] font-mono text-sm leading-none text-[var(--text-muted)] group-hover:border-[var(--text-primary)]">+</span>
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------- DotDigits */
/**
 * A headline number in the dot-matrix face. The final text is what renders on the server and under
 * reduced motion; with motion allowed it resolves once, digit by digit, when it scrolls into view.
 * The final text always holds the box, so nothing shifts.
 */
export function DotDigits({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const live = useRef<HTMLSpanElement>(null);
  const played = useRef("");
  useEffect(() => {
    const el = ref.current, out = live.current;
    if (!el || !out) return;
    out.textContent = text;
    if (played.current === text || still() || typeof IntersectionObserver === "undefined") { played.current = text; return; }
    let raf = 0;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      played.current = text;
      const chars = [...text];
      const t0 = performance.now(), dur = Math.min(1100, 420 + chars.length * 60);
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const settled = Math.floor(p * chars.length);
        out.textContent = chars.map((c, i) => (i < settled || !/\d/.test(c) ? c : String(Math.floor((Number(c) + (1 - p) * 10 * (i + 3)) % 10)))).join("");
        if (p < 1) raf = requestAnimationFrame(tick); else out.textContent = text;
      };
      raf = requestAnimationFrame(tick);
    }, { rootMargin: "-40px" });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); if (out) out.textContent = text; };
  }, [text]);
  return (
    <span ref={ref} className={cx("dot-num relative inline-grid", className)} style={style}>
      <span className="invisible col-start-1 row-start-1" aria-hidden>{text}</span>
      <span ref={live} className="col-start-1 row-start-1" suppressHydrationWarning>{text}</span>
    </span>
  );
}

export function DotSkeleton({ h = 280, className, label }: { h?: number | string; className?: string; label?: string }) {
  return <div role="status" aria-label={label ?? "Loading"} className={cx("dot-skel", className)} style={{ height: h }} />;
}

/* ------------------------------------------------------------ SectionHead */
export function SectionHead({ eyebrow, title, accent, lede, info, as: Tag = "h2", size = "d2", className, id }: {
  eyebrow: string; title: ReactNode; accent?: string; lede?: ReactNode; info?: InfoKey; as?: "h1" | "h2" | "h3"; size?: "hero" | "d1" | "d2" | "d3"; className?: string; id?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-3"><Eyebrow>{eyebrow}</Eyebrow>{info && <InfoDot k={info} align="start" />}</div>
      <Tag id={id} className={cx("display mt-3 max-w-4xl", `t-${size}`)}>{title}{accent && <> <span className="italic">{accent}</span></>}</Tag>
      {lede && <p className="mt-4 max-w-[62ch] text-[1.05em] leading-relaxed text-[var(--text-secondary)]">{lede}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- StatTile */
export function StatTile({ label, value, unit, note, source, info, tone = "paper", shape = "square", className, size = "md" }: {
  label: string; value: string | null | undefined; unit?: ReactNode; note?: ReactNode; source?: ReactNode; info?: InfoKey;
  tone?: "paper" | "alt" | "ink"; shape?: "square" | "circle"; className?: string; size?: "sm" | "md" | "lg";
}) {
  const fs = size === "lg" ? "text-[clamp(3rem,2rem+5vw,5.5rem)]" : size === "md" ? "text-[clamp(2.4rem,1.8rem+2.4vw,3.6rem)]" : "text-3xl";
  return (
    <Tile tone={tone} shape={shape} tilt className={cx("flex flex-col p-5 sm:p-6", shape === "circle" && "items-center justify-center text-center", className)}>
      <div className={cx("flex items-start gap-3", shape === "circle" ? "justify-center" : "justify-between")}>
        <Eyebrow className="!text-inherit opacity-70">{label}</Eyebrow>
        {info && <InfoDot k={info} />}
      </div>
      <p className={cx("mt-4 flex flex-wrap items-baseline gap-x-2 leading-none", shape === "circle" && "justify-center")}>
        {value == null ? <span className="font-mono text-sm uppercase tracking-[0.14em] opacity-60">not recorded</span> : <DotDigits text={value} className={fs} />}
        {unit && value != null && <span className="stat-unit opacity-70">{unit}</span>}
      </p>
      {note && <p className="mt-3 text-[13.5px] leading-snug opacity-80">{note}</p>}
      {source && <p className="stat-source mt-auto pt-3 opacity-60">{source}</p>}
    </Tile>
  );
}

/* -------------------------------------------------------------- SourceChip */
export function SourceChip({ name, detail, href }: { name: string; detail?: string; href?: string }) {
  const inner = (
    <>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--text-primary)]" />
      <span className="font-bold">{name}</span>
      {detail && <span className="opacity-60">{detail}</span>}
    </>
  );
  const cls = "inline-flex items-center gap-2 rounded-full border-[length:var(--stroke)] border-[var(--hairline)] bg-[var(--surface)] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--text-secondary)]";
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className={cx(cls, "no-ul hover:border-[var(--text-primary)]")}>{inner}</a> : <span className={cls}>{inner}</span>;
}

/* -------------------------------------------------------------- ChartFrame */
export function ChartFrame({ title, eyebrow, info, legend, source, actions, children, className }: {
  title?: ReactNode; eyebrow?: string; info?: InfoKey; legend?: Array<{ label: string; color: string; shape?: "dot" | "line" | "diamond" }>;
  source?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <figure className={cx("tile min-w-0 p-5 sm:p-6", className)}>
      {(title || eyebrow || info || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && <figcaption className="display mt-1 text-xl">{title}</figcaption>}
          </div>
          <div className="flex items-center gap-2">{actions}{info && <InfoDot k={info} />}</div>
        </div>
      )}
      {legend && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)]">
          {legend.map((l) => (
            <li key={l.label} className="inline-flex items-center gap-2">
              <span aria-hidden className={cx("inline-block", l.shape === "line" ? "h-[3px] w-5 rounded-full" : l.shape === "diamond" ? "h-2 w-2 rotate-45" : "h-2.5 w-2.5 rounded-full")} style={{ background: l.color }} />{l.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 min-w-0">{children}</div>
      {source && <p className="stat-source mt-4 border-t-[length:var(--stroke)] border-[var(--hairline)] pt-3 text-[var(--text-muted)]">{source}</p>}
    </figure>
  );
}
