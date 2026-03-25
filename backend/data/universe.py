"""
Stock universe manager.
Handles the full NSE equity list with intelligent tiering.
"""
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
import time
import yfinance as yf

# ── Universe tiers ────────────────────────────────────────────────────────────
TIER_1_NIFTY50 = [
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

TIER_2_NIFTY500_EXTRA = [
    # Mid and small caps beyond Nifty 50
    "PIDILITIND", "BERGEPAINT", "HAVELLS", "VOLTAS", "WHIRLPOOL",
    "PAGEIND", "MUTHOOTFIN", "CHOLAFIN", "LICHSGFIN", "SRTRANSFIN",
    "PERSISTENT", "COFORGE", "LTTS", "KPITTECH", "TANLA",
    "LALPATHLAB", "METROPOLIS", "THYROCARE", "Abbott", "PFIZER",
    "TORNTPHARM", "ALKEM", "IPCALAB", "GLENMARK", "NATCOPHARM",
    "TATAELXSI", "MPHASIS", "HEXAWARE", "MASTEK", "NIITTECH",
    "JINDALSTEL", "SAIL", "NMDC", "HINDZINC", "NATIONALUM",
    "CESC", "TATAPOWER", "ADANIGREEN", "ADANITRANS", "TORNTPOWER",
    "INDIGO", "SPICEJET", "IRCTC", "CONCOR", "MAHLOG",
    "DMART", "TRENT", "VSTIND", "COLPAL", "MARICO",
    "DABUR", "EMAMILTD", "GODREJCP", "JYOTHYLAB", "GILLETTE",
]


def load_full_nse_universe() -> list:
    """
    Loads the complete NSE equity symbol list from local CSV.
    Falls back to Nifty 500 if CSV not found.
    """
    csv_path = Path("data/nse_all_symbols.csv")

    if csv_path.exists():
        symbols = pd.read_csv(csv_path, header=None)[0].tolist()
        # Filter out obvious non-equity symbols
        symbols = [s for s in symbols if isinstance(s, str)
                   and len(s) >= 2 and len(s) <= 20
                   and s.isalpha() or "-" in s]
        print(f"Loaded {len(symbols)} NSE symbols from CSV")
        return symbols

    print("EQUITY_L.csv not found — using Nifty 500 subset")
    return TIER_1_NIFTY50 + TIER_2_NIFTY500_EXTRA


def tier1_filter(ohlc_data: dict, min_volume: int = 100000) -> list:
    """
    Fast pre-screening filter — eliminates illiquid and inactive stocks.
    Runs in seconds. Keeps only stocks worth deeper analysis.

    Criteria:
    - Average daily volume > 100,000 (liquid enough to trade)
    - Has traded in last 5 days (not suspended)
    - 52-week price range > 10% (not flatlined)
    """
    qualified = []

    for symbol, df in ohlc_data.items():
        if df.empty or len(df) < 20:
            continue

        avg_vol = df["Volume"].tail(20).mean()
        if avg_vol < min_volume:
            continue

        last_date = df.index[-1]
        days_since = (datetime.now() - last_date.to_pydatetime()).days
        if days_since > 7:
            continue

        year_high = df["Close"].tail(252).max()
        year_low  = df["Close"].tail(252).min()
        if year_high <= 0 or (year_high - year_low) / year_high < 0.10:
            continue

        qualified.append(symbol)

    return qualified


def momentum_prefilter(ohlc_data: dict, top_n: int = 300) -> list:
    """
    Ranks all stocks by a simple momentum score to find the most
    interesting candidates for deep pattern analysis.

    Momentum score = combination of:
    - 1-month return
    - 3-month return
    - Volume ratio (recent vs average)
    - Distance from 52-week high/low

    Returns top N stocks by absolute momentum score.
    This is how we get from 2700 stocks to 300 candidates.
    """
    scores = []

    for symbol, df in ohlc_data.items():
        if df.empty or len(df) < 63:
            continue

        close  = df["Close"]
        volume = df["Volume"]

        # Returns
        ret_1m = (close.iloc[-1] - close.iloc[-21]) / close.iloc[-21] if len(close) >= 21 else 0
        ret_3m = (close.iloc[-1] - close.iloc[-63]) / close.iloc[-63] if len(close) >= 63 else 0

        # Volume ratio
        avg_vol_20 = volume.tail(20).mean()
        vol_ratio  = volume.iloc[-1] / avg_vol_20 if avg_vol_20 > 0 else 1

        # Distance from 52-week high (negative = near high)
        year_high = close.tail(252).max()
        dist_from_high = (close.iloc[-1] - year_high) / year_high

        # Distance from 52-week low (positive = recovered)
        year_low = close.tail(252).min()
        dist_from_low = (close.iloc[-1] - year_low) / year_low if year_low > 0 else 0

        # Composite momentum score (absolute — we want both big movers up AND down)
        score = (abs(ret_1m) * 0.3 +
                 abs(ret_3m) * 0.3 +
                 min(vol_ratio - 1, 3) * 0.2 +
                 abs(dist_from_high) * 0.1 +
                 dist_from_low * 0.1)

        scores.append((symbol, round(score, 4)))

    scores.sort(key=lambda x: x[1], reverse=True)
    return [s[0] for s in scores[:top_n]]


# ── OHLC data fetching with caching ──────────────────────────────────────────

CACHE_DIR = Path("data/cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def fetch_ohlc_batch(symbols: list, period: str = "1y",
                     max_workers: int = 10) -> dict:
    """
    Fetches OHLC for a large list of symbols efficiently.

    Strategy:
    - Uses yfinance batch download (much faster than one-by-one)
    - Caches each symbol separately
    - Skips symbols with fresh cache (< 24h old)
    - Returns whatever it can get — never crashes on missing data
    """
    # Split into stale (need fetch) vs fresh (use cache)
    to_fetch = []
    results  = {}

    for sym in symbols:
        cache_file = CACHE_DIR / f"{sym}_ohlc.parquet"
        if cache_file.exists():
            age = datetime.now().timestamp() - cache_file.stat().st_mtime
            if age < 86400:   # 24 hours
                try:
                    results[sym] = pd.read_parquet(cache_file)
                    continue
                except Exception:
                    pass
        to_fetch.append(sym)

    if not to_fetch:
        print(f"All {len(results)} symbols from cache")
        return results

    print(f"Fetching {len(to_fetch)} symbols ({len(results)} from cache)...")

    # yfinance batch download — much faster than individual calls
    # Process in chunks of 100 to avoid rate limits
    chunk_size = 100
    for i in range(0, len(to_fetch), chunk_size):
        chunk = to_fetch[i: i + chunk_size]
        tickers = [f"{s}.NS" for s in chunk]

        try:
            # Download entire chunk in one API call
            raw = yf.download(
                tickers,
                period=period,
                auto_adjust=True,
                progress=False,
                threads=True,    # parallel downloads
                timeout=30
            )

            if raw.empty:
                continue

            # Parse multi-ticker response
            if isinstance(raw.columns, pd.MultiIndex):
                for sym in chunk:
                    ticker = f"{sym}.NS"
                    try:
                        df = raw.xs(ticker, axis=1, level=1).dropna()
                        if not df.empty and len(df) > 20:
                            df.index = pd.to_datetime(df.index).tz_localize(None)
                            df.to_parquet(CACHE_DIR / f"{sym}_ohlc.parquet")
                            results[sym] = df
                    except (KeyError, Exception):
                        pass
            else:
                # Single ticker response
                if len(chunk) == 1:
                    sym = chunk[0]
                    df  = raw.dropna()
                    if not df.empty:
                        df.index = pd.to_datetime(df.index).tz_localize(None)
                        df.to_parquet(CACHE_DIR / f"{sym}_ohlc.parquet")
                        results[sym] = df

            print(f"  Chunk {i//chunk_size + 1}: "
                  f"fetched {len([s for s in chunk if s in results])}/{len(chunk)}")

        except Exception as e:
            print(f"  Chunk {i//chunk_size + 1} failed: {e}")

        time.sleep(1)   # rate limit between chunks

    print(f"Total: {len(results)} stocks with data")
    return results