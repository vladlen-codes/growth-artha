import json
from datetime import datetime
from backend.data.fetcher import (
    fetch_ohlc, fetch_all_ohlc, fetch_bulk_deals as _fetch_bulk_deals
)
from backend.patterns.detector import detect_patterns
from backend.patterns.backtester import backtest_pattern
from backend.signals.scorer import score_all_signals, get_signal_for_symbol
from backend.signals.sentiment import (
    fetch_news_headlines as _fetch_headlines,
    analyse_sentiment as _analyse_sentiment,
)

class ToolExecutor:
    def __init__(self):
        self.audit_log: list = []
        self._ohlc_cache: dict = {}
        self._deals_cache = None
        self._patterns_cache: dict = {}

    def execute(self, tool_name: str, tool_args: dict) -> dict:
        start = datetime.now()

        try:
            result = self._dispatch(tool_name, tool_args)
            status = "success"
            error  = None
        except Exception as e:
            result = {"error": str(e)}
            status = "error"
            error  = str(e)

        elapsed = (datetime.now() - start).total_seconds()

        self.audit_log.append({
            "timestamp":  datetime.now().isoformat(),
            "tool":       tool_name,
            "args":       tool_args,
            "status":     status,
            "elapsed_ms": round(elapsed * 1000),
            "error":      error,
            "result_summary": self._summarise(tool_name, result)
        })
        return result

    def _dispatch(self, tool_name: str, args: dict) -> dict:
        if tool_name == "fetch_stock_ohlc":
            symbols = args.get("symbols", [])
            period  = args.get("period", "2y")
            data = {}
            for sym in symbols:
                df = fetch_ohlc(sym, period=period)
                if not df.empty:
                    data[sym] = {
                        "rows":        len(df),
                        "last_date":   str(df.index[-1].date()),
                        "last_close":  round(df["Close"].iloc[-1], 2),
                        "fresh":       True
                    }
                    self._ohlc_cache[sym] = df
            return {"fetched": len(data), "symbols": data}

        if tool_name == "fetch_bulk_deals":
            filter_sym = args.get("filter_symbol")
            df = _fetch_bulk_deals()
            self._deals_cache = df
            if filter_sym and not df.empty:
                df = df[df["symbol"].str.upper() == filter_sym.upper()]
            records = df.to_dict("records") if not df.empty else []
            return {"count": len(records), "deals": records[:20]}

        if tool_name == "fetch_news_headlines":
            symbol = args["symbol"]
            max_a  = args.get("max_articles", 8)
            headlines = _fetch_headlines(symbol, max_articles=max_a)
            return {"symbol": symbol, "count": len(headlines),
                    "headlines": headlines}

        if tool_name == "detect_patterns":
            symbol = args["symbol"]
            df = self._ohlc_cache.get(symbol)
            if df is None:
                df = fetch_ohlc(symbol)
                self._ohlc_cache[symbol] = df
            patterns = detect_patterns(symbol, df) if not df.empty else []
            self._patterns_cache[symbol] = patterns
            return {"symbol": symbol, "patterns": patterns,
                    "count": len(patterns)}

        if tool_name == "run_backtest":
            symbol  = args["symbol"]
            pattern = args["pattern_name"]
            result  = backtest_pattern(symbol, pattern)
            return result

        if tool_name == "score_stock_signals":
            symbol    = args["symbol"]
            portfolio = args.get("portfolio", [])
            df        = self._ohlc_cache.get(symbol)
            if df is None:
                df = fetch_ohlc(symbol)
                self._ohlc_cache[symbol] = df
            deals    = self._deals_cache if self._deals_cache is not None \
                       else _fetch_bulk_deals()
            patterns = {symbol: self._patterns_cache.get(symbol, [])}
            signals  = score_all_signals(
                ohlc_data={symbol: df},
                bulk_deals=deals,
                patterns=patterns,
                portfolio=portfolio
            )
            return signals[0] if signals else {"symbol": symbol, "score": 0}

        if tool_name == "generate_alert_card":
            from backend.ai.gemini_client import generate_signal_card
            card = generate_signal_card(args)
            return {"symbol": args["symbol"], "card": card}

        if tool_name == "analyse_sentiment":
            symbol    = args["symbol"]
            headlines = args.get("headlines", [])
            result    = _analyse_sentiment(symbol, headlines)
            return result

        if tool_name == "generate_portfolio_brief":
            from backend.ai.gemini_client import generate_portfolio_summary
            brief = generate_portfolio_summary(
                args.get("portfolio", []),
                args.get("top_signals", [])
            )
            return {"brief": brief}

        raise ValueError(f"Unknown tool: {tool_name}")

    def _summarise(self, tool_name: str, result: dict) -> str:
        if "error" in result:
            return f"ERROR: {result['error']}"
        summaries = {
            "fetch_stock_ohlc":      lambda r: f"Fetched {r['fetched']} stocks",
            "fetch_bulk_deals":      lambda r: f"Found {r['count']} deals",
            "fetch_news_headlines":  lambda r: f"Got {r['count']} headlines for {r['symbol']}",
            "detect_patterns":       lambda r: f"{r['count']} patterns on {r['symbol']}",
            "run_backtest":          lambda r: f"Win rate {r.get('win_rate_pct')}% ({r.get('instances')} instances)",
            "score_stock_signals":   lambda r: f"Score {r.get('score', 0):+.3f} for {r.get('symbol')}",
            "generate_alert_card":   lambda r: f"Card generated for {r.get('symbol')}",
            "analyse_sentiment":     lambda r: f"Sentiment {r.get('sentiment_label')} ({r.get('sentiment_score')})",
            "generate_portfolio_brief": lambda r: "Portfolio brief generated",
        }
        fn = summaries.get(tool_name)
        return fn(result) if fn else "OK"