import { Fragment, type ReactNode } from "react";
import { DotStat } from "@/components/DotMatrix";

/**
 * The shared label + figure system (see lib/format.ts for the number rules).
 *
 * Where each figure style is used, everywhere on the site:
 *  - Dot-matrix numerals (`<Stat dot>`): ONE headline figure per panel, a fixed
 *    value read from a data file (home live count, held-out R² cards, the
 *    Explorer's 2012 step, Season-shift headline trends, the globe's total).
 *  - Display figures (`<Stat>` without `dot`): secondary figures in cards and
 *    calculator outputs. Same weight and tracking as headings, tabular digits.
 *  - Body tabular (`.tabular`): tables, inline prose, chart labels.
 */

/**
 * Small-caps label above a section or a figure. "06 · Still shifting" renders
 * the index in ember and every "·" as the same spaced, muted separator.
 */
export function Eyebrow({ children, className = "", as: Tag = "p" }: { children: ReactNode; className?: string; as?: "p" | "span" | "h2" | "h3" }) {
  const parts = typeof children === "string" ? children.split(/\s+·\s+/) : null;
  return (
    <Tag className={`eyebrow ${className}`}>
      {parts
        ? parts.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden className="eyebrow-sep">·</span>}
            {i > 0 && <span className="sr-only">, </span>}
            {/^\d{2}$/.test(p) ? <span className="eyebrow-n">{p}</span> : p}
          </Fragment>
        ))
        : children}
    </Tag>
  );
}

type Tone = "paper" | "dark" | "ember";
const TONE: Record<Tone, { lit?: string; dim?: string; label: string; note: string; src: string }> = {
  paper: { label: "text-[var(--text-secondary)]", note: "text-[var(--text-secondary)]", src: "text-[var(--text-muted)]" },
  dark: { lit: "#f3efe6", dim: "rgba(255,255,255,0.07)", label: "text-white/60", note: "text-white/75", src: "text-white/50" },
  ember: { lit: "#fff", dim: "rgba(255,255,255,0.16)", label: "text-white/80", note: "text-white/85", src: "text-white/70" },
};

/**
 * One figure: label (what it is), value, unit, a plain-language note, and its
 * source. `dot` draws the value in dot-matrix numerals (headline figures only).
 */
export function Stat({ label, value, unit, note, source, dot = false, size = "md", tone = "paper", className = "" }: {
  label: ReactNode; value: string | ReactNode; unit?: ReactNode; note?: ReactNode; source?: ReactNode;
  dot?: boolean | number; size?: "sm" | "md" | "lg"; tone?: Tone; className?: string;
}) {
  const t = TONE[tone];
  const dotSize = typeof dot === "number" ? dot : size === "lg" ? 9 : size === "md" ? 6 : 4;
  const text = size === "lg" ? "text-6xl" : size === "md" ? "text-4xl" : "text-2xl";
  return (
    <div className={className}>
      <Eyebrow className={`!text-inherit ${t.label}`}>{label}</Eyebrow>
      <p className={`stat-value display tabular mt-2 flex flex-wrap items-baseline gap-x-2 ${text}`}>
        {dot && typeof value === "string"
          ? <DotStat text={value} dot={dotSize} lit={t.lit} dim={t.dim} />
          : <span>{value}</span>}
        {unit && <span className={`stat-unit ${t.note}`}>{unit}</span>}
      </p>
      {note && <p className={`mt-2 text-[13px] leading-snug ${t.note}`}>{note}</p>}
      {source && <p className={`stat-source mt-2 ${t.src}`}>{source}</p>}
    </div>
  );
}
