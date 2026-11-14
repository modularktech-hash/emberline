import polars as pl
import pytest

from firms_ingest import NRT_SOURCES, FirmsClient
from firms_ingest.nrt import MAX_DAY_RANGE

# The NRT area endpoint returns fewer columns than the archive -- notably no
# `type` field -- which is why source_type is nullable in the canonical schema.
NRT_VIIRS_CSV = """country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
AUS,-12.5010,133.2010,340.5,0.39,0.36,2026-09-16,0330,N,VIIRS,h,2.0NRT,295.0,8.4,D
AUS,-12.5030,133.2040,336.2,0.38,0.36,2026-09-16,0330,N,VIIRS,n,2.0NRT,294.1,3.2,D
"""


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("FIRMS_MAP_KEY", raising=False)
    return FirmsClient(map_key="test-key")


def test_map_key_required(monkeypatch):
    monkeypatch.delenv("FIRMS_MAP_KEY", raising=False)
    with pytest.raises(ValueError, match="MAP_KEY is required"):
        FirmsClient()


def test_map_key_read_from_environment(monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", "from-env")
    assert FirmsClient()._map_key == "from-env"


def test_nrt_response_normalizes_to_canonical_schema(client):
    frame = client._parse(NRT_VIIRS_CSV, NRT_SOURCES["VIIRS_SNPP_NRT"])
    assert frame.height == 2
    assert frame["sensor"].to_list() == ["VIIRS", "VIIRS"]
    assert frame["platform"].to_list() == ["Suomi-NPP", "Suomi-NPP"]
    assert frame["confidence_class"].to_list() == ["high", "nominal"]
    # No `type` column in the NRT feed: nulls, not a crash.
    assert frame["source_type"].to_list() == [None, None]


def test_empty_nrt_response_is_not_an_error(client):
    """A quiet AOI legitimately returns a header-only or empty body."""
    header_only = NRT_VIIRS_CSV.split("\n")[0]
    assert client._parse(header_only, "VNP14IMGML").height == 0
    assert client._parse("", "VNP14IMGML").height == 0


def test_unknown_source_rejected(client):
    with pytest.raises(ValueError, match="unknown FIRMS source"):
        client.fetch_area("LANDSAT_NRT")


@pytest.mark.parametrize("day_range", [0, MAX_DAY_RANGE + 1])
def test_day_range_bounds_enforced(client, day_range):
    with pytest.raises(ValueError, match="day_range must be"):
        client.fetch_area("VIIRS_SNPP_NRT", day_range=day_range)


def test_inverted_latitudes_rejected(client):
    with pytest.raises(ValueError, match="invalid latitude range"):
        client.fetch_area("VIIRS_SNPP_NRT", south=10.0, north=-10.0)


def test_url_includes_key_source_area_and_range(client):
    url = client._url("VIIRS_SNPP_NRT", "1,2,3,4", 3, None)
    assert url.endswith("/test-key/VIIRS_SNPP_NRT/1,2,3,4/3")


@pytest.mark.parametrize(
    "body",
    [
        "Invalid MAP_KEY provided.",
        "You have exceeded your transaction limit.",
        "<html><body>502 Bad Gateway</body></html>",
    ],
)
def test_plaintext_error_body_is_detected_not_parsed(client, monkeypatch, body):
    """FIRMS answers key and quota errors with HTTP 200 and a plain-text body."""
    monkeypatch.setattr(FirmsClient, "_get", lambda self, url: body)
    with pytest.raises(RuntimeError, match="FIRMS rejected the request"):
        client.fetch_area("VIIRS_SNPP_NRT")


def test_valid_body_survives_the_error_guard(client, monkeypatch):
    monkeypatch.setattr(FirmsClient, "_get", lambda self, url: NRT_VIIRS_CSV)
    assert client.fetch_area("VIIRS_SNPP_NRT").height == 2


def test_nrt_and_archive_frames_concatenate(client, modis_csv):
    from firms_ingest import read_archive

    nrt = client._parse(NRT_VIIRS_CSV, "VNP14IMGML")
    archive = read_archive(modis_csv, "MCD14ML")
    combined = pl.concat([archive, nrt], how="vertical")
    assert combined.height == archive.height + nrt.height
