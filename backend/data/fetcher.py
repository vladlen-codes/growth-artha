from nsetools import Nse as NseTools
import yfinance as yf
import pandas as pd
from datetime import datetime
import time
import os
from pathlib import Path

_nse_client = NseTools()

# Nifty 50 hardcoded list — demo default
NIFTY50 = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
    "HINDUNILVR", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK",
    "LT", "AXISBANK", "MARUTI", "SUNPHARMA", "TITAN",
    "BAJFINANCE", "WIPRO", "HCLTECH", "ULTRACEMCO", "NESTLEIND",
    "TECHM", "POWERGRID", "NTPC", "TATAMOTORS", "ONGC",
    "JSWSTEEL", "TATASTEEL", "ADANIENT", "ADANIPORTS", "DRREDDY",
    "DIVISLAB", "CIPLA", "EICHERMOT", "HEROMOTOCO", "HINDALCO",
    "INDUSINDBK", "MM", "SBILIFE", "HDFCLIFE", "BPCL",
    "GRASIM", "TATACONSUM", "APOLLOHOSP", "BAJAJ-AUTO", "UPL",
    "SHRIRAMFIN", "COALINDIA", "BRITANNIA", "ASIANPAINT"
]


def get_nifty500_symbols() -> list:
    """
    Fetches live Nifty 500 constituent list from NSE.
    Falls back to Nifty 50 if fetch fails.
    """
    try:
        stocks = _nse_client.get_stocks_in_index("NIFTY 500")
        if stocks and len(stocks) > 50:
            print(f"Nifty 500 loaded: {len(stocks)} stocks")
            return stocks
    except Exception as e:
        print(f"Nifty 500 fetch failed: {e} — using Nifty 50")
    return NIFTY50


# Keep NIFTY50 as the demo default
# Switch to get_nifty500_symbols() for production
UNIVERSE = NIFTY50   # change to get_nifty500_symbols() when ready


def fetch_live_quote(symbol: str) -> dict:
    try:
        quote = _nse_client.get_quote(symbol.lower())
        if not quote:
            raise ValueError("Empty response")

        last_price  = quote.get("lastPrice")   or quote.get("ltp", 0)
        prev_close  = quote.get("previousClose") or quote.get("closePrice", 0)
        change      = quote.get("netPrice")    or quote.get("change", 0)
        change_pct  = quote.get("pChange")     or quote.get("pChange", 0)
        volume      = quote.get("totalTradedVolume", 0)
        day_high    = quote.get("dayHigh",   0)
        day_low     = quote.get("dayLow",    0)
        week52_high = quote.get("high52",    0)
        week52_low  = quote.get("low52",     0)

        return {
            "symbol":       symbol.upper(),
            "last_price":   round(float(last_price),  2),
            "prev_close":   round(float(prev_close),  2),
            "change":       round(float(change),      2),
            "change_pct":   round(float(change_pct),  2),
            "day_high":     round(float(day_high),    2),
            "day_low":      round(float(day_low),     2),
            "week52_high":  round(float(week52_high), 2),
            "week52_low":   round(float(week52_low),  2),
            "volume":       int(volume),
            "source":       "nsetools-live",
            "is_live":      True,
            "updated_at":   datetime.now().isoformat(),
        }

    except Exception as e:
        print(f"nsetools failed for {symbol}: {e} — falling back to yfinance")
        return _fetch_live_quote_fallback(symbol)


def _fetch_live_quote_fallback(symbol: str) -> dict:
    """yfinance fallback — 15-min delayed but always works."""
    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        info   = ticker.fast_info
        return {
            "symbol":     symbol.upper(),
            "last_price": round(info.last_price, 2),
            "prev_close": round(info.previous_close, 2),
            "change":     round(info.last_price - info.previous_close, 2),
            "change_pct": round((info.last_price - info.previous_close)
                                / info.previous_close * 100, 2),
            "source":     "yfinance-delayed",
            "is_live":    False,
            "updated_at": datetime.now().isoformat(),
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e), "is_live": False}


def fetch_nifty50_live_quotes() -> dict:
    """
    Fetches live quotes for all Nifty 50 stocks in one batch.
    Used to enrich the radar output with live prices.
    Rate-limited to avoid NSE blocking.
    """
    results = {}
    for i, symbol in enumerate(NIFTY50):
        results[symbol] = fetch_live_quote(symbol)
        if i % 10 == 9:
            time.sleep(1)   # pause every 10 requests
    return results


def fetch_top_gainers_losers() -> dict:
    """
    Gets live top gainers and losers from NSE.
    ET Markets shows this — now Growth Artha shows it too, with signal context.
    """
    try:
        gainers = _nse_client.get_top_gainers() or []
        losers  = _nse_client.get_top_losers()  or []
        return {
            "gainers": gainers[:5],
            "losers":  losers[:5],
            "updated_at": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"Gainers/losers fetch failed: {e}")
        return {"gainers": [], "losers": [], "error": str(e)}


def fetch_nifty_index_quote() -> dict:
    """
    Gets live Nifty 50 index quote.
    Shows alongside the radar for market context.
    """
    try:
        quote = _nse_client.get_index_quote("NIFTY 50")
        return {
            "index":         "NIFTY 50",
            "last":          round(quote.get("last", 0), 2),
            "change":        round(quote.get("variation", 0), 2),
            "change_pct":    round(quote.get("percentChange", 0), 2),
            "advances":      quote.get("advances", 0),
            "declines":      quote.get("declines", 0),
            "year_high":     quote.get("yearHigh", 0),
            "year_low":      quote.get("yearLow", 0),
            "is_live":       True,
            "updated_at":    datetime.now().isoformat(),
        }
    except Exception as e:
        return {"index": "NIFTY 50", "error": str(e)}


# ── OHLC data functions ────────────────────────────────────────────────────

def fetch_ohlc(symbol: str, period: str = "1y") -> pd.DataFrame:
    """Fetch OHLC data for a single symbol."""
    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        df = ticker.history(period=period)
        if df.empty or len(df) < 10:
            return pd.DataFrame()
        df.index = pd.to_datetime(df.index).tz_localize(None)
        return df
    except Exception as e:
        print(f"fetch_ohlc failed for {symbol}: {e}")
        return pd.DataFrame()


def fetch_all_ohlc(symbols: list, period: str = "1y") -> dict:
    """Fetch OHLC data for multiple symbols."""
    results = {}
    for symbol in symbols:
        df = fetch_ohlc(symbol, period)
        if not df.empty:
            results[symbol] = df
    return results


def fetch_stock_info(symbol: str) -> dict:
    """Fetch basic stock info from yfinance."""
    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        info = ticker.info
        return {
            "symbol": symbol,
            "name": info.get("longName", symbol),
            "sector": info.get("sector", "—"),
            "market_cap": info.get("marketCap", 0),
            "pe_ratio": info.get("trailingPE", 0),
            "dividend_yield": info.get("dividendYield", 0),
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e)}


def fetch_bulk_deals() -> pd.DataFrame:
    """Fetch today's bulk deals from NSE."""
    try:
        # This would typically fetch from NSE API or cache
        # For now, return empty dataframe
        return pd.DataFrame()
    except Exception as e:
        print(f"fetch_bulk_deals failed: {e}")
        return pd.DataFrame()