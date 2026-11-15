"use client";

/**
 * Fire intelligence report: one area and one month, read against the same
 * calendar month in every other year of the harmonized record. Every number
 * comes from the published calendars (lib/useArea), proof.json (held-out error)
 * and params_global.json; the sentence is a template filled with them.
 */
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { CountryPicker } from "@/components/CountryPicker";
import { CopyLink } from "@/components/CopyLink";
import { Eyebrow } from "@/components/Figure";
import { Failed, InfoDot, PageHead, Tile } from "@/components/ui";
import { validateBoxInput } from "@/lib/aoi";
import { NSW_BOX } from "@/lib/reportLink";
import { buildReport, pairBarsSvg, type BarPoint } from "@/lib/brief";
import { getProof } from "@/lib/data";
import { fmt } from "@/lib/ember";
import { fmtNum, fmtR2 } from "@/lib/format";
import { prettyName } from "@/lib/names";
import { fmtBounds } from "@/lib/scope";
import { monthContext, mostUnusualMonth } from "@/lib/unusual";
import { areaFromQuery, areaToQuery, intParam, reproducingUrl, useUrlState } from "@/lib/urlState";
import { areaKey, makeArea, useAreaData, type Area } from "@/lib/useArea";
import { useParquet } from "@/lib/useParquet";
import { ringToParam } from "@/lib/aoi";

const FIRST = 2003, LAST = 2025;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PAGE_COLORS = { raw: "var(--c-raw)", harm: "var(--c-harm)", text: "var(--text-muted)", grid: "var(--gridline)", mark: "var(--text-primary)", bg: "transparent" };

function geometryText(a: Area): string {
  if (a.kind === "country") return `Country: ${prettyName(a.name)} (every detection assigned to it in the FIRMS country files)`;
  if (a.kind === "box") return `Box W, S, E, N: ${fmtBounds(a.bbox)} · ${a.cells.length} H3 res-4 cells whose centre is inside`;
  return `Polygon (lon lat): ${ringToParam(a.ring)} · ${a.cells.length} H3 res-4 cells whose centre is inside`;
}

