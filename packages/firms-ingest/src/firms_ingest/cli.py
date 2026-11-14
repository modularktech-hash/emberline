"""Command line entry point for the ingestion pipeline."""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

import polars as pl

from . import __version__
from .filters import bounding_box, standard_pipeline
from .grid import aggregate_cell_day, day_of_year_climatology
from .nrt import NRT_SOURCES, FirmsClient
from .readers import read_many
from .schema import PRODUCTS


def _write(frame: pl.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()
    if suffix == ".parquet":
        frame.write_parquet(path)
    elif suffix == ".csv":
        frame.write_csv(path)
    elif suffix in (".ndjson", ".jsonl"):
        frame.write_ndjson(path)
    else:
        raise SystemExit(
            f"unsupported output format {suffix!r}; use .parquet, .csv or .ndjson"
        )
    print(f"wrote {frame.height:,} rows to {path}", file=sys.stderr)


def _add_bbox_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--bbox",
        type=float,
        nargs=4,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        help="clip to a lon/lat bounding box",
    )


def _cmd_normalize(args: argparse.Namespace) -> int:
    frame = read_many(args.paths, args.product)
    if args.bbox:
        frame = bounding_box(frame, *args.bbox)
    if not args.no_filter:
        frame = standard_pipeline(
            frame,
            minimum_confidence=args.min_confidence,
            daytime=not args.include_night,
        )
    _write(frame, args.output)
    return 0


def _cmd_aggregate(args: argparse.Namespace) -> int:
    frame = read_many(args.paths, args.product)
    if args.bbox:
        frame = bounding_box(frame, *args.bbox)
    if not args.no_filter:
        frame = standard_pipeline(
            frame,
            minimum_confidence=args.min_confidence,
            daytime=not args.include_night,
        )
    cells = aggregate_cell_day(frame, resolution=args.resolution)
    _write(cells, args.output)
    return 0


def _cmd_climatology(args: argparse.Namespace) -> int:
    cell_day = pl.read_parquet(args.cell_day)
    clim = day_of_year_climatology(
        cell_day,
        value_column=args.value_column,
        smoothing_days=args.smoothing_days,
    )
    _write(clim, args.output)
    return 0


def _cmd_nrt(args: argparse.Namespace) -> int:
    client = FirmsClient(map_key=args.map_key)
    west, south, east, north = args.bbox or (-180.0, -90.0, 180.0, 90.0)
    frame = client.fetch_area(
        args.source,
        west=west,
        south=south,
        east=east,
        north=north,
        day_range=args.day_range,
        day=date.fromisoformat(args.day) if args.day else None,
    )
    _write(frame, args.output)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="firms-ingest",
        description="Normalize NASA FIRMS active-fire detections across MODIS and VIIRS.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    common_filters = argparse.ArgumentParser(add_help=False)
    common_filters.add_argument(
        "--min-confidence",
        default="nominal",
        choices=["low", "nominal", "high"],
        help="drop detections below this confidence class (default: nominal)",
    )
    common_filters.add_argument(
        "--include-night",
        action="store_true",
        help="keep night overpasses (excluded by default: different diurnal phase)",
    )
    common_filters.add_argument(
        "--no-filter",
        action="store_true",
        help="skip all quality filtering and emit the raw normalized frame",
    )

    norm = sub.add_parser(
        "normalize",
        parents=[common_filters],
        help="read archive CSVs into the canonical detection schema",
    )
    norm.add_argument("paths", nargs="+", type=Path)
    norm.add_argument("--product", required=True, choices=sorted(PRODUCTS))
    norm.add_argument("-o", "--output", required=True, type=Path)
    _add_bbox_args(norm)
    norm.set_defaults(func=_cmd_normalize)

    agg = sub.add_parser(
        "aggregate",
        parents=[common_filters],
        help="build the H3 cell x day x sensor table the app reads",
    )
    agg.add_argument("paths", nargs="+", type=Path)
    agg.add_argument("--product", required=True, choices=sorted(PRODUCTS))
    agg.add_argument("-r", "--resolution", type=int, default=4)
    agg.add_argument("-o", "--output", required=True, type=Path)
    _add_bbox_args(agg)
    agg.set_defaults(func=_cmd_aggregate)

    clim = sub.add_parser(
        "climatology",
        help="derive day-of-year percentile bands from a cell-day table",
    )
    clim.add_argument("cell_day", type=Path)
    clim.add_argument("--value-column", default="frp_sum_mw")
    clim.add_argument("--smoothing-days", type=int, default=15)
    clim.add_argument("-o", "--output", required=True, type=Path)
    clim.set_defaults(func=_cmd_climatology)

    nrt = sub.add_parser("nrt", help="fetch near-real-time detections from FIRMS")
    nrt.add_argument("--source", required=True, choices=sorted(NRT_SOURCES))
    nrt.add_argument("--day-range", type=int, default=1)
    nrt.add_argument("--day", help="end date, YYYY-MM-DD (default: today)")
    nrt.add_argument(
        "--map-key", help="FIRMS MAP_KEY (default: the FIRMS_MAP_KEY env var)"
    )
    nrt.add_argument("-o", "--output", required=True, type=Path)
    _add_bbox_args(nrt)
    nrt.set_defaults(func=_cmd_nrt)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
