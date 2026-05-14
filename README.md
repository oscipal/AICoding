# World News Map

An interactive map of global political events powered by the [GDELT Project](https://www.gdeltproject.org/).

**Live site:** [oscipal.github.io/AICoding](https://oscipal.github.io/AICoding/)

## What it does

- Shows geo-located news events from GDELT Events 2.0
- **News Activity** view: country choropleth plus clustered event points
- **Political Landscape** view with two modes:
  - **Goldstein**: colors countries by weighted average Goldstein score for event behavior, from strongly cooperative to strongly conflictual
  - **Tone**: colors countries by average media tone, where negative values indicate more critical or hostile reporting and positive values indicate more favorable reporting
- Includes top-3 political ranking groups for the current day: best media tone, worst media tone, most conflictual, and most diplomatic
- Filters events by category and time period
- Lets you search for a country and fly to it
- Lets you click a country in News Activity to open that country's articles
- Shows source breakdowns for clusters

## Data pipeline

A GitHub Actions workflow runs every day at 08:00 UTC:

1. Downloads the previous day's GDELT Events 2.0 files
2. Processes them into files under `docs/`
3. Commits and pushes the updated data, which triggers GitHub Pages

The generated data is split into:

- `docs/points_data/<YYYYMMDD>.geojson` - geo-located event points
- `docs/goldstein_data/<YYYYMMDD>.json` - per-country Goldstein and Tone scores
- `docs/mb_data/<YYYYMMDD>.json` - per-country event counts
- `docs/final_data/<YYYYMMDD>_summaries.json` - compact URL -> `{title, summary}` lookup used by the frontend

Older `_with_summary.geojson` files are still supported by the frontend as a fallback, but new downloads use the compact summary index.

To trigger a manual run, open the GitHub Actions workflow and run **Download daily GDELT data** manually.

## Local development

Run the local server:

```powershell
python serve.py 8000
```

Then open `http://localhost:8000/index.html`.

To download data for a specific date or date range:

```powershell
python scripts/download_events.py 20260101
python scripts/download_events.py 20260101 20260107
python scripts/download_events.py 20260101 --skip-summaries
```

## Tests

The test suite lives in `tests/` and uses `pytest`.

```powershell
python -m pytest tests/
```

The tests cover date helpers, zip processing, article summarization, and the compact summary index used by the frontend.

## Configuration

`configs/config.yml` controls output directories and processing limits.

## Data source

[GDELT Events 2.0](http://data.gdeltproject.org/gdeltv2/masterfilelist.txt) scans news from around the world every 15 minutes and extracts political actor-to-actor events using the CAMEO coding scheme.

## License

Data provided by the [GDELT Project](https://www.gdeltproject.org/) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
