import pandas as pd
import numpy as np
from backend.data.fetcher import fetch_ohlc
from backend.patterns.detector import detect_patterns

def backtest_pattern(symbol: str, pattern_name: str, forward_days: int = 20) -> dict:
    df = fetch_ohlc(symbol, period="2y")
    if df.empty or len(df) < 60:
        return _empty_backtest(symbol, pattern_name)

    # Scan rolling windows to find historical pattern instances
    instances = []
    window = 60  # look at 60-day windows

    for i in range(window, len(df) - forward_days):
        window_df = df.iloc[i - window: i].copy()
        window_df.index = pd.to_datetime(window_df.index)
        patterns = detect_patterns(symbol, window_df)

        matched = [p for p in patterns if p["pattern"] == pattern_name]
        if not matched:
            continue

        # Compute forward return from this point
        entry_price   = df["Close"].iloc[i]
        forward_price = df["Close"].iloc[i + forward_days]
        fwd_return    = (forward_price - entry_price) / entry_price * 100

        instances.append({
            "date":         str(df.index[i].date()),
            "entry_price":  round(entry_price, 2),
            "exit_price":   round(forward_price, 2),
            "return_pct":   round(fwd_return, 2),
            "win":          fwd_return > 0
        })

    if not instances:
        return _empty_backtest(symbol, pattern_name)

    returns   = [r["return_pct"] for r in instances]
    wins      = [r for r in instances if r["win"]]
    losses    = [r for r in instances if not r["win"]]
    win_rate  = len(wins) / len(instances)
    returns_series = pd.Series(returns)

    # Confidence band based on sample size
    n = len(instances)
    if n < 5:
        confidence_band = "low"       # too few instances to trust
    elif n < 15:
        confidence_band = "medium"
    else:
        confidence_band = "high"

    return {
        "symbol":           symbol,
        "pattern":          pattern_name,
        "forward_days":     forward_days,
        "expected_horizon_days": forward_days,
        "instances":        n,
        "win_rate":         round(win_rate, 3),
        "win_rate_pct":     round(win_rate * 100, 1),
        "avg_return_pct":   round(np.mean(returns), 2),
        "median_move_pct":  round(float(returns_series.median()), 2),
        "p25_move_pct":     round(float(returns_series.quantile(0.25)), 2),
        "p75_move_pct":     round(float(returns_series.quantile(0.75)), 2),
        "avg_win_pct":      round(np.mean([r["return_pct"] for r in wins]), 2) if wins else 0,
        "avg_loss_pct":     round(np.mean([r["return_pct"] for r in losses]), 2) if losses else 0,
        "confidence_band":  confidence_band,
        "instances_detail": instances[-5:],  # last 5 for UI drill-down
        "similar_instances": instances[-3:],  # 2-3 recent analogs for explainability
    }


def backtest_symbol(symbol: str) -> dict:
    from pathlib import Path
    import json

    cache_path = Path(f"data/cache/{symbol}_backtest.json")
    if cache_path.exists():
        with open(cache_path) as f:
            return json.load(f)

    pattern_names = [
        "52W High Breakout",
        "Double Bottom",
        "Double Top",
        "Bullish RSI Divergence",
        "Bearish RSI Divergence",
        "Support Test",
        "Resistance Test",
        "Volume Spike",
    ]

    results = {}
    print(f"Back-testing {symbol}...")
    for pname in pattern_names:
        results[pname] = backtest_pattern(symbol, pname)
    with open(cache_path, "w") as f:
        json.dump(results, f, indent=2)
    return results

def _empty_backtest(symbol: str, pattern_name: str) -> dict:
    return {
        "symbol":          symbol,
        "pattern":         pattern_name,
        "forward_days":    20,
        "expected_horizon_days": 20,
        "instances":       0,
        "win_rate":        None,
        "win_rate_pct":    None,
        "avg_return_pct":  None,
        "median_move_pct": None,
        "p25_move_pct":    None,
        "p75_move_pct":    None,
        "confidence_band": "insufficient data",
        "instances_detail": [],
        "similar_instances": [],
    }