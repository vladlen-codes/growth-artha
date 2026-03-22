import pandas as pd
import numpy as np
from datetime import datetime, timedelta

#  Signal weight table (transparent to users)
# These are the exact weights shown in the Growth Artha document.
# Positive = opportunity signal, Negative = risk signal

EVENT_WEIGHTS = {
    # Opportunity signals
    "promoter_buy":           0.80,
    "fii_block_deal_buy":     0.80,
    "margin_expansion_3q":    0.75,
    "earnings_surprise_15":   0.65,
    "insider_buy":            0.55,
    "breakout_52w":           0.50,
    "pledge_reduction":       0.45,
    "guidance_raise":         0.40,
    "volume_spike_bullish":   0.35,
    "support_hold":           0.30,

    # Risk signals (negative weights)
    "promoter_sell_miss":    -0.85,
    "pledge_increase":       -0.70,
    "earnings_miss":         -0.60,
    "breakdown_support":     -0.55,
    "fii_block_deal_sell":   -0.50,
    "bearish_divergence":    -0.45,
    "volume_spike_bearish":  -0.35,
}

PATTERN_WEIGHTS = {
    "52W High Breakout":       0.50,
    "Double Bottom":           0.45,
    "Bullish RSI Divergence":  0.40,
    "Support Test":            0.30,
    "Volume Spike":            0.20,   # neutral until direction known
    "Resistance Test":        -0.25,
    "Double Top":             -0.45,
    "Bearish RSI Divergence": -0.40,
}

# Portfolio relevance multiplier
PORTFOLIO_MULTIPLIER = {
    "holding":  1.4,   # user holds this stock directly
    "sector":   1.2,   # user holds something in same sector
    "none":     1.0,
}

# Convergence bonus — reward co-occurring signals
CONVERGENCE_BONUS = {
    1: 0.0,   # single signal, no bonus
    2: 0.08,  # two signals together
    3: 0.15,  # three signals — strong conviction
    4: 0.20,  # four+ signals — very strong
}

# In-memory store so /stocks/{symbol}/explain can access latest signals
_latest_signals: dict = {}


def score_all_signals(
    ohlc_data: dict,
    bulk_deals: pd.DataFrame,
    patterns: dict,
    portfolio: list = []
) -> list:
    """
    Master scorer. Combines event signals + pattern signals for every stock.
    Returns a sorted list of signal dicts, highest score first.
    """
    global _latest_signals
    results = []

    # Build sector map for portfolio-aware scoring
    sector_map = _build_sector_map(ohlc_data)
    portfolio_sectors = _get_portfolio_sectors(portfolio, sector_map)

    for symbol in ohlc_data:
        df = ohlc_data[symbol]
        if len(df) < 30:
            continue

        # Step 1: collect all triggered signals for this stock
        triggered_events   = _score_events(symbol, df, bulk_deals)
        triggered_patterns = _score_patterns(symbol, patterns)

        all_signals = triggered_events + triggered_patterns
        if not all_signals:
            continue

        # Step 2: base score = sum of all signal weights
        base_score = sum(s["weight"] for s in all_signals)

        # Step 3: convergence bonus (reward multiple co-occurring signals)
        n = len(all_signals)
        bonus_key = min(n, 4)
        convergence_bonus = CONVERGENCE_BONUS[bonus_key]

        # Step 4: portfolio multiplier
        portfolio_tag = _get_portfolio_tag(symbol, portfolio, portfolio_sectors, sector_map)
        multiplier = PORTFOLIO_MULTIPLIER[portfolio_tag]

        # Step 5: final score (clamp to -1.0 → 1.0)
        raw_score = (base_score + convergence_bonus) * multiplier
        final_score = round(max(-1.0, min(1.0, raw_score)), 3)

        # Step 6: build signal dict
        signal = {
            "symbol":         symbol,
            "score":          final_score,
            "base_score":     round(base_score, 3),
            "convergence_bonus": convergence_bonus,
            "portfolio_tag":  portfolio_tag,
            "tags":           _build_tags(all_signals),
            "signals":        all_signals,
            "patterns":       triggered_patterns,
            "events":         triggered_events,
            "signal_count":   len(all_signals),
            "last_price":     round(df["Close"].iloc[-1], 2),
            "price_change_pct": _price_change(df),
            "signal_age_days": 0,   # today's scan
            "scanned_at":     datetime.now().isoformat(),
            "ai_card":        None,  # filled by Gemini after scoring
        }

        results.append(signal)
        _latest_signals[symbol] = signal

    # Sort: highest absolute score first for opportunities,
    # most negative first for risks
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def get_signal_for_symbol(symbol: str) -> dict | None:
    """Used by /stocks/{symbol}/explain endpoint."""
    return _latest_signals.get(symbol)


