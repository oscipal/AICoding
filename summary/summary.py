# This is only a test file and is not used for the website or any other file/script


import os
import json
import concurrent.futures
from newspaper import Article
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lsa import LsaSummarizer
import nltk
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)
from pathlib import Path
import yaml

WORKERS = 32



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
        article = Article(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        })
        article.download()
        article.parse()
        text = article.text
        title = article.title

        if not text or len(text.strip()) < 100:
            summary = "No summary found"
        else:
            summary = sumy_summarize(text, num_sentences=num_sentences)
        if not title or not title.strip():
            title = "No title found"
        return title, summary
    except Exception as e:
        return "No title found", "No summary found"


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

# To run the function directly if this script is executed
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        _cfg_path = Path(__file__).parent.parent / "configs/config.yml"
        with open(_cfg_path) as _f:
            _cfg = yaml.safe_load(_f)
        input_path = Path(sys.argv[1])
        with open(input_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        features = data["features"]
        total = len(features)
        print(f"Processing {total} articles with {WORKERS} workers...")

        def process_one(args):
            idx, feature = args
            url = feature["properties"].get("url", "")
            title, summary = extract_title_and_summary(url, num_sentences=3)
            print(f"[{idx+1}/{total}] {url}\n  TITLE: {title}\n  SUMMARY: {summary[:80]}...\n")
            return idx, title, summary

        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
            for idx, title, summary in pool.map(process_one, enumerate(features)):
                features[idx]["properties"]["title"] = title
                features[idx]["properties"]["summary"] = summary

        out_dir = Path(_cfg["output_dir"])
        out_path = out_dir / (input_path.stem + "_with_summary.geojson")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\nSaved to {out_path}")
    else:
        process_geojson_and_attach_summaries()