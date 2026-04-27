"""
Download and preprocess GDELT Events 2.0 data for a date range.

For each date:
  - Fetches the master file list from data.gdeltproject.org/gdeltv2/
  - Downloads all 96 fifteen-minute Events 2.0 export files for that date
  - Uses ActionGeo_Lat/Long — where the event actually took place
  - Maps CAMEO EventRootCode to GKG-compatible theme strings so the existing
    frontend category system works without any changes
  - Streams and discards raw files — never stores the full uncompressed data
  - Writes one compact GeoJSON per day to docs/points_data/
    (same path and format as download_gkg2.py — the two scripts are interchangeable)

Usage:
  python scripts/download_events.py                      # all dates in mb_data/dates.json
  python scripts/download_events.py 20260301             # single date
  python scripts/download_events.py 20260301 20260307    # date range (inclusive)

GDELT Events 2.0 column reference (tab-separated, NO header row):
  See: http://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf
  Col 0:  GLOBALEVENTID
  Col 1:  SQLDATE            (YYYYMMDD)
  Col 26: EventCode          (full CAMEO code, e.g. "190")
  Col 27: EventBaseCode      (2–3 digit)
  Col 28: EventRootCode      (2-digit root, e.g. "19")
  Col 29: QuadClass          (1=VerbCoop, 2=MatCoop, 3=VerbConfl, 4=MatConfl)
  Col 30: GoldsteinScale     (-10 to +10)
  Col 34: AvgTone
  Col 51: ActionGeo_Type     (1=Country, 2=USState, 3=USCity, 4=WorldCity, 5=WorldState)
  Col 52: ActionGeo_FullName
  Col 53: ActionGeo_CountryCode
  Col 54: ActionGeo_ADM1Code
  Col 55: ActionGeo_ADM2Code
  Col 56: ActionGeo_Lat
  Col 57: ActionGeo_Long
  Col 58: ActionGeo_FeatureID
  Col 59: DATEADDED
  Col 60: SOURCEURL

  Note: each geo block has 8 fields (Type, FullName, CountryCode, ADM1Code, ADM2Code,
  Lat, Long, FeatureID) — the ADM2Code field shifts all subsequent indices by +2
  compared to older GDELT codebook versions.

ActionGeo type codes (same scale as GKG V2ENHANCEDLOCATIONS):
  1 = Country centroid  (low precision)
  2 = US State centroid (low precision)
  3 = US City           (good precision)
  4 = World City        (good precision)
  5 = World State/Province
"""

import csv
import io
import json
import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

import nltk
nltk.download('punkt')
nltk.download('punkt_tab')

import requests
import yaml

# ── Configuration ────────────────────────────────────────────────────────────
_cfg_path = Path(__file__).parent.parent / "configs/config.yml"
with open(_cfg_path) as _f:
    _cfg = yaml.safe_load(_f)

MASTER_LIST_URL = _cfg["master_list_url"]
OUTPUT_DIR      = Path(_cfg["output_dir"])
GOLDSTEIN_DIR   = Path(_cfg["goldstein_dir"])
MB_DATA_DIR     = Path(_cfg["mb_data_dir"])
GEOJSON_DIR     = Path(_cfg["geojson_path"])
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
GOLDSTEIN_DIR.mkdir(parents=True, exist_ok=True)
MB_DATA_DIR.mkdir(parents=True, exist_ok=True)
GEOJSON_DIR.mkdir(parents=True, exist_ok=True)
MIN_GEO_TYPE = _cfg["min_geo_type"]

# Raise CSV field size limit for large GDELT fields
csv.field_size_limit(10_000_000)


# ── CAMEO root code → category + human-readable label ───────────────────────
CAMEO_ROOT_CATEGORY = {
    "01": "diplomacy", "02": "diplomacy", "03": "diplomacy",
    "04": "diplomacy", "05": "diplomacy", "06": "diplomacy",
    "07": "diplomacy", "08": "diplomacy",
    "09": "disagreement", "10": "disagreement",
    "11": "disagreement", "12": "disagreement",
    "13": "pressure",  "15": "pressure",
    "16": "pressure",  "17": "pressure",
    "14": "protest",
    "18": "conflict",  "19": "conflict", "20": "conflict",
}

