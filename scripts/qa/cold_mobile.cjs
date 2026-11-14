#!/usr/bin/env node
/*
 * E47 cold mobile time-to-analysis (measure only).
 *
 * Emulates a mid-range phone (Moto G Power class: 412x823 @1.75x, mobile UA,
 * touch), 4x CPU throttle and Lighthouse "Slow 4G" (1.6 Mbps down / 750 kbps
 * up / 150 ms RTT) via the Chrome DevTools Protocol. Each run is a fresh
 * browser context with the HTTP cache disabled (cold). Median of N runs.
 *
 * Metrics per route:
 *   home:     FCP, LCP (first meaningful content proxy), load, transferred bytes
 *   explorer: FCP, LCP, time until the calendar is usable = at least 12
 *             month buttons in the "Burning activity calendar" region carry a
 *             number in their aria-label (default selection), transferred bytes
 * Bytes = sum of CDP Network.loadingFinished encodedDataLength (over the wire,
 * incl. headers) until the metric is reached plus 2 s settle.
 *
 * Usage: node scripts/qa/cold_mobile.cjs <baseURL> [runs=3] [label]
 * Prints one JSON object (all runs + medians) on stdout.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const RUNS = Number(process.argv[3] || 3);
const LABEL = process.argv[4] || BASE;
const NET = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const UA = "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const TIMEOUT = 180000;

function med(xs) { const s = xs.filter((x) => x != null).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

async function measure(browser, route) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, userAgent: UA });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", NET);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const bytes = { total: 0, byType: {}, byUrl: {} };
  const types = {};
  cdp.on("Network.responseReceived", (e) => { types[e.requestId] = [e.type, e.response.url]; });
  cdp.on("Network.loadingFinished", (e) => {
    const [t, u] = types[e.requestId] || ["Other", "?"];
    bytes.total += e.encodedDataLength;
    bytes.byType[t] = (bytes.byType[t] || 0) + e.encodedDataLength;
    const key = u.replace(BASE, "").split("?")[0];
    bytes.byUrl[key] = (bytes.byUrl[key] || 0) + e.encodedDataLength;
  });
  await page.addInitScript(() => {
    window.__lcp = null;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const t0 = Date.now();
  let usable = null, error = null;
  try {
    await page.goto(BASE + route, { waitUntil: "load", timeout: TIMEOUT });
    if (route === "/explorer") {
      await page.waitForFunction(() => {
        const r = document.querySelector('[aria-label^="Burning activity calendar"]');
        if (!r) return false;
        return [...r.querySelectorAll("button[aria-label]")].filter((b) => /: [\d.,]+[kKM]?$/.test(b.getAttribute("aria-label"))).length >= 12;
      }, null, { timeout: TIMEOUT, polling: 100 });
      usable = Date.now() - t0;
    }
  } catch (e) { error = String(e).split("\n")[0]; }
  await page.waitForTimeout(2000);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return { fcp: fcp ? fcp.startTime : null, lcp: window.__lcp, load: n ? n.loadEventEnd : null, ttfb: n ? n.responseStart : null };
  });
  await ctx.close();
  const top = Object.entries(bytes.byUrl).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { route, ...nav, calendar_usable_ms: usable, bytes: bytes.total, bytes_by_type: bytes.byType, top_urls: top, error };
}

(async () => {
  const browser = await chromium.launch();
  const out = { base: LABEL, profile: { device: "412x823@1.75 mobile", cpu_throttle: 4, network: "Slow 4G 1.6Mbps/750kbps/150ms", cache: "disabled, fresh context per run" }, runs: RUNS, routes: {} };
  for (const route of ["/", "/explorer"]) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) { const r = await measure(browser, route); rs.push(r); process.stderr.write(`${LABEL}${route} run ${i + 1}: ${JSON.stringify({ fcp: r.fcp, lcp: r.lcp, usable: r.calendar_usable_ms, bytes: r.bytes, error: r.error })}\n`); }
    out.routes[route] = {
      median: { fcp_ms: med(rs.map((r) => r.fcp)), lcp_ms: med(rs.map((r) => r.lcp)), load_ms: med(rs.map((r) => r.load)), calendar_usable_ms: med(rs.map((r) => r.calendar_usable_ms)), bytes: med(rs.map((r) => r.bytes)) },
      runs: rs,
    };
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})();
