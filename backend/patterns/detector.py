import pandas as pd
import numpy as np
import pandas_ta as ta
from scipy.signal import argrelextrema

def detect_patterns_all(ohlc_data: dict) -> dict:
    results = {}
    for symbol, df in ohlc_data.items():
        if len(df) < 60:
            continue
        patterns = detect_patterns(symbol, df)
        if patterns:
            results[symbol] = patterns
    return results

def detect_patterns(symbol: str, df: pd.DataFrame) -> list:
    patterns = []
    patterns += _detect_breakout(symbol, df)
    patterns += _detect_support_resistance(symbol, df)
    patterns += _detect_double_top_bottom(symbol, df)
    patterns += _detect_rsi_divergence(symbol, df)
    patterns += _detect_volume_spike(symbol, df)
    return patterns

def _detect_breakout(symbol: str, df: pd.DataFrame) -> list:
    patterns = []
    close = df["Close"]
    volume = df["Volume"]
    recent = df.tail(5)
    year_high = close.tail(252).max()
    avg_vol = volume.tail(20).mean()
    for i, (idx, row) in enumerate(recent.iterrows()):
        if row["Close"] >= year_high * 0.995:  # within 0.5% of 52w high
            vol_spike = row["Volume"] > avg_vol * 1.5
            patterns.append({
                "symbol": symbol,
                "pattern": "52W High Breakout",
                "date": str(idx.date()),
                "price": round(row["Close"], 2),
                "volume_confirmed": vol_spike,
                "confidence": 0.75 if vol_spike else 0.50,
                "description": f"Price touching 52-week high at ₹{row['Close']:.2f}" +
                               (" with 1.5x volume surge" if vol_spike else "")
            })
    return patterns

def _detect_support_resistance(symbol: str, df: pd.DataFrame) -> list:
    patterns = []
    close = df["Close"].values
    n = 10  # local window
    highs_idx = argrelextrema(close, np.greater, order=n)[0]
    lows_idx  = argrelextrema(close, np.less,    order=n)[0]
    current_price = close[-1]
    # Check last 5 resistance levels
    for idx in highs_idx[-5:]:
        level = close[idx]
        distance_pct = abs(current_price - level) / level * 100
        if distance_pct < 2.0:  # within 2% of resistance
            patterns.append({
                "symbol": symbol,
                "pattern": "Resistance Test",
                "date": str(df.index[-1].date()),
                "price": round(current_price, 2),
                "level": round(level, 2),
                "distance_pct": round(distance_pct, 2),
                "confidence": 0.60,
                "description": f"Testing resistance at ₹{level:.2f} "
                               f"(within {distance_pct:.1f}%)"
            })

    # Check last 5 support levels
    for idx in lows_idx[-5:]:
        level = close[idx]
        distance_pct = abs(current_price - level) / level * 100
        if distance_pct < 2.0:
            patterns.append({
                "symbol": symbol,
                "pattern": "Support Test",
                "date": str(df.index[-1].date()),
                "price": round(current_price, 2),
                "level": round(level, 2),
                "distance_pct": round(distance_pct, 2),
                "confidence": 0.55,
                "description": f"Holding support at ₹{level:.2f} "
                               f"(within {distance_pct:.1f}%)"
            })

    return patterns[:2]  # max 2 S/R patterns per stock

