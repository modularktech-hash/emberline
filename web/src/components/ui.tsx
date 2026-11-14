"use client";

import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts its children into view once, as they scroll in. */
export function Reveal({ children, delay = 0, y = 28, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.8, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

/** Staggers a list of children into view. */
export function Stagger({ children, className, gap = 0.08 }: { children: ReactNode[]; className?: string; gap?: number }) {
  return (
    <div className={className}>
      {children.map((c, i) => <Reveal key={i} delay={i * gap}>{c}</Reveal>)}
    </div>
  );
}

/** Counts up to a number when scrolled into view. */
export function CountUp({ to, decimals = 0, prefix = "", suffix = "", className }: { to: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${v.toLocaleString("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`);
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, to, { duration: 1.6, ease: EASE });
    return () => c.stop();
  }, [inView, mv, to]);
  return <motion.span ref={ref} className={`tabular ${className ?? ""}`}>{text}</motion.span>;
}

export function PageHead({ eyebrow, title, italic, lede }: { eyebrow: string; title: string; italic?: string; lede: ReactNode }) {
  return (
    <header className="pb-10 pt-16 sm:pt-20">
      <Reveal><p className="eyebrow">{eyebrow}</p></Reveal>
      <Reveal delay={0.06}>
        <h1 className="display mt-4 max-w-4xl text-[2.9rem] leading-[1.02] sm:text-[4.6rem]">
          {title}{italic && <> <span className="italic text-[var(--ember)]">{italic}</span></>}
        </h1>
      </Reveal>
      <Reveal delay={0.12}><p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--text-secondary)]">{lede}</p></Reveal>
    </header>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="glass flex rounded-full p-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={`relative z-10 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${value === o.value ? "text-[#f7f3e8]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
          {value === o.value && <motion.span layoutId={`seg-${label}`} className="glass-dark absolute inset-0 -z-10" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`glass rounded-full px-3.5 py-1.5 text-sm ${on ? "!border-[var(--ember)] text-[var(--text-primary)] shadow-[0_0_0_3px_rgba(217,67,26,0.14)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
      {children}
    </button>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className="display tabular mt-2 text-4xl">{value}</p>
      {note && <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{note}</p>}
    </div>
  );
}

export function Loading({ h = 320 }: { h?: number }) {
  return <div className="animate-pulse rounded-2xl bg-[var(--surface-2)]" style={{ height: h }} />;
}
export function Failed({ error }: { error: Error }) {
  return <p className="rounded-2xl border border-[var(--hairline)] p-5 text-sm text-[var(--text-secondary)]">Could not load the data: {error.message}</p>;
}
