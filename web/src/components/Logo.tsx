/**
 * The "ember + line" logo: a rounded charcoal stroke, a clear gap, and one
 * ember dot slightly larger than the stroke is thick. Hand-written SVG.
 *
 * - <LogoMark/>: the mark only.
 * - <Logo/>: mark + EMBERLINE wordmark, "row" (nav) or "stack" (footer, cards).
 * - mono: single-colour variant (currentColor for both parts).
 */
export const LOGO_INK = "#0b0b0b";
export const LOGO_EMBER = "#d71921";

/** Geometry shared with app/icon.svg and the OG/apple images (viewBox 0 0 40 12). */
export const MARK = { w: 40, h: 12, x1: 3, x2: 24.5, y: 6, stroke: 5, cx: 34, r: 4 };

export function LogoMark({ height = 12, mono = false, ink = LOGO_INK, className = "" }: { height?: number; mono?: boolean; ink?: string; className?: string }) {
  const m = MARK;
  return (
    <svg aria-hidden viewBox={`0 0 ${m.w} ${m.h}`} height={height} width={(height * m.w) / m.h} className={className} focusable="false">
      <line x1={m.x1} x2={m.x2} y1={m.y} y2={m.y} stroke={mono ? "currentColor" : ink} strokeWidth={m.stroke} strokeLinecap="round" />
      <circle cx={m.cx} cy={m.y} r={m.r} fill={mono ? "currentColor" : LOGO_EMBER} />
    </svg>
  );
}

export function Logo({ layout = "row", height = 10, mono = false, ink = LOGO_INK, className = "", wordClass = "" }: {
  layout?: "row" | "stack"; height?: number; mono?: boolean; ink?: string; className?: string; wordClass?: string;
}) {
  return (
    <span className={`inline-flex ${layout === "row" ? "items-center gap-2.5" : "flex-col items-start gap-2"} ${className}`}>
      <LogoMark height={height} mono={mono} ink={ink} />
      <span className={`font-medium uppercase tracking-[0.3em] ${wordClass}`}>Emberline</span>
    </span>
  );
}
