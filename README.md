# World News Map

An interactive map of global political events powered by the [GDELT Project](https://www.gdeltproject.org/).

**Live site:** [oscipal.github.io/AICoding](https://oscipal.github.io/AICoding/)

## What it does

- Displays geo-located news events from GDELT Events 2.0, updated daily
- **News Activity** view: event density choropleth per country with clustered event points
- **Political Landscape** view with two sub-modes:
  - **Goldstein** — colors countries by weighted average Goldstein score (event type, −10 to +10)
  - **Tone** — colors countries by average media sentiment (how articles are written, not what they describe)
- Filter events by category (conflict, protest, diplomacy, etc.) and time period (daily / weekly / monthly)
- **Country search** — type a country name to fly to it; opens its Goldstein time series in political mode
- **Most Active** list — top 5 countries for the current view (highest activity, most conflictual, or most negative tone)
- **Source breakdown** — clicking a cluster shows which news outlets are represented
- Click a country in Political Landscape mode to see a Goldstein time series

## Data pipeline

A GitHub Actions workflow runs every day at 08:00 UTC:

1. Downloads the previous day's GDELT Events 2.0 files
2. Processes them into three outputs under `docs/`:
   - `points_data/<YYYYMMDD>.geojson` — geo-located event points
   - `goldstein_data/<YYYYMMDD>.json` — per-country Goldstein scores
   - `mb_data/<YYYYMMDD>.json` — per-country event counts
3. Commits and pushes the new data files, triggering a GitHub Pages deploy

To trigger a manual run, go to **Actions → Download daily GDELT data → Run workflow**.

## Local development

```bash
pip install requests pyyaml
python serve.py          # serves docs/ at http://localhost:8000
```

To download data for a specific date range:

```bash
python scripts/download_events.py 20260101 20260107
```

## Configuration

`configs/config.yml` controls output directories and minimum geo precision for event points.

## Data source

[GDELT Events 2.0](http://data.gdeltproject.org/gdeltv2/masterfilelist.txt) — scans news from around the world every 15 minutes and extracts political actor-to-actor events using the CAMEO coding scheme. Coverage is dominated by English-language and Western media.

## License

Data provided by the [GDELT Project](https://www.gdeltproject.org/) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).