CAMEO_ROOT_LABEL = {
    "01": "Public statement",     "02": "Appeal",
    "03": "Intent to cooperate",  "04": "Consultation",
    "05": "Diplomatic cooperation","06": "Material cooperation",
    "07": "Provide aid",          "08": "Yield",
    "09": "Investigation",        "10": "Demand",
    "11": "Disapproval",          "12": "Rejection",
    "13": "Threat",               "14": "Protest",
    "15": "Show of force",        "16": "Reduce relations",
    "17": "Coercion",             "18": "Assault",
    "19": "Armed conflict",       "20": "Mass violence",
}


# ── Date helpers ──────────────────────────────────────────────────────────────
def parse_date(s):
    return date(int(s[:4]), int(s[4:6]), int(s[6:8]))

def date_range(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)

def day_prefix(d: date):
    return d.strftime("%Y%m%d")


# ── Master file list ──────────────────────────────────────────────────────────
def fetch_master_list():
    """Return dict: day_prefix -> list of Events 2.0 export zip URLs for that day."""
    print("Fetching master file list…")
    r = requests.get(MASTER_LIST_URL, timeout=60)
    r.raise_for_status()

    day_files = {}
    for line in r.text.splitlines():
        parts = line.strip().split()
        if len(parts) < 3:
            continue
        url = parts[2]
        # Events export files (not gkg/mentions/gkgcounts)
        if ".export.CSV.zip" not in url:
            continue
        fname = url.split("/")[-1]
        prefix = fname[:8]   # YYYYMMDD
        day_files.setdefault(prefix, []).append(url)

    return day_files


# ── Process one zip file ──────────────────────────────────────────────────────
def extract_domain(url):
    """Extract bare domain name from a URL for display."""
    try:
        return urlparse(url).netloc.lstrip("www.")
    except Exception:
        return url[:40] if url else ""


def process_zip(url, session, seen_ids, seen_urls):
    """
    Download an Events 2.0 zip, parse it in memory.
    Returns:
      features   — list of GeoJSON point features, ONE PER UNIQUE SOURCEURL so that
                   a cluster count reflects distinct articles, not actor-pair permutations.
      gs_rows    — list of (iso3, goldstein, num_mentions, quad_class) for all unique
                   events (deduped by GLOBALEVENTID), used for per-country Goldstein
                   aggregates regardless of geo precision.

    seen_ids  — set of GLOBALEVENTID strings, shared across zip files (goldstein dedup)
    seen_urls — set of SOURCEURL strings,    shared across zip files (point dedup)
    """
    r = session.get(url, timeout=120)
    r.raise_for_status()

    features = []
    gs_rows  = []

    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        name = zf.namelist()[0]
        with zf.open(name) as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8", errors="replace")
            reader = csv.reader(text, delimiter="\t")
            for row in reader:
                if len(row) < 61:
                    continue

                # ── Goldstein: deduplicate on GLOBALEVENTID ───────────────
                event_id = row[0].strip()
                if not event_id or event_id in seen_ids:
                    continue
                seen_ids.add(event_id)

                actor1_cc = row[7].strip()
                if actor1_cc and len(actor1_cc) == 3 and actor1_cc.isalpha():
                    try:
                        gs = float(row[30])
                        nm = max(int(row[31]), 1)
                        qc = int(row[29])
                        gs_rows.append((actor1_cc, gs, nm, qc))
                    except (ValueError, IndexError):
                        pass

                # ── Point feature: deduplicate on SOURCEURL ───────────────
                # One point per article so cluster counts = distinct articles.
                source_url = row[60].strip()
                if not source_url or source_url in seen_urls:
                    continue
                seen_urls.add(source_url)

                try:
                    geo_type = int(row[51])
                except (ValueError, IndexError):
                    continue
                if geo_type < MIN_GEO_TYPE:
                    continue

                try:
                    lat = float(row[56])
                    lon = float(row[57])
                except (ValueError, IndexError):
                    continue
                if lat == 0.0 and lon == 0.0:
                    continue
                if abs(lat) > 90 or abs(lon) > 180:
                    continue

                location  = row[52].strip()
                date_str  = row[1].strip()[:8]
                root_code = row[28].strip()

                try:
                    tone = round(float(row[34]), 2)
                except (ValueError, IndexError):
                    tone = None

                try:
                    goldstein = round(float(row[30]), 1)
                except (ValueError, IndexError):
                    goldstein = None

                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [round(lon, 5), round(lat, 5)]
                    },
                    "properties": {
                        "date":       date_str,
                        "location":   location,
                        "geo_type":   geo_type,
                        "category":   CAMEO_ROOT_CATEGORY.get(root_code, "diplomacy"),
                        "event_type": CAMEO_ROOT_LABEL.get(root_code, "Unknown"),
                        "goldstein":  goldstein,
                        "tone":       tone,
                        "source":     extract_domain(source_url),
                        "url":        source_url,
                    }
                })

    return features, gs_rows


