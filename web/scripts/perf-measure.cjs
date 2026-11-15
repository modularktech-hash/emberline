// Load, slow-profile and route-change timings per route (docs/speed-pass.md).
// usage: NODE_PATH=$(npm root -g) node perf-measure.cjs BASE out.json [runs]
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2], OUT = process.argv[3], RUNS = +(process.argv[4] || 3);
const ONLY = process.env.ROUTES ? process.env.ROUTES.split(',') : null;
const ROUTES = {
  '/': 'HOME', '/explorer': '[aria-label^="Burning activity calendar"]', '/globe': 'main table tbody tr',
  '/compare': 'main svg.w-full', '/seasons': 'svg[aria-label^="Monthly detections"]', '/trends': 'svg[aria-label^="Fire season timing"]',
  '/satellites': 'svg[aria-label^="Mean local solar"]', '/method': 'main table tbody tr', '/lab': 'LAB',
  '/data': 'main table tbody tr', '/about': 'main table',
};
const readyFn = (sel) => {
  const m = document.querySelector('main'); if (!m) return false;
  if (sel && sel !== 'HOME' && sel !== 'LAB' && !m.querySelector(sel) && !document.querySelector(sel)) return false;
  if (sel !== 'HOME' && m.querySelector('.animate-pulse')) return false;
  if (sel === 'LAB' && !/b₀ -?\d/.test(m.innerText)) return false;
  return !/\bloading\b/i.test(m.innerText);
};
const INIT = () => {
  window.__m = { lcp: 0, cls: 0, long: [], fcp: 0 };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  } catch (e) {}
};
async function throttle(cdp, on) {
  await cdp.send('Network.enable');
  if (on) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
}
function track(cdp) {
  const reqs = new Map(); const done = [];
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, type: e.type }));
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) done.push({ ...r, bytes: e.encodedDataLength }); });
  return done;
}
const sum = (a) => a.reduce((s, x) => s + x, 0);
function summarize(done) {
  const p = (u) => new URL(u).pathname;
  const js = done.filter((r) => /\.js$/.test(p(r.url)));
  const data = done.filter((r) => p(r.url).startsWith('/data/'));
  return { jsKB: Math.round(sum(js.map((r) => r.bytes)) / 1024), jsN: js.length, dataKB: Math.round(sum(data.map((r) => r.bytes)) / 1024), dataN: data.length,
    dataFiles: data.map((r) => p(r.url).replace('/data/', '') + ':' + Math.round(r.bytes / 1024)).join(' '), totalKB: Math.round(sum(done.map((r) => r.bytes)) / 1024) };
}
async function loadOnce(browser, route, slow, perf) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await page.addInitScript(INIT); const done = track(cdp); await throttle(cdp, slow);
  const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); }); page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const url = BASE + route + (perf ? `?perf=${perf}` : '');
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
  let ready = null;
  try { await page.waitForFunction(readyFn, ROUTES[route], { timeout: slow ? 90000 : 30000, polling: 50 }); ready = await page.evaluate(() => performance.now()); } catch (e) { ready = -1; }
  await page.waitForTimeout(slow ? 4000 : 2500);
  const m = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, ...window.__m, perf: document.documentElement.dataset.perf || '' }; });
  const tbt = sum(m.long.map(([, d]) => Math.max(0, d - 50)));
  const out = { ttfb: Math.round(m.ttfb), fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), tbt, longMax: Math.max(0, ...m.long.map((l) => l[1])), longN: m.long.length, cls: +m.cls.toFixed(3), ready: Math.round(ready), perf: m.perf, errors, ...summarize(done) };
  await ctx.close(); return out;
}
async function transition(browser, route, slow) {
  // start on /about (or / for /about) with perf=high so the curtain runs; click a link; time curtain and content.
  const from = route === '/about' ? '/method' : '/about';
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await page.goto(BASE + from + '?perf=high', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3500); // let <Link> prefetch settle
  const done = track(cdp); await throttle(cdp, slow);
  const t0 = Date.now();
  const ok = await page.evaluate((r) => { const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href') === r); if (!a) return false; window.__t0 = performance.now(); a.click(); return true; }, route);
  if (!ok) { await ctx.close(); return { err: 'no link' }; }
  const res = await page.evaluate(async ({ sel, r, fn }) => {
    const ready = new Function('return (' + fn + ')')();
    const out = { curtainUp: 0, covered: 0, uncover: 0, clear: 0, lifted: 0, ready: 0, long: [] };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.startTime >= window.__t0) out.long.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch (e) {}
    const cur = () => document.querySelector('div.fixed.inset-0[aria-hidden].z-\\[100\\]');
    return await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now() - window.__t0; const c = cur();
        if (c && !out.curtainUp) out.curtainUp = now;
        if (c) { const r = c.getBoundingClientRect(); const full = r.top <= 1 && r.bottom >= innerHeight - 1;
          if (full && !out.covered) out.covered = now;
          if (out.covered && !full && !out.uncover) out.uncover = now;
          if (out.uncover && r.bottom <= 1 && !out.clear) out.clear = now; }
        if (out.covered && !c && !out.clear) out.clear = now;
        if (out.curtainUp && !c && !out.lifted) out.lifted = now;
        if (!out.ready && location.pathname === r && ready(sel)) out.ready = now;
        if ((out.ready && (out.lifted || !out.curtainUp && now > 1500)) || now > 60000) return resolve(out);
        setTimeout(tick, 16);
      };
      tick();
    });
  }, { sel: ROUTES[route], r: route, fn: readyFn.toString() });
  await page.waitForTimeout(500);
  const s = summarize(done);
  await ctx.close();
  // curtain: IN 350 slide-in, then hold until lift starts; lifted = removed from DOM (after 450 ms out animation)
  return { covered: Math.round(res.covered), uncover: Math.round(res.uncover), clear: Math.round(res.clear), held: Math.round(res.uncover - res.covered), ready: Math.round(res.ready), tbt: sum(res.long.map((d) => Math.max(0, d - 50))), longMax: Math.max(0, ...res.long), dataKB: s.dataKB, dataN: s.dataN, jsKB: s.jsKB };
}
const med = (rows, k) => { const v = rows.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader'], ...(BASE.startsWith('https') && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
  const result = { base: BASE, when: new Date().toISOString(), fast: {}, slow: {}, trans: {}, transSlow: {} };
  for (const route of Object.keys(ROUTES)) {
    if (ONLY && !ONLY.includes(route)) continue;
    let f = null;
    if (!process.env.TRANS_ONLY) {
    const runs = []; for (let i = 0; i < RUNS; i++) runs.push(await loadOnce(browser, route, false));
    f = { ...runs[0] }; for (const k of ['ttfb', 'fcp', 'lcp', 'tbt', 'longMax', 'ready', 'cls']) f[k] = med(runs, k);
    result.fast[route] = f;
    result.slow[route] = await loadOnce(browser, route, true);
    }
    result.trans[route] = await transition(browser, route, false);
    result.transSlow[route] = await transition(browser, route, true);
    console.log(route, JSON.stringify({ fast: f, slow: result.slow[route], trans: result.trans[route], transSlow: result.transSlow[route] }));
    fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  }
  await browser.close();
})();