# Private helpers

def _score_events(symbol: str, df: pd.DataFrame, bulk_deals: pd.DataFrame) -> list:
    signals = []
    close = df["Close"]
    volume = df["Volume"]

    # Bulk deal signals
    if not bulk_deals.empty and "symbol" in bulk_deals.columns:
        stock_deals = bulk_deals[
            bulk_deals["symbol"].str.upper() == symbol.upper()
        ]

        for _, deal in stock_deals.iterrows():
            deal_type = str(deal.get("dealType", "")).upper()
            client = str(deal.get("clientName", ""))
            qty = deal.get("quantity", 0)

            # FII buying — strongest signal
            fii_keywords = ["vanguard", "blackrock", "fidelity", "government of",
                           "singapore", "norway", "abu dhabi", "temasek"]
            is_fii = any(kw in client.lower() for kw in fii_keywords)

            if deal_type == "BUY" and is_fii:
                signals.append({
                    "name": "fii_block_deal_buy",
                    "weight": EVENT_WEIGHTS["fii_block_deal_buy"],
                    "evidence": f"FII bulk buy: {client} purchased "
                                f"{qty:,} shares",
                    "source": "NSE Bulk Deals"
                })
            elif deal_type == "BUY":
                signals.append({
                    "name": "promoter_buy",
                    "weight": EVENT_WEIGHTS["promoter_buy"],
                    "evidence": f"Institutional buy: {client} "
                                f"({qty:,} shares)",
                    "source": "NSE Bulk Deals"
                })
            elif deal_type == "SELL":
                signals.append({
                    "name": "fii_block_deal_sell",
                    "weight": EVENT_WEIGHTS["fii_block_deal_sell"],
                    "evidence": f"Bulk sale: {client} sold "
                                f"{qty:,} shares",
                    "source": "NSE Bulk Deals"
                })

    # Price/volume signals

    # 52-week high breakout
    year_high = close.tail(252).max()
    current = close.iloc[-1]
    if current >= year_high * 0.995:
        avg_vol = volume.tail(20).mean()
        vol_confirmed = volume.iloc[-1] > avg_vol * 1.5
        signals.append({
            "name": "breakout_52w",
            "weight": EVENT_WEIGHTS["breakout_52w"] + (0.10 if vol_confirmed else 0),
            "evidence": f"52-week high breakout at ₹{current:.2f}" +
                       (" with volume surge" if vol_confirmed else ""),
            "source": "Price Data"
        })

    # Volume spike (directional)
    avg_vol_20 = volume.tail(20).mean()
    last_vol = volume.iloc[-1]
    price_chg = (close.iloc[-1] - close.iloc[-2]) / close.iloc[-2]

    if last_vol > avg_vol_20 * 2.0:
        if price_chg > 0.01:   # >1% up on volume spike
            signals.append({
                "name": "volume_spike_bullish",
                "weight": EVENT_WEIGHTS["volume_spike_bullish"],
                "evidence": f"Volume {last_vol/avg_vol_20:.1f}x average "
                           f"with {price_chg*100:+.1f}% price move",
                "source": "Price Data"
            })
        elif price_chg < -0.01:
            signals.append({
                "name": "volume_spike_bearish",
                "weight": EVENT_WEIGHTS["volume_spike_bearish"],
                "evidence": f"Volume {last_vol/avg_vol_20:.1f}x average "
                           f"with {price_chg*100:+.1f}% price drop",
                "source": "Price Data"
            })

    # Earnings proxy (3-month return vs Nifty estimate)
    # Real version: pull from NSE quarterly results endpoint
    # This version: use 3-month price momentum as proxy (Only for Hackathon purpose)
    ret_3m = (close.iloc[-1] - close.iloc[-63]) / close.iloc[-63] if len(close) >= 63 else 0
    if ret_3m > 0.20:    # >20% in 3 months — likely earnings beat
        signals.append({
            "name": "earnings_surprise_15",
            "weight": EVENT_WEIGHTS["earnings_surprise_15"],
            "evidence": f"{ret_3m*100:.1f}% return over 3 months "
                       f"— likely earnings outperformance",
            "source": "Price Momentum Proxy"
        })
    elif ret_3m < -0.15:  # >15% drop — likely earnings miss
        signals.append({
            "name": "earnings_miss",
            "weight": EVENT_WEIGHTS["earnings_miss"],
            "evidence": f"{ret_3m*100:.1f}% decline over 3 months "
                       f"— potential earnings underperformance",
            "source": "Price Momentum Proxy"
        })

    return signals

