import feedparser
import re
import time
import json
from pathlib import Path
from datetime import datetime, timedelta
import backend.ai.gemini_client as _gemini
import yfinance as yf

CACHE_DIR = Path("data/cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

POSITIVE_KEYWORDS = {
    "beat", "beats", "growth", "surge", "record", "up", "upgrade", "rally",
    "profit", "profits", "strong", "wins", "order", "approval", "expansion",
    "partnership", "outperform", "buy", "bullish", "dividend", "gain", "gains",
}

NEGATIVE_KEYWORDS = {
    "miss", "misses", "fall", "falls", "drop", "drops", "down", "downgrade",
    "loss", "losses", "weak", "probe", "fraud", "penalty", "lawsuit", "delay",
    "cut", "cuts", "bearish", "risk", "debt", "default", "slump", "decline",
}

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

        if headlines:
            return headlines[:max_articles]

        # Fallback source: Yahoo Finance news for the ticker.
        ticker = yf.Ticker(f"{symbol.upper()}.NS")
        yahoo_news = ticker.news or []
        for item in yahoo_news[:max_articles]:
            title = item.get("title") or ""
            if not title:
                continue
            provider = item.get("publisher") or "Yahoo Finance"
            url = item.get("link") or ""
            published_ts = item.get("providerPublishTime")
            published = ""
            if isinstance(published_ts, (int, float)):
                published = datetime.fromtimestamp(published_ts).isoformat()

            headlines.append({
                "title": title,
                "source": provider,
                "published": published,
                "url": url,
            })

        return headlines[:max_articles]

    except Exception as e:
        print(f"News fetch failed for {symbol}: {e}")
        return []

def analyse_sentiment(symbol: str, headlines: list[dict]) -> dict:
    if not headlines:
        return _no_coverage_sentiment(symbol)

    _model = _gemini._model
    if not _model:
        return _rule_based_sentiment(symbol, headlines)

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
        raw_response = _gemini._generate_with_retry(prompt)
        # Strip markdown code fences if Gemini wraps in ```json
        raw = raw_response.strip()
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
        return _rule_based_sentiment(symbol, headlines)
    except Exception as e:
        print(f"Sentiment analysis failed for {symbol}: {e}")
        return _rule_based_sentiment(symbol, headlines)

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


def _no_coverage_sentiment(symbol: str) -> dict:
    return {
        "symbol": symbol,
        "company": SYMBOL_TO_NAME.get(symbol, symbol),
        "sentiment_score": 0.0,
        "sentiment_label": "Neutral",
        "summary": "No recent qualifying headlines were found for this symbol right now. Sentiment is marked neutral until fresh coverage appears.",
        "key_themes": ["No Recent Coverage"],
        "top_headline": None,
        "risk_flags": [],
        "catalysts": [],
        "headlines": [],
        "headline_count": 0,
        "analysed_at": datetime.now().isoformat(),
        "from_cache": False,
        "analysis_mode": "no_headlines_neutral",
    }


def _rule_based_sentiment(symbol: str, headlines: list[dict]) -> dict:
    texts = [f"{h.get('title', '')} {h.get('source', '')}".lower() for h in headlines]

    pos_hits = 0
    neg_hits = 0
    theme_counter: dict[str, int] = {}
    catalysts: list[str] = []
    risks: list[str] = []

    for t in texts:
        words = set(re.findall(r"[a-z]{3,}", t))
        pos = words.intersection(POSITIVE_KEYWORDS)
        neg = words.intersection(NEGATIVE_KEYWORDS)

        pos_hits += len(pos)
        neg_hits += len(neg)

        if "earnings" in words or "results" in words:
            theme_counter["Earnings"] = theme_counter.get("Earnings", 0) + 1
        if "order" in words or "contract" in words:
            theme_counter["Orders"] = theme_counter.get("Orders", 0) + 1
        if "regulator" in words or "approval" in words:
            theme_counter["Regulatory"] = theme_counter.get("Regulatory", 0) + 1
        if "debt" in words or "funding" in words:
            theme_counter["Balance Sheet"] = theme_counter.get("Balance Sheet", 0) + 1

        if pos and len(catalysts) < 3:
            catalysts.append(f"Headline momentum: {', '.join(sorted(pos)[:2])}")
        if neg and len(risks) < 3:
            risks.append(f"Headline risk: {', '.join(sorted(neg)[:2])}")

    total_hits = pos_hits + neg_hits
    raw_score = 0.0 if total_hits == 0 else (pos_hits - neg_hits) / max(total_hits, 1)
    score = round(max(-1.0, min(1.0, raw_score)), 2)

    if score >= 0.6:
        label = "Strongly Positive"
    elif score >= 0.2:
        label = "Positive"
    elif score <= -0.6:
        label = "Strongly Negative"
    elif score <= -0.2:
        label = "Negative"
    else:
        label = "Neutral"

    sorted_themes = sorted(theme_counter.items(), key=lambda kv: kv[1], reverse=True)
    key_themes = [k for k, _ in sorted_themes[:3]]
    if not key_themes:
        key_themes = ["General News"]

    top_headline = headlines[0].get("title") if headlines else None
    summary = (
        f"Automated sentiment fallback based on recent headlines indicates {label.lower()} tone "
        f"for {SYMBOL_TO_NAME.get(symbol, symbol)}. Review headline-level context before making decisions."
    )

    return {
        "symbol": symbol,
        "company": SYMBOL_TO_NAME.get(symbol, symbol),
        "sentiment_score": score,
        "sentiment_label": label,
        "summary": summary,
        "key_themes": key_themes,
        "top_headline": top_headline,
        "risk_flags": risks,
        "catalysts": catalysts,
        "headlines": headlines,
        "headline_count": len(headlines),
        "analysed_at": datetime.now().isoformat(),
        "from_cache": False,
        "analysis_mode": "rule_based_fallback",
    }