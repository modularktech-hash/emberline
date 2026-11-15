/**
 * Runs `fn` once: when `el` comes within `margin` of the viewport, or once the page has loaded and
 * the browser is idle, whichever is first. Below-the-fold content (the footer) must not wait for a
 * scroll to fetch its data: a full-page capture, print, find-in-page or an anchor jump can show it
 * without it ever intersecting. Returns a cleanup function.
 */
export function whenNearOrIdle(el: Element, fn: () => void, margin = "300px"): () => void {
  let done = false, idle = 0, timer = 0;
  const fire = () => { if (done) return; done = true; io?.disconnect(); fn(); };
  const io = typeof IntersectionObserver === "undefined" ? null
    : new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) fire(); }, { rootMargin: margin });
  io?.observe(el);
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const onLoad = () => { timer = window.setTimeout(() => { if (ric) idle = ric(fire, { timeout: 2500 }); else fire(); }, 600); };
  if (!io) fire();
  else if (document.readyState === "complete") onLoad(); else window.addEventListener("load", onLoad, { once: true });
  return () => {
    done = true; io?.disconnect(); clearTimeout(timer); window.removeEventListener("load", onLoad);
    const cic = (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
    if (idle && cic) cic(idle);
  };
}