# ── Process one day ───────────────────────────────────────────────────────────
def process_day(day_key, urls, force=False):
    out_path = GEOJSON_DIR / f"{day_key}.geojson"
    if out_path.exists() and not force:
        print(f"  {day_key}  already exists, skipping. (use --force to overwrite)")
        return

    print(f"  {day_key}  {len(urls)} files to download…")
    all_features = []
    all_gs_rows  = []
    seen_ids     = set()   # GLOBALEVENTID — goldstein dedup
    seen_urls    = set()   # SOURCEURL     — point dedup

    with requests.Session() as session:
        for i, url in enumerate(sorted(urls), 1):
            try:
                feats, gs_rows = process_zip(url, session, seen_ids, seen_urls)
                all_features.extend(feats)
                all_gs_rows.extend(gs_rows)
                print(f"    [{i:02d}/{len(urls)}] +{len(feats):>6}  total={len(all_features):>7}", end="\r")
            except Exception as exc:
                print(f"\n    WARNING: {url.split('/')[-1]} failed — {exc}")

    print(f"\n  {day_key}  {len(all_features):,} point features  {len(all_gs_rows):,} events")


    # ── Summarize articles and attach to features ─────────────────────────────
    from newspaper import Article
    from sumy.parsers.plaintext import PlaintextParser
    from sumy.nlp.tokenizers import Tokenizer
    from sumy.summarizers.lex_rank import LexRankSummarizer

    def sumy_summarize(text, num_sentences=3):
        parser = PlaintextParser.from_string(text, Tokenizer("english"))
        summarizer = LexRankSummarizer()
        summary = summarizer(parser.document, num_sentences)
        return ' '.join(str(sentence) for sentence in summary)

    def extract_title_and_summary(url, num_sentences=3):
        try:
            article = Article(url)
            article.download()
            article.parse()
            text = article.text
            title = article.title
            if not text or len(text.strip()) < 100:
                summary = "Article text extraction failed or was too short."
            else:
                summary = sumy_summarize(text, num_sentences=num_sentences)
            return title, summary
        except Exception as e:
            return "Failed to extract title", f"Failed to summarize: {e}"

    print(f"  Summarizing {len(all_features)} articles...")
    for i, feature in enumerate(all_features):
        url = feature["properties"].get("url", "")
        if url:
            title, summary = extract_title_and_summary(url, num_sentences=3)
            feature["properties"]["title"] = title
            feature["properties"]["summary"] = summary
        else:
            feature["properties"]["title"] = "No URL"
            feature["properties"]["summary"] = "No summary available."
        if (i + 1) % 25 == 0 or (i + 1) == len(all_features):
            print(f"    [{i+1}/{len(all_features)}] summarized", end="\r")

    geojson = {"type": "FeatureCollection", "features": all_features}
    summarized_path = OUTPUT_DIR / f"{day_key}_with_summary.geojson"
    with open(summarized_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    print(f"\n  Saved summarized points -> {summarized_path}  ({summarized_path.stat().st_size / 1e6:.1f} MB)")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))
    print(f"  Saved points   -> {out_path}  ({out_path.stat().st_size / 1e6:.1f} MB)")

    # ── Goldstein aggregation per Actor1 country ──────────────────────────────
    # Weighted average Goldstein score (weight = NumMentions) per country code.
    # Only countries with at least 3 events are included to avoid noisy single-event outliers.
    from collections import defaultdict
    stats = defaultdict(lambda: [0.0, 0, 0, 0])  # [gs*nm sum, nm sum, n, conflict_n]
    for iso3, gs, nm, qc in all_gs_rows:
        s = stats[iso3]
        s[0] += gs * nm
        s[1] += nm
        s[2] += 1
        if qc >= 3:
            s[3] += 1

    goldstein_data = sorted(
        [
            {
                "iso3":         iso3,
                "goldstein":    round(s[0] / s[1], 2),
                "n":            s[2],
                "conflict_pct": round(100 * s[3] / s[2], 1),
            }
            for iso3, s in stats.items()
            if s[1] > 0 and s[2] >= 3
        ],
        key=lambda x: x["iso3"],
    )

    gs_path = GOLDSTEIN_DIR / f"{day_key}.json"
    with open(gs_path, "w", encoding="utf-8") as f:
        json.dump(goldstein_data, f, separators=(",", ":"))
    print(f"  Saved goldstein -> {gs_path}  ({gs_path.stat().st_size / 1024:.0f} KB, {len(goldstein_data)} countries)")

    # ── mb_data: article counts per country (for news activity choropleth) ───
    # Reuses Actor1CountryCode event counts from the goldstein aggregation as a
    # proxy for news activity volume. GDELT country codes mostly match ISO 3166-1
    # alpha-3 for major countries so the Mapbox choropleth picks them up correctly.
    mb_data = [{"iso3": r["iso3"], "count": r["n"]} for r in goldstein_data]
    mb_path = MB_DATA_DIR / f"{day_key}.json"
    with open(mb_path, "w", encoding="utf-8") as f:
        json.dump(mb_data, f, separators=(",", ":"))
    print(f"  Saved mb_data   -> {mb_path}")