def _detect_double_top_bottom(symbol: str, df: pd.DataFrame) -> list:
    patterns = []
    close = df["Close"].tail(60).values
    n = 8
    highs_idx = argrelextrema(close, np.greater, order=n)[0]
    lows_idx  = argrelextrema(close, np.less,    order=n)[0]
    # Double Top: two highs within 2% of each other, 10–40 days apart
    if len(highs_idx) >= 2:
        h1, h2 = close[highs_idx[-2]], close[highs_idx[-1]]
        gap = highs_idx[-1] - highs_idx[-2]
        if abs(h1 - h2) / h1 < 0.02 and 10 <= gap <= 40:
            patterns.append({
                "symbol": symbol,
                "pattern": "Double Top",
                "date": str(df.index[-1].date()),
                "price": round(df["Close"].iloc[-1], 2),
                "confidence": 0.65,
                "description": f"Double top formed at ~₹{h1:.2f}, "
                               f"bearish reversal signal"
            })

    # Double Bottom: two lows within 2% of each other, 10–40 days apart
    if len(lows_idx) >= 2:
        l1, l2 = close[lows_idx[-2]], close[lows_idx[-1]]
        gap = lows_idx[-1] - lows_idx[-2]
        if abs(l1 - l2) / l1 < 0.02 and 10 <= gap <= 40:
            patterns.append({
                "symbol": symbol,
                "pattern": "Double Bottom",
                "date": str(df.index[-1].date()),
                "price": round(df["Close"].iloc[-1], 2),
                "confidence": 0.65,
                "description": f"Double bottom at ~₹{l1:.2f}, "
                               f"bullish reversal signal"
            })

    return patterns

def _detect_rsi_divergence(symbol: str, df: pd.DataFrame) -> list:
    patterns = []
    if len(df) < 30:
        return patterns
    df_ta = df.copy()
    df_ta.ta.rsi(length=14, append=True)
    rsi_col = [c for c in df_ta.columns if "RSI" in c]

    if not rsi_col:
        return patterns
    rsi = df_ta[rsi_col[0]].dropna()
    close = df["Close"]

    if len(rsi) < 20:
        return patterns

    # Bearish divergence: price higher high, RSI lower high
    price_hh = close.iloc[-1] > close.iloc[-10]
    rsi_lh   = rsi.iloc[-1]  < rsi.iloc[-10]

    if price_hh and rsi_lh and rsi.iloc[-1] > 60:
        patterns.append({
            "symbol": symbol,
            "pattern": "Bearish RSI Divergence",
            "date": str(df.index[-1].date()),
            "price": round(close.iloc[-1], 2),
            "rsi": round(rsi.iloc[-1], 1),
            "confidence": 0.60,
            "description": f"Price at higher high but RSI declining "
                           f"({rsi.iloc[-1]:.0f}) — momentum weakening"
        })

    # Bullish divergence: price lower low, RSI higher low
    price_ll = close.iloc[-1] < close.iloc[-10]
    rsi_hl   = rsi.iloc[-1]  > rsi.iloc[-10]

    if price_ll and rsi_hl and rsi.iloc[-1] < 40:
        patterns.append({
            "symbol": symbol,
            "pattern": "Bullish RSI Divergence",
            "date": str(df.index[-1].date()),
            "price": round(close.iloc[-1], 2),
            "rsi": round(rsi.iloc[-1], 1),
            "confidence": 0.62,
            "description": f"Price at lower low but RSI rising "
                           f"({rsi.iloc[-1]:.0f}) — selling pressure easing"
        })

    return patterns

def _detect_volume_spike(symbol: str, df: pd.DataFrame) -> list:
    patterns = []
    avg_vol = df["Volume"].tail(20).mean()
    last_vol = df["Volume"].iloc[-1]
    last_close = df["Close"].iloc[-1]
    prev_close = df["Close"].iloc[-2]
    price_chg_pct = (last_close - prev_close) / prev_close * 100

    if last_vol > avg_vol * 2.0:
        direction = "bullish" if price_chg_pct > 0 else "bearish"
        patterns.append({
            "symbol": symbol,
            "pattern": "Volume Spike",
            "date": str(df.index[-1].date()),
            "price": round(last_close, 2),
            "volume_ratio": round(last_vol / avg_vol, 1),
            "price_change_pct": round(price_chg_pct, 2),
            "confidence": 0.55,
            "description": f"{last_vol/avg_vol:.1f}x average volume "
                           f"with {price_chg_pct:+.1f}% price move — {direction}"
        })

    return patterns