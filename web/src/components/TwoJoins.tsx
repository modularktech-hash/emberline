"use client";

/**
 * "Two joins, both fixed": the 2012 MODIS → Suomi-NPP join (proof.json, held-out 2019–2021) and the
 * Suomi-NPP → NOAA-20 join that reaches today (bridge.json, held-out 2022–2023). Every number is read
 * from those files; the block renders nothing unless the bridge passed for most countries tried.
 */
import Link from "next/link";
import { InfoDot, Tile } from "@/components/ui";
import { getProof } from "@/lib/data";
import { fmtNum } from "@/lib/format";
import { loadJson } from "@/lib/queries";
import { useParquet } from "@/lib/useParquet";

interface BridgeHead {
  n_countries: number; n_pass: number; train_years: [number, number]; test_years: [number, number];
  summary: Record<"bridged" | "unbridged", { median_of_country_median_ape_pct: number | null }>;
}

const pct = (v: number | null | undefined) => (v == null ? "not recorded" : `${fmtNum(v, v >= 100 ? 0 : 1)}%`);

export function TwoJoins() {
  const { data: pf } = useParquet(() => getProof(), "proof");
  const { data: b } = useParquet(() => loadJson<BridgeHead>("bridge.json").catch(() => null), "bridge");
  if (!b || !pf || b.n_pass * 2 <= b.n_countries) return null;
  const h = pf.headline;
  const joins = [
    { k: "Join 1 · 2012", title: "MODIS → VIIRS (Suomi-NPP)", href: "/method#bridge",
      text: <>Median monthly miss per country, held out {h.test_years[0]}–{h.test_years[1]}: <span className="tabular text-[var(--text-primary)]">{pct(h.methods.model.median_country_month_ape_pct)}</span> harmonized, against <span className="tabular">{pct(h.methods.raw_viirs.median_country_month_ape_pct)}</span> for raw VIIRS ({h.n_countries} countries).</> },
    { k: "Join 2 · today", title: "Suomi-NPP → NOAA-20", href: "/method#bridge",
      text: <>Bridge fitted on {b.train_years[0]}–{b.train_years[1]}, held out {b.test_years[0]}–{b.test_years[1]}: median monthly miss <span className="tabular text-[var(--text-primary)]">{pct(b.summary.bridged.median_of_country_median_ape_pct)}</span> bridged, <span className="tabular">{pct(b.summary.unbridged.median_of_country_median_ape_pct)}</span> without the bridge; <span className="tabular text-[var(--text-primary)]">{b.n_pass} of {b.n_countries}</span> countries pass.</> },
  ];
  return (
    <section className="window mx-auto mt-6 max-w-5xl p-6 sm:p-8" data-testid="two-joins">
      <h2 className="display flex items-center gap-2.5 t-d3">Two joins, both fixed <InfoDot k="bridge" align="start" /></h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">The record changes satellite twice. Each join is corrected, then scored on years the correction never saw.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {joins.map((j) => (
          <Tile key={j.k} className="min-w-0 p-5">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{j.k}</p>
            <p className="display mt-1 text-xl text-[var(--text-primary)]">{j.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{j.text}</p>
            <Link className="link-ul mt-2 inline-block text-sm text-[var(--text-primary)]" href={j.href}>How it was tested →</Link>
          </Tile>
        ))}
      </div>
    </section>
  );
}
