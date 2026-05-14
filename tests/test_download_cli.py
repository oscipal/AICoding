from unittest.mock import patch

from scripts.download_events import main


def test_main_passes_skip_summaries_flag_to_process_day():
    with patch("scripts.download_events.fetch_master_list", return_value={"20250101": ["u1"]}), \
         patch("scripts.download_events.process_day") as process_day, \
         patch("scripts.download_events.sys.argv", ["download_events.py", "20250101", "--skip-summaries"]):
        main()

    process_day.assert_called_once()
    _, kwargs = process_day.call_args
    assert kwargs["skip_summaries"] is True
    assert kwargs["summary_limit"] is None