def _score_patterns(symbol: str, patterns: dict) -> list:
    signals = []
    stock_patterns = patterns.get(symbol, [])

    for p in stock_patterns:
        pattern_name = p.get("pattern", "")
        weight = PATTERN_WEIGHTS.get(pattern_name, 0)

        if weight == 0:
            continue

        # Adjust weight by confidence from detector
        confidence = p.get("confidence", 0.5)
        adjusted_weight = weight * confidence

        signals.append({
            "name": f"pattern_{pattern_name.lower().replace(' ', '_')}",
            "weight": round(adjusted_weight, 3),
            "evidence": p.get("description", pattern_name),
            "source": "Chart Pattern",
            "pattern_detail": p
        })

    return signals

def _build_tags(signals: list) -> list:
    tag_map = {
        "fii_block_deal_buy":    "FII Buy",
        "fii_block_deal_sell":   "FII Sell",
        "promoter_buy":          "Inst. Buy",
        "breakout_52w":          "52W High",
        "volume_spike_bullish":  "Vol Spike",
        "volume_spike_bearish":  "Vol Spike",
        "earnings_surprise_15":  "Earnings Beat",
        "earnings_miss":         "Earnings Miss",
        "pledge_reduction":      "Pledge Down",
        "pledge_increase":       "Pledge Up",
    }
    tags = []
    for s in signals:
        name = s.get("name", "")
        # Handle pattern signals
        if name.startswith("pattern_"):
            detail = s.get("pattern_detail", {})
            tags.append(detail.get("pattern", "Pattern"))
        else:
            tags.append(tag_map.get(name, name.replace("_", " ").title()))

    return list(dict.fromkeys(tags))  # deduplicate preserving order

def _get_portfolio_tag(symbol, portfolio, portfolio_sectors, sector_map) -> str:
    if symbol in [p.upper() for p in portfolio]:
        return "holding"
    sym_sector = sector_map.get(symbol)
    if sym_sector and sym_sector in portfolio_sectors:
        return "sector"
    return "none"

def _get_portfolio_sectors(portfolio: list, sector_map: dict) -> set:
    return {sector_map[s] for s in portfolio if s in sector_map and sector_map[s]}

def _build_sector_map(ohlc_data: dict) -> dict:
    return {
        "RELIANCE": "Energy", "ONGC": "Energy", "BPCL": "Energy",
        "TCS": "IT", "INFY": "IT", "WIPRO": "IT", "HCLTECH": "IT", "TECHM": "IT",
        "HDFCBANK": "Banking", "ICICIBANK": "Banking", "SBIN": "Banking",
        "KOTAKBANK": "Banking", "AXISBANK": "Banking", "INDUSINDBK": "Banking",
        "BAJFINANCE": "NBFC", "BAJAJFINSV": "NBFC", "SHRIRAMFIN": "NBFC",
        "HINDUNILVR": "FMCG", "ITC": "FMCG", "NESTLEIND": "FMCG",
        "BRITANNIA": "FMCG", "TATACONSUM": "FMCG",
        "MARUTI": "Auto", "TATAMOTORS": "Auto", "BAJAJ-AUTO": "Auto",
        "HEROMOTOCO": "Auto", "EICHERMOT": "Auto", "MM": "Auto",
        "SUNPHARMA": "Pharma", "DRREDDY": "Pharma", "CIPLA": "Pharma",
        "DIVISLAB": "Pharma", "APOLLOHOSP": "Healthcare",
        "LT": "Infra", "NTPC": "Power", "POWERGRID": "Power",
        "COALINDIA": "Mining", "HINDALCO": "Metals", "TATASTEEL": "Metals",
        "JSWSTEEL": "Metals", "ADANIENT": "Conglomerate",
        "ADANIPORTS": "Logistics", "TITAN": "Consumer", "ASIANPAINT": "Consumer",
        "BHARTIARTL": "Telecom", "ULTRACEM CO": "Cement", "GRASIM": "Cement",
        "SBILIFE": "Insurance", "HDFCLIFE": "Insurance", "UPL": "Agri",
    }

def _price_change(df: pd.DataFrame) -> float:
    if len(df) < 2:
        return 0.0
    chg = (df["Close"].iloc[-1] - df["Close"].iloc[-2]) / df["Close"].iloc[-2]
    return round(chg * 100, 2)