# Summarize articles using LexRank (after downloading Events 2.0 data) to attach
# a title and summary to each point feature based on the SOURCEURL article text.

def sumy_summarize(text, num_sentences=3):
    from sumy.summarizers.lex_rank import LexRankSummarizer
    parser = PlaintextParser.from_string(text, Tokenizer("english"))
    summarizer = LexRankSummarizer()
    summary = summarizer(parser.document, num_sentences)
    return ' '.join(str(sentence) for sentence in summary)

def extract_title_and_summary(url, num_sentences=3):
    """
    Given a news article URL, downloads the article, extracts the title and a summary.
    Returns (title, summary). If extraction fails, returns error messages.
    """
    try:
        article = Article(url)
        article.download()
        article.parse()
        text = article.text
        title = article.title

        if not text or len(text.strip()) < 100:
            summary = "Article text extraction failed or was too short."
        else:
            summary = sumy_summarize(text, num_sentences=num_sentences)
        return title, summary
    except Exception as e:
        return "Failed to extract title", f"Failed to summarize: {e}"


def process_geojson_and_attach_summaries():
    """
    Loads the GeoJSON file specified in configs/config.yml, extracts title and summary for each article URL,
    attaches them to the properties, and saves to a new file with '_with_summary.geojson' suffix.
    """
    # Load config
    _cfg_path = Path(__file__).parent.parent / "configs/config.yml"
    with open(_cfg_path) as _f:
        _cfg = yaml.safe_load(_f)

    geojson_path = Path(_cfg["geojson_path"])
    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for i, feature in enumerate(data["features"]):
        url = feature["properties"].get("url", "")
        title, summary = extract_title_and_summary(url, num_sentences=3)
        feature["properties"]["title"] = title
        feature["properties"]["summary"] = summary
        print(f"\nURL: {url}\nTITLE: {title}\nSUMMARY: {summary}\n")

    new_geojson_path = geojson_path.replace('.geojson', '_with_summary.geojson')
    with open(new_geojson_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    argv = sys.argv[1:]
    force = "--force" in argv
    args  = [a for a in argv if not a.startswith("--")]

    if len(args) == 0:
        dates_path = Path("docs/mb_data/dates.json")
        if not dates_path.exists():
            print("No arguments given and docs/mb_data/dates.json not found.")
            print("Usage: python scripts/download_events.py [YYYYMMDD [YYYYMMDD]]")
            sys.exit(1)
        with open(dates_path) as f:
            day_keys = json.load(f)
        days = [parse_date(d) for d in day_keys]

    elif len(args) == 1:
        days = [parse_date(args[0])]

    elif len(args) == 2:
        days = list(date_range(parse_date(args[0]), parse_date(args[1])))

    else:
        print("Usage: python scripts/download_events.py [YYYYMMDD [YYYYMMDD]] [--force]")
        sys.exit(1)

    print(f"Processing {len(days)} day(s): {days[0]} to {days[-1]}")

    day_files = fetch_master_list()

    for d in days:
        key  = day_prefix(d)
        urls = day_files.get(key, [])
        if not urls:
            print(f"  {key}  no Events 2.0 files found in master list.")
            continue
        process_day(key, urls, force=force)

    # ── Update dates.json with all available days ─────────────────────────────
    dates_path = MB_DATA_DIR / "dates.json"
    existing = []
    if dates_path.exists():
        with open(dates_path) as f:
            existing = json.load(f)
    all_dates = sorted(set(existing) | {
        p.stem for p in MB_DATA_DIR.glob("????????.json")
    })
    with open(dates_path, "w") as f:
        json.dump(all_dates, f)
    print(f"\nUpdated {dates_path}  ({len(all_dates)} dates)")
    print("Done.")





if __name__ == "__main__":
    main()
