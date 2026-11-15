#!/usr/bin/env node
/**
 * Smoke tests against a running site (local `npm start` or production).
 *
 *   NODE_PATH=$(npm root -g) node scripts/smoke_live.cjs [base-url] [--chromium /path/to/chrome]
 *
 * Covers home, /method, the Explorer with a country, the New South Wales box,
 * a polygon (?poly=), the calendar CSV export, the report and its HTML export,
 * an antimeridian-crossing box (Fiji) and an empty ocean box. Numbers on the
 * report and in the CSV must equal proof.json worked_example (computed by
 * scripts/build_proof.py from the published area cells). Exit code 0 = pass.
 */
const fs = require("fs");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || "http://localhost:3000").replace(/\/$/, "");
const ci = args.indexOf("--chromium");
const executablePath = ci >= 0 ? args[ci + 1] : fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const NSW = "141,-37.5,153.7,-28.2";
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) fails.push(msg); };
const fmt = (v) => Math.round(v).toLocaleString("en-US");

(async () => {
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const proof = await (await fetch(`${base}/data/proof.json`)).json();
  const we = proof.worked_example, u = we.unusual;

  async function visit(path, check, width = 1440) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message.slice(0, 160)}`));
    try {
      const res = await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
      ok(res && res.ok(), `${path} responds ${res && res.status()}`);
      await page.waitForTimeout(1500);
      if (check) await check(page);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(sw <= 1, `${path} @${width}: no sideways scroll (${sw}px)`);
    } catch (e) {
      ok(false, `${path}: ${e.message.split("\n")[0]}`);
    }
    ok(errors.length === 0, `${path} @${width}: no console errors${errors.length ? ` (${errors.slice(0, 2).join(" | ")})` : ""}`);
    await ctx.close();
  }
  const text = async (page, sel, timeout = 30000) => { await page.waitForSelector(sel, { timeout }); return (await page.locator(sel).first().innerText()).replace(/\s+/g, " "); };

  await visit("/", async (p) => {
    ok((await p.locator("[data-testid=hero-evidence] a").count()) === 3, "home: before/after, method and validation links under the hero");
    ok((await p.locator(`a[href^="/report?box=${NSW}"]`).count()) >= 1, "home: Get a report links to the NSW report");
  });
  await visit("/", null, 390);
  await visit("/method", async (p) => {
    const t = await text(p, "[data-testid=headline-table] table");
    ok(t.includes("Emberline") && t.includes("Single ratio"), "method: headline comparison table");
    ok((await text(p, "[data-testid=calibration]")).includes("2021"), "method: calibration line");
  });
  await visit("/explorer?country=Canada&mode=harmonized", async (p) => {
    ok((await text(p, "[data-testid=typical-error]")).includes("not a confidence interval"), "explorer country: typical held-out error shown");
  });
  await visit(`/explorer?box=${NSW}&mode=harmonized`, async (p) => {
    const t = await text(p, "[data-testid=unusual-month]");
    ok(t.includes(`${fmt(u.value)} harmonized`) && t.includes(`median ${fmt(u.median)}`), `explorer NSW: Dec 2019 ${fmt(u.value)}, median ${fmt(u.median)}`);
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click('button:has-text("Calendar CSV")')]);
    const csv = fs.readFileSync(await dl.path(), "utf8");
    const row = csv.split("\n").find((l) => l.startsWith(`${u.year},${u.month},`));
    ok(row && Math.abs(Number(row.split(",")[2]) - u.value) < 0.1, `CSV row ${row} equals proof.json ${u.value}`);
  });
  await visit(`/explorer?poly=${encodeURIComponent("-9.5 37,-6.2 37,-6.2 42,-9.5 42")}&mode=harmonized`, async (p) => {
    ok((await p.locator("[data-testid=unusual-month]").count()) === 1, "explorer polygon (?poly=): harmonized calendar shown");
  });
  await visit("/explorer?box=177,-20,-178,-15", async (p) => {
    await p.waitForSelector("text=Busiest month", { timeout: 30000 });
    ok(true, "explorer antimeridian box (Fiji): calendar shown");
  });
  await visit("/explorer?box=-40,-40,-35,-35", async (p) => {
    ok((await text(p, "text=No processed data in this area")).length > 0, "explorer empty ocean box: clear empty state");
  });
  await visit(`/report?box=${NSW}&y=2019&m=12&mode=harmonized`, async (p) => {
    const facts = await text(p, "[data-testid=report-facts]");
    for (const [k, v] of [["value", u.value], ["median", u.median], ["min", u.min], ["max", u.max], ["next", u.next_highest]]) ok(facts.includes(fmt(v)), `report ${k} ${fmt(v)} equals proof.json`);
    ok(facts.includes(`${u.rank} / ${u.n_years}`), `report rank ${u.rank} / ${u.n_years}`);
    const s = await text(p, "[data-testid=report-sentence]");
    ok(s.includes("December 2019") && s.includes("highest"), `report sentence: ${s.slice(0, 120)}`);
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("[data-testid=report-export]")]);
    const html = fs.readFileSync(await dl.path(), "utf8");
    ok(html.includes(proof.fit_version) && html.includes("December 2019") && html.includes("<svg") && html.includes("NASA FIRMS"), "report export: self-contained HTML with fit version, charts and sources");
  });
  await visit(`/report?box=${NSW}&y=2019&m=12&mode=harmonized`, null, 390);
  await visit("/report?box=-40,-40,-35,-35", async (p) => {
    ok((await p.locator("[data-testid=report-empty]").count()) === 1, "report empty ocean box: clear empty state");
  });
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nall smoke tests passed");
  process.exit(fails.length ? 1 : 0);
})();
