from nsetools import Nse as NseTools
import yfinance as yf
import pandas as pd
import requests
import io
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

UNIVERSE = NIFTY50


# ── Live quote ────────────────────────────────────────────────────────────────

def fetch_live_quote(symbol: str) -> dict:
    try:
        quote = _nse_client.get_quote(symbol.lower())
        if not quote:
            raise ValueError("Empty response")

        last_price  = quote.get("lastPrice")    or quote.get("ltp", 0)
        prev_close  = quote.get("previousClose") or quote.get("closePrice", 0)
        change      = quote.get("netPrice")     or quote.get("change", 0)
        change_pct  = quote.get("pChange")      or quote.get("pChange", 0)
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
    results = {}
    for i, symbol in enumerate(NIFTY50):
        results[symbol] = fetch_live_quote(symbol)
        if i % 10 == 9:
            time.sleep(1)
    return results


def fetch_top_gainers_losers() -> dict:
    try:
        gainers = _nse_client.get_top_gainers() or []
        losers  = _nse_client.get_top_losers()  or []
        return {
            "gainers":    gainers[:5],
            "losers":     losers[:5],
            "updated_at": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"Gainers/losers fetch failed: {e}")
        return {"gainers": [], "losers": [], "error": str(e)}


def fetch_nifty_index_quote() -> dict:
    try:
        quote = _nse_client.get_index_quote("NIFTY 50")
        return {
            "index":      "NIFTY 50",
            "last":       round(quote.get("last", 0), 2),
            "change":     round(quote.get("variation", 0), 2),
            "change_pct": round(quote.get("percentChange", 0), 2),
            "advances":   quote.get("advances", 0),
            "declines":   quote.get("declines", 0),
            "year_high":  quote.get("yearHigh", 0),
            "year_low":   quote.get("yearLow", 0),
            "is_live":    True,
            "updated_at": datetime.now().isoformat(),
        }
    except Exception as e:
        print(f"Nifty index quote failed: {e} — trying yfinance")
        return _fetch_nifty_yfinance_fallback()


def _fetch_nifty_yfinance_fallback() -> dict:
    try:
        ticker = yf.Ticker("^NSEI")
        info   = ticker.fast_info
        prev   = info.previous_close or 1
        last   = info.last_price
        change_pct = round((last - prev) / prev * 100, 2)
        return {
            "index":      "NIFTY 50",
            "last":       round(last, 2),
            "change":     round(last - prev, 2),
            "change_pct": change_pct,
            "is_live":    False,
            "updated_at": datetime.now().isoformat(),
        }
    except Exception as e:
        return {"index": "NIFTY 50", "error": str(e)}


# ── OHLC data ─────────────────────────────────────────────────────────────────

def fetch_ohlc(symbol: str, period: str = "1y") -> pd.DataFrame:
    """Fetch OHLC data for a single symbol via yfinance."""
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
    """Fetch OHLC for a list of symbols sequentially."""
    results = {}
    for symbol in symbols:
        df = fetch_ohlc(symbol, period)
        if not df.empty:
            results[symbol] = df
    return results


def fetch_ohlc_batch(symbols: list, period: str = "1y") -> dict:
    """
    Batch-fetch OHLC using yfinance group download for speed.
    Falls back to sequential fetch if batch fails.
    Used by the Full Universe (All NSE) scan path.
    """
    try:
        tickers_str = " ".join(f"{s}.NS" for s in symbols)
        raw = yf.download(
            tickers_str,
            period=period,
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
        results = {}
        for symbol in symbols:
            ticker_key = f"{symbol}.NS"
            try:
                if isinstance(raw.columns, pd.MultiIndex):
                    df = raw[ticker_key].dropna()
                else:
                    df = raw.dropna()
                if not df.empty and len(df) >= 10:
                    df.index = pd.to_datetime(df.index).tz_localize(None)
                    results[symbol] = df
            except (KeyError, Exception):
                continue
        if results:
            return results
    except Exception as e:
        print(f"Batch OHLC download failed: {e} — falling back to sequential")

    # Fallback to sequential
    return fetch_all_ohlc(symbols, period)


def fetch_stock_info(symbol: str) -> dict:
    """Fetch fundamental info from yfinance."""
    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        info = ticker.info
        return {
            "symbol":         symbol,
            "name":           info.get("longName", symbol),
            "sector":         info.get("sector", "—"),
            "industry":       info.get("industry", "—"),
            "market_cap":     info.get("marketCap", 0),
            "pe_ratio":       info.get("trailingPE", 0),
            "pb_ratio":       info.get("priceToBook", 0),
            "dividend_yield": info.get("dividendYield", 0),
            "week52_high":    info.get("fiftyTwoWeekHigh", 0),
            "week52_low":     info.get("fiftyTwoWeekLow", 0),
            "avg_volume":     info.get("averageVolume", 0),
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e)}


# ── Bulk Deals ────────────────────────────────────────────────────────────────

_NSE_BULK_DEALS_URL = "https://archives.nseindia.com/archives/equities/bns/NSE_BULKDEAL.csv"
_BULK_DEALS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": "https://www.nseindia.com",
}


def fetch_bulk_deals() -> pd.DataFrame:
    """
    Fetch today's NSE bulk deals from the public CSV archive.
    Returns a DataFrame with columns: symbol, clientName, dealType, quantity, price.
    Falls back to empty DataFrame gracefully if NSE blocks the request.
    """
    try:
        resp = requests.get(
            _NSE_BULK_DEALS_URL,
            headers=_BULK_DEALS_HEADERS,
            timeout=10,
        )
        if resp.status_code != 200:
            raise ValueError(f"HTTP {resp.status_code}")

        df = pd.read_csv(io.StringIO(resp.text))
        # Normalise column names — NSE CSV has inconsistent spacing
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

        # Map to canonical column names used by scorer.py
        col_map = {
            "symbol":         "symbol",
            "client_name":    "clientName",
            "deal_type":      "dealType",
            "quantity":       "quantity",
            "trade_price_/_wt._avg._price": "price",
        }
        # Only rename columns that exist
        df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

        # Ensure symbol is upper-cased
        if "symbol" in df.columns:
            df["symbol"] = df["symbol"].str.strip().str.upper()

        print(f"Bulk deals loaded: {len(df)} deals")
        return df

    except Exception as e:
        print(f"fetch_bulk_deals failed ({e}) — signals will run without bulk deal data")
        return pd.DataFrame()


# ── Nifty 500 ────────────────────────────────────────────────────────────────

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