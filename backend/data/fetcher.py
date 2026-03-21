import yfinance as yf
import pandas as pd
import requests
import json
import time
import os
from datetime import datetime, timedelta
from pathlib import Path

CACHE_DIR = Path("data/cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Nifty 50 symbols — yfinance format (append .NS)
NIFTY50 = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
    "HINDUNILVR", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK",
    "LT", "AXISBANK", "ASIANPAINT", "MARUTI", "SUNPHARMA",
    "TITAN", "BAJFINANCE", "WIPRO", "HCLTECH", "ULTRACEMCO",
    "NESTLEIND", "TECHM", "POWERGRID", "NTPC", "TATAMOTORS",
    "ONGC", "JSWSTEEL", "TATASTEEL", "ADANIENT", "ADANIPORTS",
    "BAJAJFINSV", "COALINDIA", "BRITANNIA", "DRREDDY", "DIVISLAB",
    "CIPLA", "EICHERMOT", "HEROMOTOCO", "HINDALCO", "INDUSINDBK",
    "MM", "SBILIFE", "HDFCLIFE", "BPCL", "GRASIM",
    "TATACONSUM", "APOLLOHOSP", "BAJAJ-AUTO", "UPL", "SHRIRAMFIN"
]


def fetch_ohlc(symbol: str, period: str = "2y") -> pd.DataFrame:
    cache_file = CACHE_DIR / f"{symbol}_ohlc.parquet"

    if cache_file.exists():
        age = datetime.now().timestamp() - cache_file.stat().st_mtime
        if age < 86400:  # 24 hours
            return pd.read_parquet(cache_file)

    ticker = yf.Ticker(f"{symbol}.NS")
    df = ticker.history(period=period)

    if df.empty:
        print(f"  Warning: No data for {symbol}")
        return pd.DataFrame()

    df.index = pd.to_datetime(df.index).tz_localize(None)
    df.to_parquet(cache_file)
    print(f"  Fetched {symbol}: {len(df)} rows")
    time.sleep(0.3)  # rate limit
    return df


def fetch_all_ohlc(symbols: list = None) -> dict:
    symbols = symbols or NIFTY50
    data = {}
    print(f"Fetching OHLC for {len(symbols)} stocks...")
    for sym in symbols:
        df = fetch_ohlc(sym)
        if not df.empty:
            data[sym] = df
    print(f"Done. Got data for {len(data)}/{len(symbols)} stocks.")
    return data


def fetch_bulk_deals() -> pd.DataFrame:
    cache_file = CACHE_DIR / "bulk_deals.json"
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Referer": "https://www.nseindia.com/"
    }

    try:
        session = requests.Session()
        # NSE requires a session cookie — get it first
        session.get("https://www.nseindia.com", headers=headers, timeout=10)
        time.sleep(1)

        url = "https://www.nseindia.com/api/snapshot-capital-market-largedeal"
        resp = session.get(url, headers=headers, timeout=10)
        resp.raise_for_status()

        deals = resp.json()
        with open(cache_file, "w") as f:
            json.dump(deals, f)

        df = pd.DataFrame(deals.get("data", []))
        print(f"Fetched {len(df)} bulk/block deals from NSE")
        return df

    except Exception as e:
        print(f"NSE fetch failed ({e}), using cache or mock data")
        if cache_file.exists():
            with open(cache_file) as f:
                deals = json.load(f)
            return pd.DataFrame(deals.get("data", []))
        return _mock_bulk_deals()


def _mock_bulk_deals() -> pd.DataFrame:
    return pd.DataFrame([
        {
            "symbol": "RELIANCE",
            "clientName": "Government of Singapore",
            "dealType": "BUY",
            "quantity": 2500000,
            "price": 2847.50,
            "remarks": "Bulk Deal"
        },
        {
            "symbol": "INFY",
            "clientName": "Vanguard Emerging Markets",
            "dealType": "BUY",
            "quantity": 1800000,
            "price": 1654.20,
            "remarks": "Block Deal"
        },
        {
            "symbol": "TATAMOTORS",
            "clientName": "HDFC Mutual Fund",
            "dealType": "SELL",
            "quantity": 3200000,
            "price": 987.30,
            "remarks": "Bulk Deal"
        },
    ])


def fetch_stock_info(symbol: str) -> dict:
    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        info = ticker.info
        return {
            "symbol": symbol,
            "name": info.get("longName", symbol),
            "sector": info.get("sector", "Unknown"),
            "pe_ratio": info.get("trailingPE"),
            "market_cap": info.get("marketCap"),
            "week52_high": info.get("fiftyTwoWeekHigh"),
            "week52_low": info.get("fiftyTwoWeekLow"),
            "avg_volume": info.get("averageVolume"),
        }
    except Exception as e:
        print(f"Info fetch failed for {symbol}: {e}")
        return {"symbol": symbol, "name": symbol}


if __name__ == "__main__":
    # Run this directly to pre-warm the cache before the hackathon
    print("=== Pre-warming data cache ===")
    fetch_all_ohlc(NIFTY50[:10])   # start with 10 to test
    fetch_bulk_deals()
    print("Cache ready.")