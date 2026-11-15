"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { INFO, type InfoKey } from "@/content/info";

const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");

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

