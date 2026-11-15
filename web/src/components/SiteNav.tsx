"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { SearchButton } from "@/components/Search";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV } from "@/lib/nav";

/**
 * Top bar: the story, then its four groups (Explore, Live, Proof, Data) and About. A group with one
 * page is a plain link. The active item carries the red dot. On phones the menu is a full-screen sheet.
 */
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [path, setPath] = useState(pathname);
  if (path !== pathname) { setPath(pathname); setOpen(null); setMobile(false); }
  const toggle = useRef<HTMLButtonElement>(null);
  const mobileRef = useRef(false);
  useEffect(() => { mobileRef.current = mobile; document.body.style.overflow = mobile ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [mobile]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(null);
      if (mobileRef.current) { setMobile(false); toggle.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Hides on scroll down, returns on scroll up. One passive listener, read once per frame.
  const [hidden, setHidden] = useState(false);
  const menuOpen = useRef(false);
  useEffect(() => { menuOpen.current = !!open || mobile; }, [open, mobile]);
  useEffect(() => {
    let prev = window.scrollY, raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      if (y > 160 && y > prev + 2 && !menuOpen.current) setHidden(true);
      else if (y < prev - 2 || y <= 160) setHidden(false);
      prev = y;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const item = (on: boolean) => `relative flex items-center gap-1.5 rounded-full px-3.5 py-2 font-mono text-[11.5px] uppercase tracking-[0.14em] transition-colors ${on ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`;
  const dot = <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--red)]" />;

  return (
    <header className="sticky top-3 z-50 px-3 transition-transform duration-[480ms] ease-[cubic-bezier(.2,.8,.2,1)] sm:px-6" style={{ transform: hidden ? "translateY(-96px)" : "none" }}
      onMouseLeave={() => setOpen(null)} onFocusCapture={() => setHidden(false)}>
      <div className="glass-nav relative mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-full border-[length:var(--stroke)] border-[var(--hairline)] py-1.5 pl-5 pr-1.5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Emberline home">
          <LogoMark height={10} ink="var(--text-primary)" />
          <span className="dot-num text-[15px] uppercase tracking-[0.2em]">Emberline</span>
        </Link>

        <nav className="hidden items-center lg:flex" aria-label="Main">
          <Link href="/" aria-current={active("/") ? "page" : undefined} className={item(active("/"))} onMouseEnter={() => setOpen(null)}>{active("/") && dot}Story</Link>
          {NAV.map((g) => {
            const on = g.items.some((i) => active(i.href));
            if (g.items.length === 1) return <Link key={g.label} href={g.items[0].href} aria-current={on ? "page" : undefined} className={item(on)} onMouseEnter={() => setOpen(null)}>{on && dot}{g.label}</Link>;
            return (
              <div key={g.label} className="relative" onMouseEnter={() => setOpen(g.label)}>
                <button type="button" aria-expanded={open === g.label} onClick={() => setOpen(open === g.label ? null : g.label)} className={item(on)}>
                  {on && dot}{g.label}
                  <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden className={`transition-transform ${open === g.label ? "rotate-180" : ""}`}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                </button>
                {open === g.label && (
                  <div className="glass-menu fade-in absolute left-1/2 top-[calc(100%+10px)] w-[22rem] -translate-x-1/2 rounded-[var(--r-tile)] border-[length:var(--stroke)] border-[var(--text-primary)] p-2">
                    {g.items.map((i) => (
                      <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined} className="block rounded-[20px] px-4 py-3 transition-colors hover:bg-[var(--surface-alt)]">
                        <span className="flex items-center gap-2 text-[15px] font-medium">{active(i.href) && dot}{i.label}</span>
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-[var(--text-secondary)]">{i.blurb}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <Link href="/about" aria-current={active("/about") ? "page" : undefined} className={item(active("/about"))} onMouseEnter={() => setOpen(null)}>{active("/about") && dot}About</Link>
        </nav>

        <div className="flex items-center gap-1.5">
          <SearchButton />
          <ThemeToggle />
          {(() => {
            // Contextual call to action: never a link to the page you are on.
            const cta = pathname === "/explorer" ? { href: "/method", label: "See the proof" } : { href: "/explorer", label: "Your area" };
            return <Link href={cta.href} className="pill-dark hidden px-4 py-2 font-mono text-[11.5px] uppercase tracking-[0.14em] sm:inline-block">{cta.label}</Link>;
          })()}
          <button ref={toggle} type="button" className="glass-thin flex h-10 w-10 items-center justify-center lg:hidden" aria-label="Menu" aria-expanded={mobile} onClick={() => setMobile(!mobile)}>
            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden><path d={mobile ? "M2 1l12 10M14 1 2 11" : "M1 1h14M1 6h14M1 11h14"} stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
          </button>
        </div>
      </div>

      {mobile && (
        <div className="fade-in fixed inset-x-0 bottom-0 top-[4.25rem] z-40 overflow-y-auto bg-[var(--bg)] px-6 pb-10 pt-4 lg:hidden" role="dialog" aria-label="Menu">
          <Link href="/" className="flex items-center gap-3 border-b-[length:var(--stroke)] border-[var(--hairline)] py-4"><span className="display text-3xl">Story</span>{active("/") && dot}</Link>
          {NAV.map((g) => (
            <div key={g.label} className="border-b-[length:var(--stroke)] border-[var(--hairline)] py-4">
              <p className="eyebrow">{g.label}</p>
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined} className="mt-2 flex items-center gap-3">
                  <span className="display text-3xl">{i.label}</span>{active(i.href) && dot}
                </Link>
              ))}
            </div>
          ))}
          <Link href="/about" className="flex items-center gap-3 py-4"><span className="display text-3xl">About</span>{active("/about") && dot}</Link>
        </div>
      )}
    </header>
  );
}
