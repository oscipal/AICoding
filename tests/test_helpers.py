"""
Tests for pure helper functions in scripts/download_events.py:
  - extract_domain
  - parse_date
  - date_range
  - day_prefix
"""
import scripts.download_events  # ensures sys.modules is populated for patching
from datetime import date
from scripts.download_events import extract_domain, parse_date, date_range, day_prefix


# ---------------------------------------------------------------------------
# extract_domain
# ---------------------------------------------------------------------------

def test_extract_domain_strips_www():
    assert extract_domain("https://www.bbc.com/news/world") == "bbc.com"

def test_extract_domain_without_www():
    assert extract_domain("https://reuters.com/article/123") == "reuters.com"

def test_extract_domain_empty_string():
    assert extract_domain("") == ""

def test_extract_domain_no_scheme():
    # urlparse handles bare domains gracefully — netloc will be empty, returns truncated url
    result = extract_domain("bbc.com/news")
    assert isinstance(result, str)

def test_extract_domain_subdomain():
    assert extract_domain("https://edition.cnn.com/2026/05/03") == "edition.cnn.com"


# ---------------------------------------------------------------------------
# parse_date
# ---------------------------------------------------------------------------

def test_parse_date_basic():
    assert parse_date("20260503") == date(2026, 5, 3)

def test_parse_date_january():
    assert parse_date("20260101") == date(2026, 1, 1)

def test_parse_date_end_of_year():
    assert parse_date("20251231") == date(2025, 12, 31)


# ---------------------------------------------------------------------------
# date_range
# ---------------------------------------------------------------------------

def test_date_range_single_day():
    result = list(date_range(date(2026, 5, 1), date(2026, 5, 1)))
    assert result == [date(2026, 5, 1)]

def test_date_range_multiple_days():
    result = list(date_range(date(2026, 5, 1), date(2026, 5, 4)))
    assert result == [
        date(2026, 5, 1),
        date(2026, 5, 2),
        date(2026, 5, 3),
        date(2026, 5, 4),
    ]

def test_date_range_end_before_start_is_empty():
    result = list(date_range(date(2026, 5, 5), date(2026, 5, 1)))
    assert result == []


# ---------------------------------------------------------------------------
# day_prefix
# ---------------------------------------------------------------------------

def test_day_prefix_basic():
    assert day_prefix(date(2026, 5, 3)) == "20260503"

def test_day_prefix_zero_padded():
    assert day_prefix(date(2026, 1, 7)) == "20260107"
