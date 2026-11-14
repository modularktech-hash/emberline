"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

import { EASE, SPRING, SPRING_BOUNCY } from "@/lib/motion";
import { DotLoader, DotRule } from "@/components/DotMatrix";
import { Eyebrow } from "@/components/Figure";

/** Fades and lifts its children into view once, as they scroll in (opacity + transform only, compositor-friendly). */
export function Reveal({ children, delay = 0, y = 24, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.7, ease: EASE, delay }}>
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
  const text = useTransform(mv, (v) => `${prefix}${v.toLocaleString("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/^-/, "\u2212")}${suffix}`);
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { mv.set(to); return; }
    const c = animate(mv, to, { duration: 1.6, ease: EASE });
    return () => c.stop();
  }, [inView, mv, to]);
  return <motion.span ref={ref} className={`tabular ${className ?? ""}`}>{text}</motion.span>;
}

export function PageHead({ eyebrow, title, italic, lede }: { eyebrow: string; title: string; italic?: string; lede: ReactNode }) {
  return (
    <header className="pb-12 pt-20 sm:pb-16 sm:pt-28">
      <Reveal><Eyebrow>{eyebrow}</Eyebrow></Reveal>
      <Reveal delay={0.06}>
        <h1 className="display t-d1 mt-4 max-w-4xl">
          {title}{italic && <> <span className="italic text-[var(--ember)]">{italic}</span></>}
        </h1>
      </Reveal>
      <Reveal delay={0.12}><p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-primary)]/80">{lede}</p></Reveal>
      <Reveal delay={0.18}><DotRule className="mt-10" /></Reveal>
    </header>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="glass-thin flex p-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={`relative z-10 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[color,transform] duration-200 active:scale-[0.96] ${value === o.value ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
          {value === o.value && <motion.span layoutId={`seg-${label}`} className="glass absolute inset-0 -z-10 !rounded-full !bg-white/80" transition={SPRING} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`glass-thin px-3.5 py-1.5 text-sm ${on ? "!bg-[rgba(217,67,26,0.16)] font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
      <span className="inline-flex items-center">
        <motion.span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ember)]" initial={false} animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0, width: on ? 6 : 0, marginRight: on ? 6 : 0 }} transition={SPRING_BOUNCY} />
        {children}
      </span>
    </button>
  );
}


export function Loading({ h = 320 }: { h?: number }) {
  return <div className="flex items-center justify-center rounded-[28px] bg-white/35" style={{ height: h }}><DotLoader /></div>;
}
export function Failed({ error }: { error: Error }) {
  return <p className="glass p-5 text-sm text-[var(--text-secondary)]">Could not load the data: {error.message}</p>;
}
