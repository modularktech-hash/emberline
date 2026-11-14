import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import {
  NOT_COMPUTED,
  extent,
  fmtCi,
  fmtCount,
  fmtDecimal,
  fmtFractionPct,
  fmtHours,
  fmtMw,
  fmtR2,
  fmtRatio,
  fmtSignedPct,
  fmtYear,
  fmtYearSpan,
} from "@/lib/format";
import {
  listFigures,
  loadPublishedFit,
  type Figure,
  type LooseCountryFit,
  type LooseParams,
} from "@/lib/publishedFit.server";

/*
 * Every number on this page is read from web/public/data/params.json (the
 * published fit) at build time. Nothing numeric is typed here except the
 * literature sanity range and citation years, and structural facts such as the
 * 2012 sensor boundary.
 */

export const metadata: Metadata = {
  title: "Method — Burning Activity Calendar",
  description:
    "How the MODIS and VIIRS active-fire records are harmonized, and how well the fit does on years it never saw.",
};

const REPO_URL = "https://github.com/modularktech-hash/emberline";

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="space-y-3">
      <h2 id={`${id}-h`} className="text-lg font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-[var(--text-secondary)]">
      {children}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">{children}</p>;
}

interface Column {
  key: string;
  label: ReactNode;
}

/** A table that scrolls inside its own box on narrow screens. */
function DataTable({
  id,
  caption,
  columns,
  rows,
  narrow = false,
}: {
  narrow?: boolean;
  id: string;
  caption: string;
  columns: Column[];
  rows: { key: string; head: ReactNode; cells: Record<string, string> }[];
}) {
  return (
    <div className={`${narrow ? "max-w-3xl" : "max-w-full"} overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)]`}>
      <table data-table={id} className="tabular w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--hairline)] text-xs text-[var(--text-secondary)]">
            <th scope="col" className="px-3 py-2 text-left font-medium whitespace-nowrap">
              {columns[0].label}
            </th>
            {columns.slice(1).map((c) => (
              <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-row={r.key} className="border-t border-[var(--hairline)] first:border-t-0">
              <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap text-[var(--text-primary)]">
                {r.head}
              </th>
              {columns.slice(1).map((c) => {
                const v = r.cells[c.key] ?? NOT_COMPUTED;
                return (
                  <td
                    key={c.key}
                    data-key={c.key}
                    className={`px-3 py-2 text-right whitespace-nowrap ${
                      v === NOT_COMPUTED ? "text-[var(--text-muted)] italic" : "text-[var(--text-primary)]"
                    }`}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CountryHead({ name, fit }: { name: string; fit: LooseCountryFit }) {
  return (
    <>
      {name}
      {fit.fit_source ? (
        <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
          ({fit.fit_source} fit)
        </span>
      ) : null}
    </>
  );
}

function FigureBlock({ figure, alt, caption }: { figure: Figure; alt: string; caption: ReactNode }) {
  return (
    <figure className="space-y-2 rounded-xl border border-[var(--hairline)] bg-white p-2 sm:p-3">
      <Image
        src={figure.src}
        alt={alt}
        width={figure.width}
        height={figure.height}
        sizes="(min-width: 1152px) 560px, (min-width: 768px) 50vw, 100vw"
        className="h-auto w-full"
      />
      <figcaption className="px-1 text-xs leading-relaxed text-[#52514e]">{caption}</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function MethodPage() {
  const [loaded, figures] = await Promise.all([loadPublishedFit(), listFigures()]);

  if (!loaded.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
          How the record is harmonized
        </h1>
        <EmptyState title="The published fit could not be read" tone="error">
          <p>
            No figures are shown, because every number on this page comes from the published
            fit file. Error: <span className="tabular">{loaded.error}</span>
          </p>
        </EmptyState>
      </div>
    );
  }

  return <MethodContent params={loaded.params} figures={figures} />;
}

function MethodContent({ params, figures }: { params: LooseParams; figures: Map<string, Figure> }) {
  const countries = Object.entries(params.countries ?? {});
  const train = fmtYearSpan(params.train_years);
  const test = fmtYearSpan(params.test_years);
  const drift = fmtYearSpan(params.drift_years);
  const unit = params.unit ?? NOT_COMPUTED;
  const fitVersion = params.fit_version ?? NOT_COMPUTED;
  const matchRule = params.match_rule ?? NOT_COMPUTED;

  const noCountries = countries.length === 0 ? (
    <EmptyState title="No countries in the published fit">
      <p>Nothing has been fitted yet, so this table is empty.</p>
    </EmptyState>
  ) : null;

  const definitions = Array.from(
    new Set(countries.map(([, c]) => c.null_control?.definition).filter((d): d is string => !!d)),
  );

  const annualFigures = countries
    .map(([name]) => ({ name, figure: figures.get(`fit_annual_${name}.png`) }))
    .filter((f): f is { name: string; figure: Figure } => !!f.figure);
  const probabilityFigure = figures.get("fit_detection_probability.png");

  return (
    <article className="space-y-10 pb-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
          How the record is harmonized
        </h1>
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]">
          The idea in plain language first, then how well it works on years the fit never saw.
          Every number below is read from the published fit (version{" "}
          <code className="font-mono text-xs">{fitVersion}</code>).
        </p>
      </header>

      {/* 1 ------------------------------------------------------------ */}
      <Section id="problem" title="The problem, and what we do about it">
        <Prose>
          <p>
            NASA&apos;s satellite fire record comes from two generations of instruments. MODIS,
            on the Terra and Aqua satellites, sees the ground in pixels about 1 km across. VIIRS,
            on Suomi-NPP, sees it in 375 m pixels. The finer instrument picks up many small fires
            that MODIS never registers, so the two do not count the same fires.
          </p>
          <p>
            If you join the records at 2012, where VIIRS begins, the fire count jumps. That jump
            is the instrument, not the fire: the landscape did not start burning more because a
            better camera went up.
          </p>
          <p>
            So for every VIIRS detection we estimate the probability that Aqua MODIS would also
            have detected that fire, using a logistic curve in the logarithm of the fire&apos;s
            radiative power (FRP). We sum those probabilities and apply one scale factor (κ) per
            fit, which gives a count in a single unit: <strong className="font-medium text-[var(--text-primary)]">{unit}</strong>.
            Before 2012 the harmonized record is simply the observed Aqua MODIS count.
          </p>
          <p>
            The curve is fitted on {train} and tested on {test}, years it never saw. The years{" "}
            {drift} are never fitted at all. That is deliberate: Terra and Aqua left their frozen
            orbits in 2022, so Aqua&apos;s overpass time has been drifting later in the day. Fires
            follow a daily cycle, so a fit from the frozen-orbit years carried into the drift
            years would mistake an orbital artifact for a change in fire.
          </p>
          <p>
            The fit is made per country, and the claims are regional. We do not claim a global
            correction: at global scale the sensor break may not be detectable above natural
            year-to-year variation.
          </p>
        </Prose>
      </Section>

      {/* 2 ------------------------------------------------------------ */}
      <Section id="validation" title="Does it work on years it never saw?">
        <Prose>
          <p>
            For the held-out years ({test}) we compare three predictions of the observed Aqua
            MODIS count, per H3 resolution-5 cell and month: our model, the raw VIIRS count, and a
            single FRP cut-off (count VIIRS detections above a fixed MW value). R² measures how much
            of the cell-to-cell, month-to-month variation each one explains.
          </p>
          <p>
            A negative R² means the prediction is worse than simply predicting the average
            everywhere.
          </p>
        </Prose>
        {noCountries ?? (
          <DataTable
            id="validation"
            caption={`Held-out validation, ${test}, against observed Aqua MODIS`}
            columns={[
              { key: "country", label: "Country" },
              { key: "model_r2", label: "Model R²" },
              { key: "model_r2_ci", label: "R² 95% CI" },
              { key: "model_bias", label: "Model bias" },
              { key: "model_bias_ci", label: "Bias 95% CI" },
              { key: "model_rmse", label: "Model RMSE" },
              { key: "raw_r2", label: "Raw VIIRS R²" },
              { key: "thr_r2", label: "Single-threshold R²" },
              { key: "thr_mw", label: "Threshold" },
              { key: "n", label: "Cell-months" },
            ]}
            rows={countries.map(([name, c]) => ({
              key: name,
              head: <CountryHead name={name} fit={c} />,
              cells: {
                model_r2: fmtR2(c.validation_test?.model?.r2),
                model_r2_ci: fmtCi(c.validation_test_ci95?.r2, fmtR2),
                model_bias: fmtSignedPct(c.validation_test?.model?.bias_pct),
                model_bias_ci: fmtCi(c.validation_test_ci95?.bias_pct, fmtSignedPct),
                model_rmse: fmtDecimal(c.validation_test?.model?.rmse, 2),
                raw_r2: fmtR2(c.validation_test?.raw_viirs?.r2),
                thr_r2: fmtR2(c.validation_test?.threshold?.r2),
                thr_mw: fmtMw(c.threshold_baseline_mw),
                n: fmtCount(c.validation_test?.model?.n_cell_months),
              },
            }))}
          />
        )}
        <Note>
          Bias is the model&apos;s total minus the observed total, as a percentage of the observed
          total. RMSE is in detections per cell-month. Confidence intervals are 95%.
        </Note>
      </Section>

      {/* 3 ------------------------------------------------------------ */}
      <Section id="step" title="The 2012 step">
        <Prose>
          <p>
            Aqua MODIS flew straight through 2012 without changing, so its own before-and-after
            ratio shows how much fire activity really changed. The spliced raw record switches
            sensor at that point. A harmonized ratio near the Aqua-only ratio means no artificial
            step; where it differs, that difference is left in by our method, and it is shown
            here as computed.
          </p>
        </Prose>
        {noCountries ?? (
          <DataTable
            id="step"
            narrow
            caption="Ratio of mean annual count after the 2012 boundary to before it"
            columns={[
              { key: "country", label: "Country" },
              { key: "raw", label: "Raw spliced (MODIS→VIIRS)" },
              { key: "aqua", label: "Aqua only (unchanged sensor)" },
              { key: "harm", label: "Harmonized" },
            ]}
            rows={countries.map(([name, c]) => ({
              key: name,
              head: <CountryHead name={name} fit={c} />,
              cells: {
                raw: fmtRatio(c.null_control?.spliced_raw_step_ratio_2012),
                aqua: fmtRatio(c.null_control?.aqua_only_step_ratio_2012),
                harm: fmtRatio(c.null_control?.harmonized_step_ratio_2012),
              },
            }))}
          />
        )}
        <Note>
          Ratio definition:{" "}
          {definitions.length > 0 ? definitions.join("; ") : NOT_COMPUTED}.
        </Note>
      </Section>

      {/* 4 ------------------------------------------------------------ */}
      <Section id="probability" title="How likely is Aqua to see the same fire?">
        <Prose>
          <p>
            The fitted curve gives, for a VIIRS detection of a given FRP, the probability that Aqua
            MODIS also detects that fire on the same day nearby. The table gives the FRP at which
            that probability is one half, the scale factor κ, the share of training VIIRS
            detections that Aqua matched, and how many detections the fit used ({train}).
          </p>
        </Prose>
        {noCountries ?? (
          <DataTable
            id="probability"
            caption={`Fitted detection probability, ${train}`}
            columns={[
              { key: "country", label: "Country" },
              { key: "p50", label: "FRP at P=0.5" },
              { key: "p50_ci", label: "95% CI" },
              { key: "kappa", label: "κ (Aqua detections per Σp)" },
              { key: "match", label: "Training match rate" },
              { key: "n", label: "Training detections" },
            ]}
            rows={countries.map(([name, c]) => ({
              key: name,
              head: <CountryHead name={name} fit={c} />,
              cells: {
                p50: fmtMw(c.frp_at_p50_mw),
                p50_ci: fmtCi(c.frp_at_p50_ci95_mw, fmtMw),
                kappa:
                  fmtDecimal(c.kappa, 3) +
                  (c.kappa_source === "pooled" && c.kappa != null ? " (pooled)" : ""),
                match: fmtFractionPct(c.train_match_rate),
                n: fmtCount(c.n_train_viirs_detections),
              },
            }))}
          />
        )}
        <div className="max-w-3xl rounded-xl border border-dashed border-[var(--baseline)] bg-[var(--surface-1)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          <p>
            <span className="font-medium text-[var(--text-primary)]">Sanity check from the literature.</span>{" "}
            MODIS &ldquo;thresholds of FRP detection&rdquo; are reported at 9–11 MW (Laurent et
            al. 2019, citing Roberts &amp; Wooster 2008 and Schroeder et al. 2010). This is not the
            same quantity as ours: ours is the FRP of a VIIRS detection at
            which Aqua also detects that fire. Our fitted P&nbsp;=&nbsp;0.5 points sit in
            the same order of magnitude; close agreement is a sanity check, not a target.
          </p>
        </div>
        <Note>Match rule used in training: {matchRule}.</Note>
      </Section>

      {/* 5 ------------------------------------------------------------ */}
      <Section id="drift" title={`The drift era (${drift}): never fitted`}>
        <Prose>
          <p>
            For each drift year we compare observed Aqua MODIS with what the fit predicts from
            Suomi-NPP VIIRS, alongside Aqua&apos;s mean local solar overpass time (computed per
            detection as UTC plus longitude/15). The frozen-orbit years give the normal
            year-to-year scatter of observed ÷ predicted; read each drift year against that range
            and against how far the overpass time has moved.
          </p>
          <p>
            The harmonized record from 2012 on is built from Suomi-NPP, which did not drift, so it
            is not exposed to Aqua&apos;s orbital drift. This table is the evidence for keeping
            these years out of the fit.
          </p>
        </Prose>
        {countries.length === 0
          ? noCountries
          : countries.map(([name, c]) => {
              const frozen = c.frozen_era_obs_over_pred ?? [];
              const years = extent(frozen.map((f) => f?.year));
              const ratio = extent(frozen.map((f) => f?.obs_over_pred));
              const lst = extent(frozen.map((f) => f?.aqua_lst));
              const drifts = c.drift_era ?? [];
              return (
                <div key={name} className="space-y-2" data-drift={name}>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    <CountryHead name={name} fit={c} />
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]" data-frozen={name}>
                    Frozen era{" "}
                    <span className="tabular">{years ? fmtYearSpan(years) : NOT_COMPUTED}</span>:
                    obs/pred{" "}
                    <span className="tabular" data-key="frozen_ratio">
                      {ratio ? `${fmtDecimal(ratio[0], 2)}–${fmtDecimal(ratio[1], 2)}` : NOT_COMPUTED}
                    </span>
                    , Aqua local solar time{" "}
                    <span className="tabular" data-key="frozen_lst">
                      {lst ? `${fmtDecimal(lst[0], 2)}–${fmtHours(lst[1])}` : NOT_COMPUTED}
                    </span>
                  </p>
                  {drifts.length === 0 ? (
                    <p className="text-xs italic text-[var(--text-muted)]">Drift era: {NOT_COMPUTED}</p>
                  ) : (
                    <DataTable
                      id={`drift-${name}`}
                      narrow
                      caption={`${name}: drift-era observed Aqua against prediction`}
                      columns={[
                        { key: "year", label: "Year" },
                        { key: "aqua", label: "Observed Aqua" },
                        { key: "pred", label: "Predicted" },
                        { key: "ratio", label: "Obs/pred" },
                        { key: "lst", label: "Aqua local solar time" },
                      ]}
                      rows={drifts.map((d, i) => ({
                        key: d?.year != null ? String(d.year) : `row-${i}`,
                        head: fmtYear(d?.year),
                        cells: {
                          aqua: fmtCount(d?.aqua),
                          pred: fmtCount(d?.aqua_eq),
                          ratio: fmtDecimal(d?.obs_over_pred, 2),
                          lst: fmtHours(d?.aqua_lst),
                        },
                      }))}
                    />
                  )}
                </div>
              );
            })}
      </Section>

      {/* 6 ------------------------------------------------------------ */}
      <Section id="figures" title="Figures">
        {annualFigures.length === 0 && !probabilityFigure ? (
          <EmptyState title="No figures published yet" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {annualFigures.map(({ name, figure }) => (
              <FigureBlock
                key={name}
                figure={figure}
                alt={`Line chart of ${name}'s daytime vegetation-fire detections per year, comparing the raw spliced record (MODIS, then VIIRS from 2012) with the harmonized Aqua-equivalent series and observed Aqua MODIS. The drift era is shaded.`}
                caption={
                  <>
                    <span className="font-medium">{name}.</span> Detections per year: raw spliced
                    record, harmonized ({unit}), and observed Aqua MODIS for validation. Shaded:
                    drift era ({drift}), never fitted.
                  </>
                }
              />
            ))}
            {probabilityFigure ? (
              <FigureBlock
                figure={probabilityFigure}
                alt="Fitted curves, one per country, of the probability that Aqua MODIS also detects a fire, rising with the VIIRS fire radiative power on a logarithmic axis. A shaded band marks the literature detection-threshold range."
                caption={
                  <>
                    Fitted probability that Aqua MODIS also detects a VIIRS-detected fire, by VIIRS
                    FRP ({train}). The shaded band is the literature range, shown as a sanity
                    check only.
                  </>
                }
              />
            ) : null}
          </div>
        )}
      </Section>

      {/* 7 ------------------------------------------------------------ */}
      <Section id="limits" title="Limits">
        <ul className="max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
          <li>
            The fit is made per country, which stands in for region; there is no land-cover
            stratification yet.
          </li>
          <li>
            Matching is by proximity in space and time ({matchRule}), not by overlap of pixel
            footprints.
          </li>
          <li>
            Cell-month scores are noisy at H3 resolution-5 (cells of roughly 250 km²); countries
            with small fires (Portugal) score lowest.
          </li>
          <li>
            The harmonized record from 2012 is derived from Suomi-NPP, which did not drift, so it
            is not exposed to Aqua&apos;s orbital drift. The drift-era table shows what a naive
            Aqua-based record would get wrong.
          </li>
          <li>Claims are regional; no global step correction is claimed.</li>
          <li>
            Raw mode on the calendar is uncorrected: it shows MODIS and VIIRS counts as recorded.
          </li>
          <li>
            A box drawn on the map resolves to whole H3 resolution-2 cells, so the area counted is
            not exactly the box you drew.
          </li>
        </ul>
      </Section>

      {/* 8 ------------------------------------------------------------ */}
      <Section id="data" title="Data and reproducibility">
        <Prose>
          <p>
            Source: NASA FIRMS (Fire Information for Resource Management System) active-fire
            archive: MODIS on Terra and Aqua, and VIIRS 375 m on Suomi-NPP.
          </p>
        </Prose>
        <dl className="grid max-w-3xl grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-[var(--text-muted)]">Fit version</dt>
          <dd className="font-mono text-xs text-[var(--text-primary)] break-all">{fitVersion}</dd>
          <dt className="text-[var(--text-muted)]">Match rule</dt>
          <dd className="text-[var(--text-primary)]">{matchRule}</dd>
          <dt className="text-[var(--text-muted)]">Unit</dt>
          <dd className="text-[var(--text-primary)]">{unit}</dd>
          <dt className="text-[var(--text-muted)]">Years</dt>
          <dd className="text-[var(--text-primary)]">
            train {train}, held-out test {test}, drift era {drift} (never fitted)
          </dd>
        </dl>
        <Prose>
          <p>
            The fit and every number on this page are produced by{" "}
            <a
              className="font-mono text-xs text-[var(--text-primary)] underline underline-offset-2"
              href={`${REPO_URL}/blob/main/scripts/fit_harmonization.py`}
            >
              scripts/fit_harmonization.py
            </a>{" "}
            from tables built by{" "}
            <a
              className="font-mono text-xs text-[var(--text-primary)] underline underline-offset-2"
              href={`${REPO_URL}/blob/main/scripts/build_tables.py`}
            >
              scripts/build_tables.py
            </a>
            , and published to <code className="font-mono text-xs">web/public/data/params.json</code>.
            Re-run the scripts to reproduce them.
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Not affiliated with or endorsed by NASA.
          </p>
        </Prose>
      </Section>
    </article>
  );
}
