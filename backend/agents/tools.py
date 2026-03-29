DATA_AGENT_TOOLS = [
    {
        "name": "fetch_stock_ohlc",
        "description": (
            "Fetches historical OHLC price data for a list of NSE stock symbols. "
            "Use this first to get price history before any pattern detection. "
            "Returns data freshness — if stale, refetch automatically."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbols": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of NSE symbols e.g. ['RELIANCE', 'TCS']"
                },
                "period": {
                    "type": "string",
                    "enum": ["1mo", "3mo", "6mo", "1y", "2y"],
                    "description": "How far back to fetch. Use 2y for back-testing."
                }
            },
            "required": ["symbols"]
        }
    },
    {
        "name": "fetch_bulk_deals",
        "description": (
            "Fetches today's bulk and block deals from NSE. "
            "Returns buyer/seller identity, quantity, and price. "
            "FII buying is a strong positive signal."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "filter_symbol": {
                    "type": "string",
                    "description": "Optional: filter deals to a specific symbol."
                }
            }
        }
    },
    {
        "name": "fetch_news_headlines",
        "description": (
            "Fetches recent Google News headlines for a stock. "
            "Call this when a stock has strong price/deal signals "
            "and you need to verify sentiment before escalating."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "NSE symbol to fetch news for."
                },
                "max_articles": {
                    "type": "integer",
                    "description": "Max headlines to fetch. Default 8.",
                    "default": 8
                }
            },
            "required": ["symbol"]
        }
    }
]

SIGNAL_AGENT_TOOLS = [
    {
        "name": "detect_patterns",
        "description": (
            "Detects chart patterns for a stock using OHLC data. "
            "Returns: pattern name, date detected, confidence score, description. "
            "Call this for every stock in the universe before scoring."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "NSE symbol to detect patterns for."
                }
            },
            "required": ["symbol"]
        }
    },
    {
        "name": "run_backtest",
        "description": (
            "Runs historical back-test for a specific pattern on a stock. "
            "Returns win rate, average return, and sample size. "
            "IMPORTANT: Only call this for stocks that already have "
            "a detected pattern — do not call for every stock."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbol":       {"type": "string"},
                "pattern_name": {"type": "string",
                                 "description": "Exact pattern name from detect_patterns output."}
            },
            "required": ["symbol", "pattern_name"]
        }
    },
    {
        "name": "score_stock_signals",
        "description": (
            "Computes the final convergence score for a stock. "
            "Combines event signals, pattern signals, and portfolio context. "
            "Call this after detect_patterns and fetch_bulk_deals for a stock."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbol":    {"type": "string"},
                "portfolio": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "User's held symbols for portfolio multiplier."
                }
            },
            "required": ["symbol"]
        }
    }
]

INSIGHT_AGENT_TOOLS = [
    {
        "name": "generate_alert_card",
        "description": (
            "Generates a plain-English alert card for a signal. "
            "Call this for every stock in the Act and Watch buckets. "
            "Returns a 100-word investor-friendly explanation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbol":  {"type": "string"},
                "score":   {"type": "number"},
                "signals": {"type": "array",
                            "description": "List of triggered signals with evidence."},
                "patterns": {"type": "array",
                             "description": "Detected chart patterns."}
            },
            "required": ["symbol", "score", "signals"]
        }
    },
    {
        "name": "analyse_sentiment",
        "description": (
            "Analyses news headlines for a stock and returns structured sentiment. "
            "Call this for Act bucket stocks to enrich their alert cards. "
            "Returns score, label, summary, catalysts, risk flags."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbol":    {"type": "string"},
                "headlines": {"type": "array",
                              "description": "Headlines from fetch_news_headlines."}
            },
            "required": ["symbol", "headlines"]
        }
    },
    {
        "name": "generate_portfolio_brief",
        "description": (
            "Generates a personalised portfolio brief answering: "
            "'Given my holdings, what are my top 3 focus stocks today?' "
            "Call this once after all signals are scored."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "portfolio": {"type": "array", "items": {"type": "string"}},
                "top_signals": {"type": "array",
                                "description": "Top scored signals from Signal Agent."}
            },
            "required": ["portfolio", "top_signals"]
        }
    }
]