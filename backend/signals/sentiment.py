import feedparser
import re
import time
import json
from pathlib import Path
from datetime import datetime, timedelta
from backend.ai.gemini_client import model

CACHE_DIR = Path("data/cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Full company name map — Google News searches by name, not ticker
SYMBOL_TO_NAME = {
    "RELIANCE":    "Reliance Industries",
    "TCS":         "Tata Consultancy Services",
    "HDFCBANK":    "HDFC Bank",
    "INFY":        "Infosys",
    "ICICIBANK":   "ICICI Bank",
    "HINDUNILVR":  "Hindustan Unilever",
    "ITC":         "ITC Limited",
    "SBIN":        "State Bank of India",
    "BHARTIARTL":  "Bharti Airtel",
    "KOTAKBANK":   "Kotak Mahindra Bank",
    "LT":          "Larsen Toubro",
    "AXISBANK":    "Axis Bank",
    "ASIANPAINT":  "Asian Paints",
    "MARUTI":      "Maruti Suzuki",
    "SUNPHARMA":   "Sun Pharmaceutical",
    "TITAN":       "Titan Company",
    "BAJFINANCE":  "Bajaj Finance",
    "WIPRO":       "Wipro",
    "HCLTECH":     "HCL Technologies",
    "ULTRACEMCO":  "UltraTech Cement",
    "NESTLEIND":   "Nestle India",
    "TECHM":       "Tech Mahindra",
    "POWERGRID":   "Power Grid Corporation",
    "NTPC":        "NTPC Limited",
    "TATAMOTORS":  "Tata Motors",
    "ONGC":        "Oil Natural Gas Corporation",
    "JSWSTEEL":    "JSW Steel",
    "TATASTEEL":   "Tata Steel",
    "ADANIENT":    "Adani Enterprises",
    "ADANIPORTS":  "Adani Ports",
    "BAJAJFINSV":  "Bajaj Finserv",
    "COALINDIA":   "Coal India",
    "BRITANNIA":   "Britannia Industries",
    "DRREDDY":     "Dr Reddys Laboratories",
    "DIVISLAB":    "Divis Laboratories",
    "CIPLA":       "Cipla",
    "EICHERMOT":   "Eicher Motors",
    "HEROMOTOCO":  "Hero MotoCorp",
    "HINDALCO":    "Hindalco Industries",
    "INDUSINDBK":  "IndusInd Bank",
    "MM":          "Mahindra Mahindra",
    "SBILIFE":     "SBI Life Insurance",
    "HDFCLIFE":    "HDFC Life Insurance",
    "BPCL":        "Bharat Petroleum",
    "GRASIM":      "Grasim Industries",
    "TATACONSUM":  "Tata Consumer Products",
    "APOLLOHOSP":  "Apollo Hospitals",
    "BAJAJ-AUTO":  "Bajaj Auto",
    "UPL":         "UPL Limited",
    "SHRIRAMFIN":  "Shriram Finance",
}

def fetch_news_headlines(symbol: str, max_articles: int = 8) -> list[dict]:
    company_name = SYMBOL_TO_NAME.get(symbol.upper(), symbol)
    query = company_name.replace(" ", "+") + "+stock+NSE"
    rss_url = f"https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"

    try:
        feed = feedparser.parse(rss_url)
        headlines = []

        for entry in feed.entries[:max_articles]:
            # Clean HTML tags from title
            title = re.sub(r"<[^>]+>", "", entry.get("title", ""))
            source = entry.get("source", {}).get("title", "Unknown")
            published = entry.get("published", "")

            headlines.append({
                "title":     title,
                "source":    source,
                "published": published,
                "url":       entry.get("link", "")
            })

        return headlines

    except Exception as e:
        print(f"News fetch failed for {symbol}: {e}")
        return []

def analyse_sentiment(symbol: str, headlines: list[dict]) -> dict:
    if not headlines:
        return _empty_sentiment(symbol)

    headlines_text = "\n".join([
        f"- [{h['source']}] {h['title']}"
        for h in headlines
    ])

    prompt = f"""
You are a financial news analyst for Growth Artha, an Indian retail investor platform.

Analyse these recent news headlines for {SYMBOL_TO_NAME.get(symbol, symbol)} (NSE: {symbol}):

{headlines_text}

Respond ONLY with a valid JSON object in exactly this format:
{{
  "sentiment_score": <float between -1.0 and 1.0>,
  "sentiment_label": "<Strongly Positive | Positive | Neutral | Negative | Strongly Negative>",
  "summary": "<2 sentence max summary of what the news collectively says about this stock>",
  "key_themes": ["<theme1>", "<theme2>", "<theme3>"],
  "top_headline": "<the single most impactful headline from the list>",
  "risk_flags": ["<any red flags mentioned, empty list if none>"],
  "catalysts": ["<positive catalysts mentioned, empty list if none>"]
}}

Rules:
- sentiment_score: 1.0 = extremely positive, 0 = neutral, -1.0 = extremely negative
- Be conservative — only score strongly positive/negative if headlines clearly justify it
- Focus on business fundamentals, not general market sentiment
- key_themes: max 3 items, each under 4 words
- summary: written for a retail investor, plain English, no jargon
"""
    try:
        response = model.generate_content(prompt)
        # Strip markdown code fences if Gemini wraps in ```json
        raw = response.text.strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"^```\s*",     "", raw)
        raw = re.sub(r"\s*```$",     "", raw)

        result = json.loads(raw)

        # Attach original headlines to result
        result["headlines"]   = headlines
        result["symbol"]      = symbol
        result["company"]     = SYMBOL_TO_NAME.get(symbol, symbol)
        result["analysed_at"] = datetime.now().isoformat()
        result["headline_count"] = len(headlines)

        return result

    except json.JSONDecodeError as e:
        print(f"Gemini JSON parse failed for {symbol}: {e}")
        print(f"Raw response: {response.text[:200]}")
        return _empty_sentiment(symbol)
    except Exception as e:
        print(f"Sentiment analysis failed for {symbol}: {e}")
        return _empty_sentiment(symbol)

