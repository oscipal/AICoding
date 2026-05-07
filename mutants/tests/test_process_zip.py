"""
Tests for process_zip() in scripts/download_events.py.

process_zip() downloads a zip from a URL, parses the GDELT TSV inside it,
and returns (features, gs_rows). We test it by:
  - Building a synthetic zip in memory
  - Patching requests.Session.get to return it
so no real network calls are made.

GDELT Events 2.0 column indices used by process_zip:
  0   GLOBALEVENTID
  1   SQLDATE
  7   Actor1CountryCode
  28  EventRootCode
  29  QuadClass
  30  GoldsteinScale
  31  NumMentions
  34  AvgTone
  51  ActionGeo_Type
  52  ActionGeo_FullName
  56  ActionGeo_Lat
  57  ActionGeo_Long
  60  SOURCEURL
"""

import io
import zipfile
from unittest.mock import MagicMock, patch

import scripts.download_events  # ensures sys.modules is populated for patching
from scripts.download_events import process_zip, MIN_GEO_TYPE


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_row(**overrides):
    """Return a 61-column GDELT tab-separated row as a list of strings.
    Defaults represent a valid, well-formed event that should pass all filters.
    """
    row = [""] * 61
    row[0]  = overrides.get("event_id",    "EVT001")
    row[1]  = overrides.get("date",        "20260503")
    row[7]  = overrides.get("actor1_cc",   "USA")
    row[28] = overrides.get("root_code",   "14")        # protest
    row[29] = overrides.get("quad_class",  "3")         # verbal conflict
    row[30] = overrides.get("goldstein",   "-2.0")
    row[31] = overrides.get("num_mentions","5")
    row[34] = overrides.get("tone",        "-3.5")
    row[51] = overrides.get("geo_type",    str(MIN_GEO_TYPE))
    row[52] = overrides.get("location",    "Berlin, Germany")
    row[56] = overrides.get("lat",         "52.52")
    row[57] = overrides.get("lon",         "13.405")
    row[60] = overrides.get("url",         "https://example.com/article1")
    return row


def make_zip(rows):
    """Create an in-memory zip containing a TSV file built from the given rows."""
    tsv_lines = "\n".join("\t".join(r) for r in rows)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("20260503000000.export.CSV", tsv_lines)
    buf.seek(0)
    return buf.read()


def run_process_zip(rows):
    """Run process_zip with synthetic data, returning (features, gs_rows)."""
    zip_bytes = make_zip(rows)
    mock_response = MagicMock()
    mock_response.content = zip_bytes

    mock_session = MagicMock()
    mock_session.get.return_value = mock_response

    return process_zip("http://fake.url/data.zip", mock_session, set(), set())


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_valid_row_produces_one_feature():
    features, gs_rows = run_process_zip([make_row()])
    assert len(features) == 1
    assert len(gs_rows) == 1


def test_feature_has_correct_coordinates():
    features, _ = run_process_zip([make_row(lat="52.52", lon="13.405")])
    coords = features[0]["geometry"]["coordinates"]
    assert coords == [13.405, 52.52]


def test_feature_has_correct_properties():
    features, _ = run_process_zip([make_row(
        date="20260503",
        location="Berlin, Germany",
        root_code="14",
        goldstein="-2.0",
        tone="-3.5",
        url="https://example.com/article1",
    )])
    props = features[0]["properties"]
    assert props["date"]       == "20260503"
    assert props["location"]   == "Berlin, Germany"
    assert props["category"]   == "protest"
    assert props["event_type"] == "Protest"
    assert props["goldstein"]  == -2.0
    assert props["tone"]       == -3.5
    assert props["url"]        == "https://example.com/article1"
    assert props["source"]     == "example.com"


def test_unknown_cameo_code_defaults_to_diplomacy():
    features, _ = run_process_zip([make_row(root_code="99")])
    assert features[0]["properties"]["category"]   == "diplomacy"
    assert features[0]["properties"]["event_type"] == "Unknown"


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def test_duplicate_event_id_produces_one_gs_row():
    rows = [
        make_row(event_id="EVT001", url="https://example.com/a1"),
        make_row(event_id="EVT001", url="https://example.com/a2"),
    ]
    _, gs_rows = run_process_zip(rows)
    assert len(gs_rows) == 1


def test_duplicate_url_produces_one_feature():
    rows = [
        make_row(event_id="EVT001", url="https://example.com/same"),
        make_row(event_id="EVT002", url="https://example.com/same"),
    ]
    features, _ = run_process_zip(rows)
    assert len(features) == 1


def test_unique_urls_produce_multiple_features():
    rows = [
        make_row(event_id="EVT001", url="https://example.com/a1"),
        make_row(event_id="EVT002", url="https://example.com/a2"),
    ]
    features, _ = run_process_zip(rows)
    assert len(features) == 2


# ---------------------------------------------------------------------------
# Geo filtering
# ---------------------------------------------------------------------------

def test_geo_type_below_minimum_excluded():
    low_geo = str(MIN_GEO_TYPE - 1)
    features, _ = run_process_zip([make_row(geo_type=low_geo)])
    assert len(features) == 0


def test_geo_type_at_minimum_included():
    features, _ = run_process_zip([make_row(geo_type=str(MIN_GEO_TYPE))])
    assert len(features) == 1


def test_zero_coordinates_excluded():
    features, _ = run_process_zip([make_row(lat="0.0", lon="0.0")])
    assert len(features) == 0


def test_invalid_lat_lon_excluded():
    features, _ = run_process_zip([make_row(lat="not_a_number", lon="13.405")])
    assert len(features) == 0


def test_out_of_range_lat_excluded():
    features, _ = run_process_zip([make_row(lat="95.0", lon="13.405")])
    assert len(features) == 0


def test_out_of_range_lon_excluded():
    features, _ = run_process_zip([make_row(lat="52.52", lon="200.0")])
    assert len(features) == 0


# ---------------------------------------------------------------------------
# Goldstein / gs_rows
# ---------------------------------------------------------------------------

def test_gs_row_contains_correct_values():
    _, gs_rows = run_process_zip([make_row(
        actor1_cc="DEU", goldstein="-4.0", num_mentions="3", quad_class="4", tone="-5.0"
    )])
    iso3, gs, nm, qc, tone = gs_rows[0]
    assert iso3 == "DEU"
    assert gs   == -4.0
    assert nm   == 3
    assert qc   == 4
    assert tone == -5.0


def test_actor_without_valid_country_code_excluded_from_gs():
    # 2-letter code is invalid (must be exactly 3 alpha chars)
    _, gs_rows = run_process_zip([make_row(actor1_cc="US")])
    assert len(gs_rows) == 0


def test_invalid_goldstein_value_excluded_from_gs():
    _, gs_rows = run_process_zip([make_row(goldstein="bad_value")])
    assert len(gs_rows) == 0


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_short_row_skipped():
    # Row with fewer than 61 columns should be silently ignored
    short_row = ["col"] * 30
    features, gs_rows = run_process_zip([short_row])
    assert features == []
    assert gs_rows  == []


def test_empty_zip_returns_empty():
    features, gs_rows = run_process_zip([])
    assert features == []
    assert gs_rows  == []
