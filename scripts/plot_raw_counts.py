#!/usr/bin/env python3
"""Plot annual RAW, UNCORRECTED vegetation-fire detection counts, MODIS vs VIIRS.

Reads the country-scope rows of ``data/public/calendar_raw.parquet`` (written by
``scripts/build_tables.py``) and writes ``docs/figures/raw_counts_<Country>.png``.

Nothing here is fitted or corrected. The counts are the firms_ingest
``standard_pipeline`` defaults as applied in build_tables.py: vegetation fires
(source_type 0), confidence nominal or high, daytime only, rows with missing or
zero FRP dropped. Years are UTC calendar years of acq_ts.

Partial years are detected from the per-detection files, not assumed. A
sensor's archive coverage is taken as the earliest and latest acq_ts of that
sensor across every country passed on the command line (so an empty December
in one country is not mistaken for the archive ending). A year is marked
partial when that coverage starts or ends more than ``PARTIAL_GAP_DAYS`` days
inside it. The coverage dates are printed so the call can be checked.

Usage:  .venv/bin/python scripts/plot_raw_counts.py [Country ...]
        (default: Portugal Chile)
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import polars as pl  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "data" / "public"
FIGURES = ROOT / "docs" / "figures"

YEARS = list(range(2001, 2026))
VIIRS_START_YEAR = 2012
PARTIAL_GAP_DAYS = 14  # heuristic: a coverage edge this far inside a year = partial

# Reference categorical palette, slots 1-2 (blue, orange); text stays in ink.
COLOR = {"MODIS": "#2a78d6", "VIIRS": "#eb6834"}
LABEL = {
    "MODIS": "MODIS (Terra + Aqua, 1 km)",
    "VIIRS": "VIIRS (Suomi-NPP, 375 m)",
}
INK, INK_2, MUTED, GRID, SURFACE = "#1f1f1e", "#52514c", "#8a897f", "#e6e5e0", "#fcfcfb"


def coverage(countries: list[str]) -> dict[str, tuple[date, date]]:
    """Earliest and latest acq_ts date per sensor across the given countries."""
    frames = [
        pl.read_parquet(PUBLIC / f"detections_{c}.parquet", columns=["sensor", "acq_ts"])
        for c in countries
    ]
    cov = (
        pl.concat(frames)
        .group_by("sensor")
        .agg(pl.col("acq_ts").min().dt.date().alias("first"), pl.col("acq_ts").max().dt.date().alias("last"))
    )
    return {r["sensor"]: (r["first"], r["last"]) for r in cov.iter_rows(named=True)}


def partial_years(cov: dict[str, tuple[date, date]]) -> dict[str, dict[int, str]]:
    """sensor -> {year: human note} for years the archive only partly covers."""
    out: dict[str, dict[int, str]] = {}
    for sensor, (first, last) in cov.items():
        notes: dict[int, str] = {}
        if (first - date(first.year, 1, 1)).days > PARTIAL_GAP_DAYS:
            notes[first.year] = f"partial year: record starts {first:%d %b %Y}"
        if (date(last.year, 12, 31) - last).days > PARTIAL_GAP_DAYS:
            notes[last.year] = f"partial year: record ends {last:%d %b %Y}"
        out[sensor] = notes
    return out


def annual_counts(country: str) -> pl.DataFrame:
    cal = pl.read_parquet(PUBLIC / "calendar_raw.parquet")
    return (
        cal.filter((pl.col("scope") == "country") & (pl.col("key") == country))
        .group_by("year", "sensor")
        .agg(pl.col("n_detections").sum())
        .pivot(on="sensor", index="year", values="n_detections")
        .sort("year")
    )


def plot(country: str, table: pl.DataFrame, partial: dict[str, dict[int, str]],
         aqua_start: date | None) -> Path:
    fig, ax = plt.subplots(figsize=(11, 6.2), dpi=150)
    fig.patch.set_facecolor(SURFACE)
    ax.set_facecolor(SURFACE)

    years = table["year"].to_list()
    ymax = 0
    for sensor in ("MODIS", "VIIRS"):
        rows = table.filter(pl.col(sensor).is_not_null()).select("year", sensor)
        xs, ys = rows["year"].to_list(), rows[sensor].to_list()
        ymax = max(ymax, max(ys))
        ax.plot(xs, ys, color=COLOR[sensor], lw=2, zorder=3, label=LABEL[sensor])
        full = [(x, y) for x, y in zip(xs, ys) if x not in partial.get(sensor, {})]
        part = [(x, y) for x, y in zip(xs, ys) if x in partial.get(sensor, {})]
        ax.scatter(*zip(*full), s=36, color=COLOR[sensor], edgecolor=SURFACE, lw=1.5, zorder=4)
        if part:
            ax.scatter(*zip(*part), s=60, facecolor=SURFACE, edgecolor=COLOR[sensor], lw=2, zorder=5,
                       label=f"{sensor} partial year (hollow)")
        # direct label at the right end of each line
        ax.annotate(sensor, (xs[-1], ys[-1]), xytext=(8, 0), textcoords="offset points",
                    va="center", fontsize=10, color=INK, fontweight="bold")

    ax.axvline(VIIRS_START_YEAR - 0.5, color=INK_2, lw=1, ls="--", zorder=2)
    ax.text(VIIRS_START_YEAR - 0.4, ymax * 1.04, "VIIRS record begins (2012)", fontsize=9,
            color=INK_2, va="bottom")

    for sensor, notes in partial.items():
        for yr, note in notes.items():
            val = table.filter(pl.col("year") == yr)[sensor].item()
            if val is None:
                continue
            ax.annotate(note, (yr, val), xytext=(-14, 26), textcoords="offset points", fontsize=8.5, ha="right",
                        color=INK_2, arrowprops=dict(arrowstyle="-", color=MUTED, lw=0.8))

    ax.set_xlim(years[0] - 0.6, years[-1] + 1.4)
    ax.set_ylim(0, ymax * 1.12)
    ax.set_xticks(range(2001, 2026, 2))
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{int(v):,}"))
    ax.set_ylabel("Detections per year (raw count)", color=INK_2)
    ax.grid(axis="y", color=GRID, lw=0.8, zorder=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(MUTED)
    ax.tick_params(colors=INK_2, length=0)

    ax.legend(loc="upper left", frameon=False, fontsize=9, labelcolor=INK)
    fig.suptitle(f"{country}: annual RAW, UNCORRECTED active-fire detection counts, MODIS vs VIIRS",
                 x=0.06, ha="left", fontsize=13, color=INK, fontweight="bold")
    ax.set_title("No harmonization applied. Filters: vegetation fires only, confidence nominal or high, "
                 "daytime only, missing/zero-FRP rows dropped.",
                 loc="left", fontsize=9.5, color=INK_2, pad=10)
    aqua_note = (f" MODIS is Terra-only until Aqua's record begins {aqua_start:%d %b %Y}."
                 if aqua_start is not None else "")
    fig.text(0.06, 0.012,
             "Source: NASA FIRMS archive (MODIS C6.1; VIIRS Suomi-NPP 375 m). UTC calendar years." + aqua_note + "\n"
             "Raw counts are not comparable across sensors: the 2012 rise in total detections comes from adding "
             "a second, finer-resolution sensor.",
             fontsize=8, color=MUTED, linespacing=1.5)
    fig.tight_layout(rect=(0.02, 0.06, 1, 0.97))

    FIGURES.mkdir(parents=True, exist_ok=True)
    out = FIGURES / f"raw_counts_{country}.png"
    fig.savefig(out, facecolor=SURFACE)
    plt.close(fig)
    return out


def main(argv: list[str]) -> int:
    countries = argv or ["Portugal", "Chile"]
    cov = coverage(countries)
    print("Archive coverage across", ", ".join(countries))
    for s, (a, b) in sorted(cov.items()):
        print(f"  {s}: first {a}  last {b}")
    partial = partial_years(cov)
    print("Partial years:", {s: sorted(n) for s, n in partial.items()})

    aqua = (
        pl.concat([pl.read_parquet(PUBLIC / f"detections_{c}.parquet", columns=["platform", "acq_ts"])
                   for c in countries])
        .filter(pl.col("platform") == "Aqua")["acq_ts"].min()
    )
    aqua_start = aqua.date() if aqua is not None else None

    for country in countries:
        table = annual_counts(country)
        out = plot(country, table, partial, aqua_start)
        print(f"\n{country}  -> {out.relative_to(ROOT)}")
        print(f"{'year':>4}  {'MODIS':>7}  {'VIIRS':>7}")
        for r in table.iter_rows(named=True):
            v = "" if r["VIIRS"] is None else f"{r['VIIRS']:,}"
            print(f"{r['year']:>4}  {r['MODIS']:>7,}  {v:>7}")
        print(f"total  {table['MODIS'].sum():>7,}  {table['VIIRS'].sum():>7,}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