def get_stock_sentiment(symbol: str, force_refresh: bool = False) -> dict:
    cache_file = CACHE_DIR / f"{symbol.upper()}_sentiment.json"

    # Return cache if fresh (< 4 hours old)
    if not force_refresh and cache_file.exists():
        age_hours = (datetime.now().timestamp() - cache_file.stat().st_mtime) / 3600
        if age_hours < 4:
            with open(cache_file) as f:
                cached = json.load(f)
            cached["from_cache"] = True
            cached["cache_age_minutes"] = round(age_hours * 60)
            return cached

    # Fetch fresh headlines + analyse
    print(f"Fetching sentiment for {symbol}...")
    headlines = fetch_news_headlines(symbol)
    time.sleep(0.5)                          # be polite to Google News

    result = analyse_sentiment(symbol, headlines)
    result["from_cache"] = False

    # Save to cache
    if result.get("sentiment_score") is not None:
        with open(cache_file, "w") as f:
            json.dump(result, f, indent=2)
    return result

def get_bulk_sentiment(symbols: list[str]) -> dict:
    results = {}
    for i, symbol in enumerate(symbols):
        results[symbol] = get_stock_sentiment(symbol)
        if i % 5 == 4:
            time.sleep(2)   # pause every 5 requests
    return results

def sentiment_to_signal_weight(sentiment: dict) -> float:
    score = sentiment.get("sentiment_score", 0)
    if score is None:
        return 0.0
    # Scale: strong positive news (+0.30 max), strong negative (-0.30 max)
    return round(score * 0.30, 3)

def _empty_sentiment(symbol: str) -> dict:
    return {
        "symbol":           symbol,
        "company":          SYMBOL_TO_NAME.get(symbol, symbol),
        "sentiment_score":  None,
        "sentiment_label":  "Unavailable",
        "summary":          "News data unavailable for this stock.",
        "key_themes":       [],
        "top_headline":     None,
        "risk_flags":       [],
        "catalysts":        [],
        "headlines":        [],
        "headline_count":   0,
        "analysed_at":      datetime.now().isoformat(),
        "from_cache":       False,
    }