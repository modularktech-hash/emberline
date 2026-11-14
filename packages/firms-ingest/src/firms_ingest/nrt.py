"""Client for the FIRMS near-real-time area API.

The archive products lag by months.  For the early-warning half of the
application we need the last few days, which FIRMS serves from a separate
endpoint with a different (smaller) column set.  Responses are normalized
through exactly the same path as the archive files, so the live layer and
the historical record are directly comparable rather than two parallel
code paths that drift apart.

Requires a FIRMS MAP_KEY: https://firms.modaps.eosdis.nasa.gov/api/map_key/
"""

from __future__ import annotations

import os
from datetime import date
from io import StringIO

import polars as pl

from .readers import normalize
from .schema import empty_frame, product

__all__ = ["NRT_SOURCES", "FirmsClient", "MAX_DAY_RANGE"]

BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

#: FIRMS hard limit on a single area request.
MAX_DAY_RANGE = 10

#: NRT feed name -> the archive product whose column layout it shares.
NRT_SOURCES: dict[str, str] = {
    "MODIS_NRT": "MCD14ML",
    "MODIS_SP": "MCD14ML",
    "VIIRS_SNPP_NRT": "VNP14IMGML",
    "VIIRS_SNPP_SP": "VNP14IMGML",
    "VIIRS_NOAA20_NRT": "VJ114IMGML",
    "VIIRS_NOAA21_NRT": "VJ214IMGML",
}


class FirmsClient:
    """Thin wrapper over the FIRMS area endpoint.

    The MAP_KEY is read from the `FIRMS_MAP_KEY` environment variable by
    default and is never written to logs or to the returned frame.
    """

    def __init__(
        self,
        map_key: str | None = None,
        *,
        timeout: float = 60.0,
        base_url: str = BASE_URL,
    ) -> None:
        key = map_key or os.environ.get("FIRMS_MAP_KEY")
        if not key:
            raise ValueError(
                "a FIRMS MAP_KEY is required; pass map_key= or set FIRMS_MAP_KEY"
            )
        self._map_key = key
        self._timeout = timeout
        self._base_url = base_url.rstrip("/")

    def _url(self, source: str, area: str, day_range: int, day: date | None) -> str:
        parts = [self._base_url, self._map_key, source, area, str(day_range)]
        if day is not None:
            parts.append(day.isoformat())
        return "/".join(parts)

    def fetch_area(
        self,
        source: str,
        *,
        west: float = -180.0,
        south: float = -90.0,
        east: float = 180.0,
        north: float = 90.0,
        day_range: int = 1,
        day: date | None = None,
    ) -> pl.DataFrame:
        """Fetch detections for a bounding box, normalized to the canonical schema.

        `day_range` counts back from `day` (or from today when omitted).
        """
        if source not in NRT_SOURCES:
            known = ", ".join(sorted(NRT_SOURCES))
            raise ValueError(f"unknown FIRMS source {source!r}; known sources: {known}")
        if not 1 <= day_range <= MAX_DAY_RANGE:
            raise ValueError(f"day_range must be 1-{MAX_DAY_RANGE}, got {day_range}")
        if not (-90 <= south <= north <= 90):
            raise ValueError(f"invalid latitude range: south={south}, north={north}")

        area = f"{west},{south},{east},{north}"
        text = self._get(self._url(source, area, day_range, day))
        return self._parse(text, NRT_SOURCES[source])

    def _get(self, url: str) -> str:
        try:
            import httpx
        except ImportError as exc:  # pragma: no cover - dependency guard
            raise ImportError(
                "the NRT client requires httpx: pip install 'firms-ingest[nrt]'"
            ) from exc

        response = httpx.get(url, timeout=self._timeout, follow_redirects=True)
        response.raise_for_status()
        return response.text

    def _parse(self, text: str, product_name: str) -> pl.DataFrame:
        spec = product(product_name)
        stripped = text.strip()

        # An empty body means no detections in the window, which is a normal
        # answer for a small AOI and must not look like a failure.
        if not stripped:
            return empty_frame()

        header = stripped.split("\n", 1)[0].lower()

        # FIRMS answers quota and key errors with HTTP 200 and a plain-text
        # body, so the status code alone is not enough to trust the payload.
        # Validating the header here rather than in the transport method means
        # the check applies to every response body, however it was obtained.
        if "latitude" not in header or "longitude" not in header:
            raise RuntimeError(
                f"FIRMS rejected the request: {stripped[:200]}"
            )

        # Header present but no data rows: a quiet AOI, not an error.
        if "\n" not in stripped:
            return empty_frame()

        raw = pl.read_csv(
            StringIO(text), infer_schema_length=10_000, ignore_errors=False
        )
        if raw.is_empty():
            return empty_frame()
        return normalize(raw.lazy(), spec).collect()
