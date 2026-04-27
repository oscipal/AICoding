import os
import json
from newspaper import Article
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lsa import LsaSummarizer
import nltk
nltk.download('punkt')
nltk.download('punkt_tab')
import pathlib as Path
import yaml



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

# To run the function directly if this script is executed
if __name__ == "__main__":
    process_geojson_and_attach_summaries()