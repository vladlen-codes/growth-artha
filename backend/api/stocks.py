import yfinance as yf
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, HTTPException
from backend.data.fetcher import fetch_ohlc, fetch_stock_info

router = APIRouter()

@router.get("/market/overview")
def get_market_overview():
    from backend.data.fetcher import (
        fetch_nifty_index_quote,
        fetch_top_gainers_losers
    )
    nifty = fetch_nifty_index_quote()
    gl    = fetch_top_gainers_losers()
    return {
        "nifty50":    nifty,
        "gainers":    gl["gainers"],
        "losers":     gl["losers"],
        "updated_at": datetime.now().isoformat()
    }

@router.get("/{symbol}/ohlc")
def get_ohlc(symbol: str, days: int = 90):
    df = fetch_ohlc(symbol.upper())
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    df_trimmed = df.tail(days).reset_index()
    return {
        "symbol": symbol,
        "data": [
            {
                "time":   row["Date"].strftime("%Y-%m-%d"),
                "open":   round(row["Open"],   2),
                "high":   round(row["High"],   2),
                "low":    round(row["Low"],    2),
                "close":  round(row["Close"],  2),
                "volume": int(row["Volume"])
            }
            for _, row in df_trimmed.iterrows()
        ]
    }

@router.get("/{symbol}/info")
def get_stock_info(symbol: str):
    return fetch_stock_info(symbol.upper())

@router.get("/{symbol}/backtest")
def get_pattern_backtest(symbol: str):
    from backend.patterns.backtester import backtest_symbol
    return {
        "symbol": symbol.upper(),
        "patterns": backtest_symbol(symbol.upper())
    }

@router.get("/{symbol}/explain")
def explain_signal(symbol: str):
    from backend.ai.gemini_client import generate_explanation
    from backend.signals.scorer import get_signal_for_symbol
    signal = get_signal_for_symbol(symbol.upper())
    if not signal:
        raise HTTPException(status_code=404, detail="No active signal for this stock")
    explanation = generate_explanation(symbol, signal)
    return {"symbol": symbol, "explanation": explanation}

@router.get("/{symbol}/sentiment")
def get_sentiment(symbol: str, force_refresh: bool = False):
    from backend.signals.sentiment import get_stock_sentiment
    return get_stock_sentiment(symbol.upper(), force_refresh)

@router.get("/{symbol}/price")
def get_live_price(symbol: str):
    from backend.data.fetcher import fetch_live_quote
    return fetch_live_quote(symbol.upper())