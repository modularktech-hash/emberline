"""Harmonize the two incompatible FIRMS confidence encodings.

MODIS reports detection confidence as an integer 0-100.  VIIRS reports it
as one of three classes: low, nominal, high.  There is no official
conversion between them, and pretending the VIIRS classes are numbers (or
that the MODIS number is a class) is the single most common way to
silently corrupt a cross-sensor comparison.

This module does the only defensible thing: it projects **both** onto the
coarser of the two scales, the three-class VIIRS scale, using the
breakpoints FIRMS itself publishes for binning MODIS confidence.  Going
the other way -- inventing a 0-100 number for a VIIRS class -- would
manufacture precision the product does not carry, so it is not offered.

The breakpoints are deliberately module-level constants rather than magic
numbers, so a reviewer can see and challenge them.
"""

from __future__ import annotations

import polars as pl

LOW = "low"
NOMINAL = "nominal"
HIGH = "high"

CONFIDENCE_CLASSES: tuple[str, ...] = (LOW, NOMINAL, HIGH)

#: Upper bound (exclusive) of the MODIS 0-100 confidence band for each class.
#: 0-29 low, 30-79 nominal, 80-100 high -- the binning FIRMS applies when it
#: renders MODIS confidence categorically.
MODIS_LOW_MAX = 30
MODIS_NOMINAL_MAX = 80

#: VIIRS single-letter codes as they appear in the archive CSVs and NRT API.
VIIRS_CODE_TO_CLASS: dict[str, str] = {
    "l": LOW,
    "n": NOMINAL,
    "h": HIGH,
    "low": LOW,
    "nominal": NOMINAL,
    "high": HIGH,
}

#: Ordering for filters like "nominal and above".
CLASS_RANK: dict[str, int] = {LOW: 0, NOMINAL: 1, HIGH: 2}


def modis_confidence_to_class(value: int | float | None) -> str | None:
    """Bin a MODIS 0-100 confidence onto the three-class VIIRS scale."""
    if value is None:
        return None
    if value < MODIS_LOW_MAX:
        return LOW
    if value < MODIS_NOMINAL_MAX:
        return NOMINAL
    return HIGH


def viirs_confidence_to_class(value: str | None) -> str | None:
    """Normalize a VIIRS confidence code to a canonical class name."""
    if value is None:
        return None
    return VIIRS_CODE_TO_CLASS.get(value.strip().lower())


def confidence_class_expr(sensor: str) -> pl.Expr:
    """Polars expression deriving `confidence_class` from `confidence_raw`.

    Dispatches on sensor because the raw column means different things:
    a numeric string for MODIS, a class code for VIIRS.
    """
    raw = pl.col("confidence_raw").cast(pl.Utf8).str.strip_chars()

    if sensor == "MODIS":
        numeric = raw.cast(pl.Float64, strict=False)
        return (
            pl.when(numeric.is_null())
            .then(None)
            .when(numeric < MODIS_LOW_MAX)
            .then(pl.lit(LOW))
            .when(numeric < MODIS_NOMINAL_MAX)
            .then(pl.lit(NOMINAL))
            .otherwise(pl.lit(HIGH))
            .cast(pl.Utf8)
        )

    lowered = raw.str.to_lowercase()
    return lowered.replace_strict(
        VIIRS_CODE_TO_CLASS, default=None, return_dtype=pl.Utf8
    )


def at_least(minimum: str) -> pl.Expr:
    """Boolean expression selecting detections at or above a confidence class.

    >>> frame.filter(at_least("nominal"))
    """
    if minimum not in CLASS_RANK:
        raise ValueError(
            f"unknown confidence class {minimum!r}; "
            f"expected one of {', '.join(CONFIDENCE_CLASSES)}"
        )
    keep = [name for name, rank in CLASS_RANK.items() if rank >= CLASS_RANK[minimum]]
    return pl.col("confidence_class").is_in(keep)
