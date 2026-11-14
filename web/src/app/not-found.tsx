import Link from "next/link";
import { DotText } from "@/components/DotMatrix";

export const metadata = { title: "Not found — Emberline" };

/** A lost page, in the house style: dot-matrix 404 on a dark Nothing-style tile. */
export default function NotFound() {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <div className="rounded-[34px] bg-[#141414] px-8 py-10 text-[#f3efe6] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] sm:px-12">
        <div className="flex items-center justify-between gap-6 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
          <span>Signal lost</span><span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-[var(--ember)]" />
        </div>
        <div className="mt-6">
          <DotText text="404" dot={13} gap={4} lit="#f3efe6" dim="rgba(255,255,255,0.06)" />
        </div>
      </div>
      <p className="eyebrow mt-10">Nothing burning here</p>
      <h1 className="display mt-3 text-5xl leading-[1.02] sm:text-6xl">This page <span className="italic text-[var(--ember)]">slipped out of orbit.</span></h1>
      <p className="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-[var(--text-secondary)]">The link may be old, or the address mistyped. The record itself is right where you left it.</p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" data-magnetic className="pill-dark px-6 py-3 text-[15px] font-medium">Back home</Link>
        <Link href="/explorer" data-magnetic className="glass rounded-full px-6 py-3 text-[15px] font-medium">Open the calendar &nbsp;→</Link>
      </div>
    </section>
  );
}
