from scripts.download_events import build_summary_index


def feature(url=None, title=None, summary=None):
    props = {}
    if url is not None:
        props["url"] = url
    if title is not None:
        props["title"] = title
    if summary is not None:
        props["summary"] = summary
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [0, 0]},
        "properties": props,
    }


def test_build_summary_index_uses_url_as_key():
    result = build_summary_index([
        feature("https://example.com/a", "Title A", "Summary A"),
    ])

    assert result == {
        "https://example.com/a": {
            "title": "Title A",
            "summary": "Summary A",
        }
    }


def test_build_summary_index_keeps_first_duplicate_url():
    result = build_summary_index([
        feature("https://example.com/a", "First title", "First summary"),
        feature("https://example.com/a", "Second title", "Second summary"),
    ])

    assert result["https://example.com/a"] == {
        "title": "First title",
        "summary": "First summary",
    }


def test_build_summary_index_skips_features_without_url():
    result = build_summary_index([
        feature(None, "No URL", "No URL summary"),
        feature("https://example.com/a", "Title A", "Summary A"),
    ])

    assert list(result) == ["https://example.com/a"]


def test_build_summary_index_skips_unsummarized_features():
    # Spec decision: final_data should only contain enrichment records, not empty placeholders.
    result = build_summary_index([
        feature("https://example.com/empty"),
        feature("https://example.com/a", "Title A", "Summary A"),
    ])

    assert "https://example.com/empty" not in result
    assert "https://example.com/a" in result

