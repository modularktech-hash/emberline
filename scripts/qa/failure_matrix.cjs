#!/usr/bin/env node
/*
 * E48 data-failure matrix. Test only; does not touch web/src.
 *
 * Against a running production build of web/ (`next build && next start`),
 * load every page once with nothing blocked and once per blocked data file,
 * and record what the user sees: error text, a retry control, fallback
 * requests (e.g. params.json fetched after params_global.json failed), and
 * whether numbers are still rendered with no error shown (candidate silent
 * wrong / mixed data). For a blocked file that has a retry control, it also
 * unblocks, clicks retry and records whether the page recovers.
 *
 * Usage: BASE=http://localhost:3123 node scripts/qa/failure_matrix.cjs > out.json
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const BASE = process.env.BASE || "http://localhost:3123";
const PAGES = (process.env.PAGES || "/,/explorer,/trends,/seasons,/compare,/globe,/lab,/data,/method,/satellites,/about").split(",");
const BLOCKS = {
  none: null,
  params_global: /\/data\/params_global\.json/,
  calendar_global: /\/data\/calendar_(raw|harmonized)_global\.parquet/,
  coverage_status: /\/data\/coverage_status\.json/,
  season: /\/data\/season\.json/,
  countries: /\/data\/countries\.json/,
  manifest: /\/data\/manifest\.json/,
  map_tiles: /tiles\.openfreemap\.org|\.pbf(\?|$)/,
};
const ERR_RE = /(could not|couldn't|failed|unavailable|error|not load|try again|retry|offline|timed out|fallback|four-country|4-country)/i;

async function visit(browser, path, name, re) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let blocked = true;
  const requested = new Set();
  const blockedHits = new Set();
  page.on("request", (r) => {
    const u = r.url();
    if (/\/data\//.test(u)) requested.add(u.replace(/^.*\/data\//, "").split("?")[0]);
  });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e.message).slice(0, 160)));
  if (re) {
    await page.route("**/*", (route) => {
      const u = route.request().url();
      if (blocked && re.test(u)) {
        blockedHits.add(u.replace(/^.*\/data\//, "").split("?")[0].slice(0, 80));
        return route.abort("failed");
      }
      return route.continue();
    });
  }
  const res = { page: path, blocked: name };
  try {
    await page.goto(BASE + path, { waitUntil: "load", timeout: 30000 });
  } catch (e) {
    res.navError = String(e.message).slice(0, 120);
  }
  await page.waitForTimeout(Number(process.env.SETTLE_MS || 9000));
  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  res.blockedHits = [...blockedHits];
  res.requested = [...requested].sort();
  res.errorLines = [...new Set(lines.filter((l) => ERR_RE.test(l) && l.length < 240))].slice(0, 6);
  const retry = page.getByRole("button", { name: /retry|try again|reload/i });
  res.retryButtons = await retry.count();
  res.numbersShown = (text.match(/\b\d{1,3}(,\d{3})+\b|\b\d+\.\d+\b/g) || []).length;
  res.bodyChars = text.length;
  res.pageErrors = consoleErrors.slice(0, 3);
  res.fallbackRequests = res.requested.filter((f) => ["params.json", "calendar_raw.parquet", "calendar_harmonized.parquet"].includes(f));
  if (re && res.retryButtons > 0) {
    blocked = false;
    try {
      await retry.first().click({ timeout: 3000 });
      await page.waitForTimeout(6000);
      const t2 = await page.evaluate(() => document.body.innerText);
      res.afterRetryErrorLines = [...new Set(t2.split("\n").map((s) => s.trim()).filter((l) => ERR_RE.test(l) && l.length < 240))].slice(0, 4);
      res.afterRetryNumbers = (t2.match(/\b\d{1,3}(,\d{3})+\b|\b\d+\.\d+\b/g) || []).length;
    } catch (e) {
      res.retryClickError = String(e.message).slice(0, 120);
    }
  }
  await ctx.close();
  return res;
}

(async () => {
  const browser = await chromium.launch();
  const out = [];
  for (const path of PAGES) {
    for (const [name, re] of Object.entries(BLOCKS)) {
      const r = await visit(browser, path, name, re);
      process.stderr.write(`${path} [${name}] hits=${r.blockedHits.length} err=${r.errorLines.length} retry=${r.retryButtons} nums=${r.numbersShown} fb=${r.fallbackRequests.join("|")}\n`);
      out.push(r);
    }
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
})();