export function ReportPage() {
  const [area, setArea] = useState<Area>(() => makeArea({ kind: "box", bbox: NSW_BOX }));
  const [ym, setYm] = useState<{ y: number; m: number } | null>(null);
  const [asked2026, setAsked2026] = useState(false);
  const [linkFit, setLinkFit] = useState<string | null>(null);
  const [boxText, setBoxText] = useState("");
  const [point, setPoint] = useState("");
  const [inputErr, setInputErr] = useState<string | null>(null);

  const { data, error, retry } = useAreaData(area);
  useUrlState((q) => {
    const at = q.get("at");
    const a = areaFromQuery(q);
    if (at) {
      const [lat, lon] = at.split(",").map(Number);
      const c = validateBoxInput([String(lon - 0.5), String(lat - 0.5), String(lon + 0.5), String(lat + 0.5)]);
      if (c.ok) setArea(makeArea({ kind: "box", bbox: c.bbox }));
    } else if (a?.ok) setArea(a.area);
    const y = intParam(q, "y", FIRST, 2026), m = intParam(q, "m", 1, 12);
    setAsked2026(y === 2026);
    setYm(y != null && m != null && y <= LAST ? { y, m } : null);
    setLinkFit(q.get("fit"));
  }, () => ({ ...areaToQuery(area), y: ym?.y, m: ym?.m, mode: "harmonized", fit: data?.params.fit_version }), [areaKey(area), ym?.y, ym?.m, data?.params.fit_version]);

  const proof = useParquet(() => getProof(), "proof");
  const harm = data?.harmonized, raw = data?.raw;
  const hasHarm = !!harm && harm.keys.length > 0;
  const unusual = useMemo(() => (hasHarm ? mostUnusualMonth(harm!.rows, [FIRST, LAST]) : null), [hasHarm, harm]);
  const sel = ym ?? (unusual ? { y: unusual.year, m: unusual.month } : null);
  const ctx = useMemo(() => (hasHarm && sel ? monthContext(harm!.rows, [FIRST, LAST], sel.y, sel.m) : null), [hasHarm, harm, sel?.y, sel?.m]); // eslint-disable-line react-hooks/exhaustive-deps

  // The fit the numbers rest on: the country itself, or the fitted country with most detections in a drawn area.
  const fitCountry = area.kind === "country" ? (data?.params.countries[area.name] ? area.name : null) : data?.cells?.countries.find((c) => c.fitted)?.country ?? null;
  const fit = fitCountry ? data?.params.countries[fitCountry] : undefined;
  const err = fitCountry && proof.data?.fit_version === data?.params.fit_version ? proof.data?.limits.per_country[fitCountry] : undefined;
  const areaCountries = data?.cells?.countries.filter((c) => c.detections > 0) ?? [];
  const place = area.kind === "country" ? prettyName(area.name) : area.kind === "box" ? "the selected box" : "the selected polygon";
  const mo = sel ? MONTH_NAMES[sel.m - 1] : "";

  const valueAt = (rows: Array<{ year: number; month: number; value: number | null }> | undefined, y: number, m: number) => rows?.find((r) => r.year === y && r.month === m)?.value ?? null;
  const monthChart: BarPoint[] = sel ? Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i).map((y) => ({
    label: String(y).slice(2), raw: valueAt(raw?.rows, y, sel.m), harm: valueAt(harm?.rows, y, sel.m), boundaryBefore: y === 2012, selected: y === sel.y,
  })) : [];
  const yearChart: BarPoint[] = sel ? Array.from({ length: 12 }, (_, i) => ({ label: MONTH_NAMES[i].slice(0, 3), raw: valueAt(raw?.rows, sel.y, i + 1), harm: valueAt(harm?.rows, sel.y, i + 1), selected: i + 1 === sel.m })) : [];

  const times = ctx && ctx.median > 0 ? ctx.value / ctx.median : null;
  const sentence = ctx && sel ? (
    `${mo} ${sel.y} had ${ctx.rank === 1 ? "the highest" : `the ${ordinal(ctx.rank)}-highest`} harmonized detection count of ${ctx.nYears} ${mo}s (${FIRST}–${LAST}) in ${place}`
    + (times == null ? ", where the usual " + mo + " has no detections." : times >= 1.05 ? `, about ${fmtNum(times, times >= 10 ? 0 : 1)}× the usual ${mo} (median of the other ${ctx.nRef}).` : times <= 0.95 ? `, about ${fmtNum(times * 100, 0)}% of the usual ${mo} (median of the other ${ctx.nRef}).` : `, close to the usual ${mo} (median of the other ${ctx.nRef}).`)
  ) : "";

  const caveats: string[] = [];
  if (fit?.fit_source === "pooled") caveats.push(`${prettyName(fitCountry!)} uses the pooled (shared) curve, not its own fit: held-out errors are larger for pooled countries.`);
  if (err && err[2] === 0) caveats.push(`${prettyName(fitCountry!)} is in the third of countries with the fewest fires, where held-out errors are largest.`);
  if (areaCountries.length > 1) caveats.push(`This area crosses ${areaCountries.length} country files (${areaCountries.map((c) => prettyName(c.country)).join(", ")}); each part uses its own country's fit, and the error figures below are for ${fitCountry ? prettyName(fitCountry) : "none"} only.`);
  if (data?.cells && data.cells.uncorrected.detections > 0) caveats.push(`${fmt(data.cells.uncorrected.detections)} raw detections here are in countries without a fit (${data.cells.uncorrected.countries.map(prettyName).join(", ")}) and are left out of the harmonized series.`);
  if (sel && sel.y >= 2022) caveats.push(`${sel.y} is in the orbital-drift era (2022 onward): Aqua's overpass time moved, and the harmonized value extends the 2012–2018 fit outside its frozen-orbit years.`);
  if (sel && sel.y < 2012) caveats.push(`${sel.y} is before VIIRS: the harmonized value is the observed Aqua MODIS count, not an estimate.`);
  if (asked2026) caveats.push("2026 is not in the harmonized record (it ends December 2025). 2026 months exist only as provisional raw counts in the Explorer's “This month so far” card.");
  if (linkFit && data && linkFit !== data.params.fit_version) caveats.push(`This link was made with fit ${linkFit}; the page now shows fit ${data.params.fit_version}, so numbers may differ.`);
  if (!caveats.length) caveats.push("No selection-specific caveat applies beyond the general limits below.");

  const trust: Array<[string, string]> = data ? [
    ["Fit source", fit ? `${prettyName(fitCountry!)}: ${fit.fit_source === "pooled" ? "pooled (shared) curve — less reliable than an own fit" : "own fitted curve"}` : "no fit: raw only, uncorrected"],
    ["Typical held-out error", err?.[0] != null ? `±${fmtNum(err[0], 0)}% (median monthly miss, 2019–2021; not a confidence interval)` : "not recorded"],
    ["Tail", err?.[1] != null ? `1 month in 5 missed by more than ±${fmtNum(err[1], 0)}%` : "not recorded"],
    ["Held-out R²", fit ? `${fmtR2(fit.validation_test.model.r2)} (raw VIIRS ${fmtR2(fit.validation_test.raw_viirs.r2)})` : "not recorded"],
  ] : [];
  const facts: Array<[string, string]> = ctx && sel ? [
    [`Harmonized detections, ${mo} ${sel.y}`, fmt(ctx.value)],
    [`Usual ${mo} (median of the other ${ctx.nRef} years)`, fmt(ctx.median)],
    [`Range of the other ${ctx.nRef} ${mo}s`, `${fmt(ctx.min)}–${fmt(ctx.max)}`],
    ["Rank", `${ctx.rank} of ${ctx.nYears} ${mo}s, ${FIRST}–${LAST}`],
    [ctx.rank === 1 ? "Next highest" : "Highest other year", fmt(ctx.nextHighest)],
    [`Raw detections, ${mo} ${sel.y}`, `${fmt(valueAt(raw?.rows, sel.y, sel.m))} (${sel.y >= 2012 ? "VIIRS, not comparable with MODIS years" : "MODIS Terra + Aqua"})`],
  ] : [];

  const exportReport = () => {
    if (!data || !ctx || !sel) return;
    const html = buildReport({
      place: area.kind === "country" ? prettyName(area.name) : area.kind === "box" ? `Box ${fmtBounds(area.bbox)}` : "Custom polygon",
      geometry: geometryText(area), year: sel.y, month: sel.m, sentence, facts, trust, caveats, monthChart, yearChart,
      params: data.params, url: reproducingUrl({ ...areaToQuery(area), y: sel.y, m: sel.m, mode: "harmonized", fit: data.params.fit_version }), generated: new Date().toISOString(),
    });
    const href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = `emberline_report_${(area.kind === "country" ? area.name : area.kind).replace(/[^a-z0-9]+/gi, "_")}_${sel.y}_${String(sel.m).padStart(2, "0")}.html`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const applyBox = () => {
    const c = validateBoxInput(boxText.split(",").map((s) => s.trim()));
    if (!c.ok) { setInputErr(c.message); return; }
    setInputErr(null); setYm(null); setArea(makeArea({ kind: "box", bbox: c.bbox }));
  };
  const applyPoint = () => {
    const [lat, lon] = point.split(",").map((s) => Number(s.trim()));
    const c = validateBoxInput([String(lon - 0.5), String(lat - 0.5), String(lon + 0.5), String(lat + 0.5)]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !c.ok) { setInputErr("Type a point as latitude, longitude, e.g. -33.9, 151.2"); return; }
    setInputErr(null); setYm(null); setArea(makeArea({ kind: "box", bbox: c.bbox }));
  };

  return (
    <div>
      <PageHead compact eyebrow="Report · one area, one month" info="unusualMonth" title="Was this month" italic="unusual here?"
        lede="Pick an area and a month. The report sets that month against the same calendar month in every other year of the harmonized record, says how far to trust it, and exports as a self-contained file. Observed history, not a forecast." />

      <Tile className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3" role="toolbar" aria-label="Report selection">
          <CountryPicker value={area.kind === "country" ? area.name : ""} display={area.kind !== "country" ? (area.kind === "box" ? `Box ${area.bbox.map((v) => v.toFixed(1)).join(", ")}` : "Custom polygon") : undefined}
            options={data?.countries ?? []} tags={data?.tags} onChange={(c) => { setYm(null); setArea({ kind: "country", name: c }); }} label="Country" />
          <label className="text-xs text-[var(--text-muted)]">Box W, S, E, N
            <input value={boxText} onChange={(e) => setBoxText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyBox(); }} placeholder="141, -37.5, 153.7, -28.2" inputMode="decimal" className="field mt-1 block min-h-[36px] w-56 rounded-xl px-2 text-sm text-[var(--text-primary)]" />
          </label>
          <button type="button" onClick={applyBox} className="glass-thin min-h-[36px] px-3.5 text-sm font-medium">Use box</button>
          <label className="text-xs text-[var(--text-muted)]">Point lat, lon (1° box)
            <input value={point} onChange={(e) => setPoint(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyPoint(); }} placeholder="-33.9, 151.2" inputMode="decimal" className="field mt-1 block min-h-[36px] w-40 rounded-xl px-2 text-sm text-[var(--text-primary)]" />
          </label>
          <button type="button" onClick={applyPoint} className="glass-thin min-h-[36px] px-3.5 text-sm font-medium">Use point</button>
          <Link href={`/explorer?${new URLSearchParams(Object.entries(areaToQuery(area)).filter(([, v]) => v) as Array<[string, string]>).toString()}#area`} className="link-ul self-center text-sm">Draw a polygon in the Explorer →</Link>
        </div>
        {sel && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]" role="group" aria-label="Month">
            <select data-testid="report-month" value={sel.m} onChange={(e) => setYm({ y: sel.y, m: Number(e.target.value) })} className="field min-h-[36px] rounded-xl px-2 text-[var(--text-primary)]">
              {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </select>
            <select data-testid="report-year" value={sel.y} onChange={(e) => setYm({ y: Number(e.target.value), m: sel.m })} className="field min-h-[36px] rounded-xl px-2 text-[var(--text-primary)]">
              {Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i).map((y) => <option key={y}>{y}</option>)}
            </select>
            {unusual && <button type="button" onClick={() => setYm(null)} className="link-ul">Most unusual month ({MONTH_NAMES[unusual.month - 1]} {unusual.year})</button>}
            <span className="ml-auto flex flex-wrap gap-2">
              <CopyLink />
              <button type="button" onClick={exportReport} disabled={!ctx} data-testid="report-export" className="pill-dark min-h-[40px] px-4 text-sm font-medium disabled:opacity-40">Download report (HTML)</button>
            </span>
          </div>
        )}
        {inputErr && <p role="alert" className="mt-2 text-sm text-[var(--ember)]">{inputErr}</p>}
      </Tile>

      {error && <div className="mt-6"><Failed error={error} retry={retry} what="the calendars for this area" /></div>}
      {!data && !error && <div className="mt-6 h-80 dot-skel" />}
      {data && !hasHarm && (
        <div className="mt-6 rounded-2xl border border-[var(--hairline)] p-6 text-sm leading-relaxed text-[var(--text-secondary)]" data-testid="report-empty">
          <p className="text-[var(--text-primary)]">No harmonized record for this area.</p>
          <p className="mt-1">{raw && raw.keys.length ? "It has raw detections only, in countries without a fit, so no corrected comparison can be made." : "None of its grid cells has a detection in the processed FIRMS record. No data is not the same as no fire."} Try a country or another area.</p>
        </div>
      )}

      {data && ctx && sel && (
        <div className="fade-in">
          <Tile tone="ink" className="mt-6 p-6 sm:p-8" data-testid="report-headline">
            <Eyebrow info={false} className="!text-inherit opacity-70">{area.kind === "country" ? prettyName(area.name) : area.kind === "box" ? `Box ${fmtBounds(area.bbox)}` : "Custom polygon"} · {mo} {sel.y}</Eyebrow>
            <p className="display mt-4 text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] leading-[1.1]" data-testid="report-sentence">{sentence}</p>
            <p className="mt-3 text-[13px] opacity-75">Observed historical anomaly, not a forecast or burned-area estimate.</p>
            <dl className="tabular mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="report-facts">
              {[
                ["Harmonized", fmt(ctx.value), `detections, ${mo} ${sel.y}`],
                [`Usual ${mo}`, fmt(ctx.median), `median of the other ${ctx.nRef}; range ${fmt(ctx.min)}–${fmt(ctx.max)}`],
                ["Rank", `${ctx.rank} / ${ctx.nYears}`, `${mo}s, ${FIRST}–${LAST}`],
                [ctx.rank === 1 ? "Next highest" : "Highest other", fmt(ctx.nextHighest), `${mo}, another year`],
              ].map(([k, v, n]) => (
                <div key={k}><dt className="text-[11px] uppercase tracking-wider opacity-70">{k}</dt><dd className="mt-1 text-3xl" data-k={k}>{v}</dd><p className="mt-1 text-xs opacity-70">{n}</p></div>
              ))}
            </dl>
          </Tile>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Tile className="min-w-0 p-5">
              <Eyebrow info={false}>{mo} in every year · raw and harmonized</Eyebrow>
              <div className="mt-3" dangerouslySetInnerHTML={{ __html: pairBarsSvg(monthChart, `${mo} detections per year, raw and harmonized, one scale`, PAGE_COLORS) }} />
              <p className="mt-2 text-xs text-[var(--text-muted)]">Same scale for both series. The raw record jumps at 2012 when MODIS and VIIRS are naively joined; the harmonized one does not carry that step.</p>
            </Tile>
            <Tile className="min-w-0 p-5">
              <Eyebrow info={false}>{sel.y}, month by month · raw and harmonized</Eyebrow>
              <div className="mt-3" dangerouslySetInnerHTML={{ __html: pairBarsSvg(yearChart, `${sel.y} detections per month, raw and harmonized, one scale`, PAGE_COLORS) }} />
              <p className="mt-2 text-xs text-[var(--text-muted)]">{sel.y >= 2012 ? "From 2012 raw is VIIRS; harmonized is its Aqua-MODIS-equivalent estimate." : "Before 2012 raw is MODIS Terra + Aqua; harmonized is observed Aqua alone."}</p>
            </Tile>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Tile className="min-w-0 p-5" data-testid="report-trust">
              <div className="flex items-center gap-2"><Eyebrow info={false}>How far to trust it</Eyebrow><InfoDot k="typicalError" align="start" /></div>
              <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
                {trust.map(([k, v]) => <Fragment key={k}><dt className="text-[var(--text-muted)]">{k}</dt><dd className="tabular text-[var(--text-primary)]">{v}</dd></Fragment>)}
              </dl>
              <p className="mt-3 text-sm"><Link className="link-ul" href="/method#headline">Benchmark against simpler corrections</Link> · <Link className="link-ul" href="/method">The method</Link> · <Link className="link-ul" href="/method#cannot">What it cannot do</Link></p>
            </Tile>
            <Tile className="min-w-0 p-5" data-testid="report-caveats">
              <Eyebrow info={false}>Caveats for this selection</Eyebrow>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">{caveats.map((c) => <li key={c}>{c}</li>)}</ul>
            </Tile>
          </div>
          <p className="mt-4 text-xs text-[var(--text-muted)]">Area: {geometryText(area)}. Fit {data.params.fit_version}. Reference: the same calendar month in the other years {FIRST}–{LAST}, the selected year excluded.</p>
        </div>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
