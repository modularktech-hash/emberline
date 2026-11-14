"""firms-ingest: normalize NASA FIRMS active-fire detections across sensors.

MODIS (1 km, from 2000) and VIIRS (375 m, from 2012) describe the same
phenomenon with different column names, different confidence encodings,
different footprint sizes and different sensitivities.  This package turns
both into one canonical frame, removes the non-fire heat sources, collapses
duplicate observations into fire events, and aggregates onto a hex grid.

It deliberately stops short of harmonization itself.  Deciding *how* to
correct for the sensitivity difference is a scientific claim that belongs
in the analysis, with its validation numbers attached; this package is the
plumbing underneath it.

    >>> from firms_ingest import read_archive, standard_pipeline, aggregate_cell_day
    >>> detections = read_archive("fire_archive_M-C61_2019.csv", "MCD14ML")
    >>> clean = standard_pipeline(detections)
    >>> cells = aggregate_cell_day(clean, resolution=4)
"""

from __future__ import annotations

from .cluster import assign_events, summarize_events
from .confidence import (
    CONFIDENCE_CLASSES,
    at_least,
    modis_confidence_to_class,
    viirs_confidence_to_class,
)
from .filters import (
    bounding_box,
    daytime_only,
    drop_zero_frp,
    exclude_source_types,
    min_confidence,
    standard_pipeline,
    vegetation_fires_only,
)
from .grid import (
    add_h3_cell,
    aggregate_cell_day,
    cells_for_bbox,
    day_of_year_climatology,
)
from .nrt import NRT_SOURCES, FirmsClient
from .readers import normalize, read_archive, read_many, scan_archive
from .schema import (
    CANONICAL_COLUMNS,
    CANONICAL_SCHEMA,
    OVERPASS_LOCAL_HOUR,
    PRODUCTS,
    SOURCE_TYPES,
    ProductSpec,
    product,
)

__version__ = "0.1.0"

__all__ = [
    "CANONICAL_COLUMNS",
    "CANONICAL_SCHEMA",
    "CONFIDENCE_CLASSES",
    "NRT_SOURCES",
    "OVERPASS_LOCAL_HOUR",
    "PRODUCTS",
    "SOURCE_TYPES",
    "FirmsClient",
    "ProductSpec",
    "add_h3_cell",
    "aggregate_cell_day",
    "assign_events",
    "at_least",
    "bounding_box",
    "cells_for_bbox",
    "day_of_year_climatology",
    "daytime_only",
    "drop_zero_frp",
    "exclude_source_types",
    "min_confidence",
    "modis_confidence_to_class",
    "normalize",
    "product",
    "read_archive",
    "read_many",
    "scan_archive",
    "standard_pipeline",
    "summarize_events",
    "vegetation_fires_only",
    "viirs_confidence_to_class",
    "__version__",
]
