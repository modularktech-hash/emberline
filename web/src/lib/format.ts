/**
 * The one number style for the whole site. Every figure a reader sees goes
 * through one of these, so the same kind of number always looks the same:
 *
 *   counts      120,306        thousands separators, no decimals      fmtInt
 *   compact     120K, 4.5M     only where space is tight (axes, dots)  fmtCompact (lib/ember)
 *   ratios      ×1.23          two decimals, multiplication sign       fmtRatio
 *   R²          0.81, −5.3     two decimals (one when |v| ≥ 10)         fmtR2
 *   signed      +1.2, −3.4     explicit sign, true minus (U+2212)      fmtSigned
 *   percent     +4.1%          signed, one decimal                     fmtPct
 *   clock       13:48          local solar or UTC, 24 h                fmtClock
 *   missing     —              (tables) or "not available" (panels)    MISSING / NA
 *
 * Negative numbers always use the true minus sign "−", never a hyphen.
 */

export const MINUS = "−";
export const MISSING = "—";
export const NA = "not available";

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const minus = (s: string) => s.replace(/^-/, MINUS);

/** Fixed decimals with thousands separators and a true minus. */
export function fmtNum(v: number | null | undefined, dp = 0, empty = MISSING): string {
  if (!ok(v)) return empty;
  return minus(v.toLocaleString("en", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
}
export const fmtInt = (v: number | null | undefined, empty = MISSING) => fmtNum(v == null ? v : Math.round(v), 0, empty);

/** Always signed: "+1.2", "−3.4", "0.0". */
export function fmtSigned(v: number | null | undefined, dp = 1, empty = MISSING): string {
  if (!ok(v)) return empty;
  const s = fmtNum(Math.abs(v), dp);
  return Number(v.toFixed(dp)) > 0 ? `+${s}` : Number(v.toFixed(dp)) < 0 ? `${MINUS}${s}` : s;
}
export const fmtPct = (v: number | null | undefined, dp = 1, empty = MISSING) => (ok(v) ? `${fmtSigned(v, dp)}%` : empty);
export const fmtRatio = (v: number | null | undefined, dp = 2, empty = MISSING) => (ok(v) ? `×${fmtNum(v, dp)}` : empty);
export const fmtR2 = (v: number | null | undefined, empty = MISSING) => (ok(v) ? fmtNum(v, Math.abs(v) >= 10 ? 1 : 2) : empty);

/** Hours (13.75) to "13:45". */
export function fmtClock(h: number | null | undefined, empty = MISSING): string {
  if (!ok(h)) return empty;
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
}
/** Signed minutes between two clock times: "+71 min", "−58 min". */
export const fmtMinutes = (hours: number | null | undefined, empty = MISSING) => (ok(hours) ? `${fmtSigned(hours * 60, 0)} min` : empty);

/** FIRMS-style stamps ("2026-11-14T11:10Z") to a Date; null if unparseable. */
export function parseUtc(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** "14 Nov 2026, 11:10 UTC". */
export function fmtUtc(d: Date | null, empty = NA): string {
  if (!d) return empty;
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${day}, ${fmtClock(d.getUTCHours() + d.getUTCMinutes() / 60)} UTC`;
}
/** "just now", "42 min ago", "3 h ago", "2 days ago". */
export function fmtAge(from: Date | null, now: Date | null): string | null {
  if (!from || !now) return null;
  const min = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (min < 2) return "just now";
  if (min < 90) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
/** A year span with an en dash: "2012–2021". */
export const span = (a: number | string, b: number | string) => `${a}–${b}`;
