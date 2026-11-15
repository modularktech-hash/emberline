// usage: node interact.cjs BASE  -- Explorer interactions at 4x CPU (no network throttle)
const { chromium } = require('playwright');
const BASE = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await p.goto(BASE + '/explorer?perf=high', { waitUntil: 'load' });
  await p.waitForSelector('[aria-label^="Burning activity calendar"]'); await p.waitForTimeout(4000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.evaluate(() => { window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask' }); });
  const lt = async (t0) => (await p.evaluate(() => window.__long)).filter((l) => l[0] >= t0).map((l) => l[1]);
  const now = () => p.evaluate(() => performance.now());
  const out = {};
  // 1. Raw -> Harmonized toggle: click to next two frames
  for (const name of ['Harmonized (corrected)', 'Raw (as recorded)']) {
    const t0 = await now();
    const dt = await p.evaluate((name) => new Promise((res) => { const btn = [...document.querySelectorAll('[aria-label="Series"] button')].find((x) => x.textContent.trim() === name); const t = performance.now(); btn.click(); requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t))); }), name);
    await p.waitForTimeout(1200);
    out['toggle ' + name] = { ms: Math.round(dt), long: await lt(t0) };
  }
  // 2. hover 60 cells
  const t1 = await now();
  const hov = await p.evaluate(async () => { const cells = [...document.querySelectorAll('[aria-label^="Burning activity calendar"] button')].slice(0, 60); const d = [];
    for (const c of cells) { const t = performance.now(); c.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); d.push(performance.now() - t); }
    d.sort((a, b) => a - b); return { median: Math.round(d[30]), p95: Math.round(d[57]), max: Math.round(d[59]) }; });
  out.hover = { ...hov, long: await lt(t1) };
  // 3. country switch: open picker, pick Brazil, wait for calendar
  for (const c of ['Brazil', 'Portugal', 'Brazil']) {
    const t2 = await now();
    await p.click('button[aria-haspopup="listbox"]');
    await p.fill('input[role="combobox"]', c);
    const open = Math.round(await now() - t2);
    const t3 = await now();
    await p.evaluate(() => { window.__sw = performance.now(); document.querySelector('[role="listbox"] li').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await p.waitForFunction((c) => { const btn = document.querySelector('button[aria-haspopup="listbox"]'); return btn.textContent.includes(c) && !document.querySelector('main .animate-pulse') && document.querySelector('[aria-label^="Burning activity calendar"]'); }, c, { polling: 16 });
    const dt = await p.evaluate(() => performance.now() - window.__sw);
    await p.waitForTimeout(1500);
    out['switch ' + c + (out['switch ' + c] ? ' (again)' : '')] = { openPickerMs: open, ms: Math.round(dt), long: await lt(t2) };
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
