"use client";
/** "Does it find the fires everyone remembers?": rank of documented extreme fire seasons, read from events.json (scripts/build_events.py). */
import { Eyebrow } from "@/components/Figure";
import { Reveal } from "@/components/ui";
import { ScrollBox } from "@/components/TableTools";
import { fmtNum } from "@/lib/format";
import { loadJson } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";

interface EventRank { rank: number; total: number; years_above: number[]; recent_years_above: number[] }
interface EventRow {
  group: "recent" | "early"; event: string; country: string; window: string; year: number;
  pool_years: [number, number]; pool_size: number; harmonized: EventRank | null; raw_splice: EventRank | null;
}
interface GroupSummary { n: number; median_rank_harmonized: number | null; median_rank_raw_splice: number | null; top3_harmonized: number; top3_raw_splice: number }
export interface EventsFile { fit_version: string; definition: string; events: EventRow[]; summary: { recent: GroupSummary; early: GroupSummary } }

export const getEvents = () => loadJson<EventsFile>("events.json");

const rk = (r: EventRank | null, n: number) => (r ? <>{r.rank}<span className="text-xs text-[var(--text-muted)]"> of {n}</span></> : "—");
const med = (v: number | null) => (v == null ? "—" : fmtNum(v, v % 1 ? 1 : 0));

/** One-line summary for the home page; null until events.json has loaded. */
export function EventsLine({ e }: { e: EventsFile }) {
  const s = e.summary, n = e.events[0]?.pool_size;
  return (
    <>Fire disasters before 2012 ({s.early.n} documented seasons): median rank <span className="dot-num">{med(s.early.median_rank_harmonized)}</span> of {n} in
      the harmonized record, <span className="dot-num">{med(s.early.median_rank_raw_splice)}</span> in the raw splice, which inflates every year from 2012.</>
  );
}

export function EventsTest() {
  const { data: e, error } = useParquet(() => getEvents(), "events");
  return (
    <Reveal><section id="events" className="card mt-6 min-w-0 scroll-mt-24 p-5 sm:p-6" data-testid="method-events">
      <Eyebrow>Proof · known fire disasters</Eyebrow>
      <h2 className="display mt-2 text-2xl">Does it find the fires everyone remembers?</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
        Widely documented extreme fire seasons, listed before any result was computed. Each season&apos;s total is ranked against the same months in every
        other year; rank 1 is the largest. The raw splice is MODIS (Terra and Aqua) to 2011, then Suomi-NPP VIIRS from 2012.
      </p>
      {error && <p className="mt-4 text-sm text-[var(--text-secondary)]">Could not load events.json: {error.message}</p>}
      {!e ? (!error && <div className="mt-4 h-64 dot-skel" />) : (
        <>
          <dl className="tabular mt-4 grid gap-3 sm:grid-cols-2">
            {(["early", "recent"] as const).map((g) => { const s = e.summary[g]; return (
              <div key={g} className="rounded-2xl border border-[var(--hairline)] p-3">
                <dt className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{g === "early" ? "Before 2012" : "2012 onward"} · {s.n} seasons · median rank</dt>
                <dd className="mt-1 text-lg font-medium text-[var(--text-primary)]">
                  <span className="text-[var(--ember)]">{med(s.median_rank_harmonized)}</span> harmonized · <span className="text-[var(--c-raw)]">{med(s.median_rank_raw_splice)}</span> raw splice
                </dd>
                <dd className="mt-0.5 text-xs text-[var(--text-secondary)]">in the top 3: {s.top3_harmonized} harmonized, {s.top3_raw_splice} raw splice</dd>
              </div>); })}
          </dl>
          <ScrollBox label="Known fire disasters table">
            <table className="tabular mt-4 w-full min-w-[680px] text-sm">
              <thead><tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 pr-3 font-normal">Season</th><th className="px-3 font-normal">Months</th>
                <th className="px-3 font-normal">Rank, harmonized</th><th className="px-3 font-normal">Rank, raw splice</th>
                <th className="px-3 font-normal">2012+ years above it in the raw splice</th>
              </tr></thead>
              <tbody>
                {(["early", "recent"] as const).flatMap((g) => e.events.filter((r) => r.group === g)).map((r) => (
                  <tr key={r.event} className="border-t border-[var(--hairline)]">
                    <td className="py-2 pr-3">{r.event}</td>
                    <td className="px-3 text-[var(--text-secondary)]">{r.window}</td>
                    <td className="px-3 text-[var(--ember)]">{rk(r.harmonized, r.pool_size)}</td>
                    <td className="px-3 text-[var(--c-raw)]">{rk(r.raw_splice, r.pool_size)}</td>
                    <td className="px-3 text-[var(--text-muted)]">{r.raw_splice ? r.raw_splice.recent_years_above.length : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollBox>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
            Pool: the same months in each year 2003–2025, {e.events[0].pool_size} seasons per event (for seasons that cross New Year, those starting 2002–2024, since
            the harmonized record begins July 2002 and the data end in December 2025). Unit: daytime vegetation-fire detections; harmonized counts are Aqua-MODIS-equivalent.
            Recent seasons rank high in both records because the raw splice inflates every year from 2012; the test is whether older disasters keep their place.
            Countries are national totals, so a regional disaster competes with the whole country. Fit {e.fit_version} · scripts/build_events.py.
          </p>
        </>
      )}
    </section></Reveal>
  );
}
