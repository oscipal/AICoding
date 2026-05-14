import pytest
import scripts.download_events  # ensures sys.modules is populated for patching
from unittest.mock import patch, MagicMock
from scripts.download_events import sumy_summarize, extract_title_and_summary


# ---------------------------------------------------------------------------
# sumy_summarize
# ---------------------------------------------------------------------------

SAMPLE_TEXT = (
    "The economy grew significantly last quarter. "
    "Analysts attribute this to strong consumer spending. "
    "Inflation remained stable throughout the period. "
    "Unemployment rates hit a record low. "
    "Experts expect continued growth next year."
)

def test_sumy_summarize_returns_string():
    result = sumy_summarize(SAMPLE_TEXT, num_sentences=2)
    assert isinstance(result, str)
    assert len(result) > 0


def test_sumy_summarize_sentences_come_from_input():
    result = sumy_summarize(SAMPLE_TEXT, num_sentences=2)
    # LexRank is extractive — every sentence in the output must be from the input
    input_sentences = [s.strip() for s in SAMPLE_TEXT.split(".") if s.strip()]
    result_sentences = [s.strip() for s in result.split(".") if s.strip()]
    for sentence in result_sentences:
        assert any(sentence in orig for orig in input_sentences), (
            f"Sentence not found in original text: '{sentence}'"
        )


def test_sumy_summarize_fewer_sentences_than_requested():
    # Only 1 sentence in input but 3 requested — should not crash and return a string
    single_sentence = "This is the only sentence in the entire document."
    result = sumy_summarize(single_sentence, num_sentences=3)
    assert isinstance(result, str)


# ---------------------------------------------------------------------------
# extract_title_and_summary
# ---------------------------------------------------------------------------

def test_extract_returns_title_and_summary():
    mock_article = MagicMock()
    mock_article.text = "Long enough article text. " * 10
    mock_article.title = "Test Title"

    with patch("scripts.download_events.Article", return_value=mock_article):
        title, summary = extract_title_and_summary("http://fake.url")

    assert title == "Test Title"
    assert isinstance(summary, str)


def test_extract_short_text_uses_trafilatura_fallback():
    # Article text under 100 chars — should return the fallback message, not a real summary
    mock_article = MagicMock()
    mock_article.text = "Too short."
    mock_article.title = "Some Title"

    with patch("scripts.download_events.Article", return_value=mock_article), \
         patch("scripts.download_events._try_trafilatura", return_value=("Fallback Title", "Fallback summary.")):
        title, summary = extract_title_and_summary("http://fake.url")

    assert title == "Fallback Title"
    assert summary == "Fallback summary."


def test_extract_both_retries_fail_returns_fallback():
    # Both download attempts raise an exception — should return the failure fallback strings
    with patch("scripts.download_events.Article", side_effect=Exception("connection error")), \
         patch("scripts.download_events._try_trafilatura", side_effect=ValueError("fallback failed")):
        title, summary = extract_title_and_summary("http://fake.url")

    assert title == "Failed to extract title"
    assert "Failed to summarize" in summary
    assert "fallback failed" in summary


def test_extract_first_attempt_fails_second_succeeds():
    # First call raises, second succeeds — tests the retry path
    mock_article = MagicMock()
    mock_article.text = "Retry succeeded with enough content. " * 5
    mock_article.title = "Retry Title"

    with patch(
        "scripts.download_events.Article",
        side_effect=[Exception("timeout"), mock_article]
    ):
        title, summary = extract_title_and_summary("http://fake.url")

    assert title == "Retry Title"
    assert isinstance(summary, str)
    assert len(summary) > 0
