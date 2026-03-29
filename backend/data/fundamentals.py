from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
import json
from typing import Any

import pandas as pd
import yfinance as yf


CACHE_DIR = Path("data/cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def fetch_fundamental_signals_batch(symbols: list[str], max_age_hours: int = 12) -> dict[str, list[dict[str, Any]]]:
    output: dict[str, list[dict[str, Any]]] = {}
    for symbol in symbols:
        output[symbol] = fetch_fundamental_signals(symbol, max_age_hours=max_age_hours)
    return output


def fetch_fundamental_signals(symbol: str, max_age_hours: int = 12) -> list[dict[str, Any]]:
    symbol = (symbol or "").upper().strip()
    if not symbol:
        return []

    cached = _load_cache(symbol, max_age_hours=max_age_hours)
    if cached is not None:
        return cached

    signals: list[dict[str, Any]] = []

    try:
        ticker = yf.Ticker(f"{symbol}.NS")

        # A1: Corporate filing/event proxies from recent news feed headlines.
        news_items = ticker.get_news() or []
        signals.extend(_extract_filing_signals(news_items[:25]))

        # A2: Quarterly results signals from recent financial statements.
        signals.extend(_extract_quarterly_signals(ticker))

        # A3: Insider transactions and materiality signals.
        signals.extend(_extract_insider_signals(ticker))

        # A4: Management commentary shift from recent language/tone changes.
        signals.extend(_extract_management_commentary_shift(news_items[:40]))

        # A5: Regulatory monitor from recent company/sector policy actions.
        signals.extend(_extract_regulatory_signals(news_items[:40]))

    except Exception:
        # Always fail safe — scorer should continue even if fundamentals fail.
        signals = []

    _save_cache(symbol, signals)
    return signals


def _extract_filing_signals(news_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    for item in news_items:
        title = str(item.get("title") or "").strip()
        if not title:
            continue

        normalized = title.lower()
        name = None

        taxonomy = "corporate_update"

        if "guidance" in normalized and any(w in normalized for w in ["raise", "upgraded", "upside"]):
            name = "guidance_raise"
            taxonomy = "guidance"
        elif "guidance" in normalized and any(w in normalized for w in ["cut", "lower", "downgrade", "weak"]):
            name = "guidance_cut"
            taxonomy = "guidance"
        elif "promoter" in normalized and any(w in normalized for w in ["buy", "acquire", "increase stake"]):
            name = "promoter_buy"
            taxonomy = "promoter"
        elif "promoter" in normalized and any(w in normalized for w in ["sell", "stake sale", "offload"]):
            name = "promoter_sell_miss"
            taxonomy = "promoter"
        elif "pledge" in normalized and any(w in normalized for w in ["reduc", "release", "decrease"]):
            name = "pledge_reduction"
            taxonomy = "pledge"
        elif "pledge" in normalized and any(w in normalized for w in ["increase", "rise", "higher"]):
            name = "pledge_increase"
            taxonomy = "pledge"
        elif any(w in normalized for w in ["insider buy", "insider purchase"]):
            name = "insider_buy"
            taxonomy = "insider"
        elif any(w in normalized for w in ["order win", "wins order", "contract win", "major order"]):
            name = "contract_win"
            taxonomy = "order_book"
        elif any(w in normalized for w in ["order loss", "contract loss", "cancelled order", "order cancellation"]):
            name = "contract_loss"
            taxonomy = "order_book"
        elif any(w in normalized for w in ["buyback", "share buyback", "open market buyback"]):
            name = "buyback_announcement"
            taxonomy = "capital_allocation"
        elif "capex" in normalized and any(w in normalized for w in ["expand", "new plant", "commission", "capacity addition"]):
            name = "capex_expansion"
            taxonomy = "capex"
        elif "capex" in normalized and any(w in normalized for w in ["delay", "defer", "cancel"]):
            name = "capex_delay"
            taxonomy = "capex"
        elif any(w in normalized for w in ["debt reduction", "deleveraging", "debt repayment", "net debt down"]):
            name = "debt_reduction"
            taxonomy = "balance_sheet"
        elif any(w in normalized for w in ["regulatory action", "probe", "penalty", "fine imposed", "show cause notice"]):
            name = "regulatory_probe"
            taxonomy = "regulatory"
        elif any(w in normalized for w in ["credit rating upgrade", "rating upgraded"]):
            name = "credit_upgrade"
            taxonomy = "credit"
        elif any(w in normalized for w in ["credit rating downgrade", "rating downgraded"]):
            name = "credit_downgrade"
            taxonomy = "credit"

        if not name:
            continue

        source = item.get("publisher") or item.get("source") or "Filing/News Feed"
        events.append({
            "name": name,
            "evidence": title,
            "source": str(source),
            "source_type": "filing_news",
            "taxonomy": taxonomy,
            "confidence": 0.75,
        })

    # Keep recent unique events only (dedupe by name+evidence).
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for e in events:
        key = (e["name"], e["evidence"])
        if key not in unique:
            unique[key] = e
    return list(unique.values())[:8]


def _extract_quarterly_signals(ticker: yf.Ticker) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    # Prefer quarterly_income_stmt; fallback to quarterly_financials.
    q = ticker.quarterly_income_stmt
    if q is None or q.empty:
        q = ticker.quarterly_financials
    if q is None or q.empty:
        return events

    # Expected shape from yfinance: rows = metrics, columns = quarter dates.
    # We only need a few robust metrics.
    revenue = _get_series(q, ["Total Revenue", "Operating Revenue", "Revenue"])
    net_income = _get_series(q, ["Net Income", "Net Income Common Stockholders", "Net Income From Continuing Operation Net Minority Interest"])
    operating_income = _get_series(q, ["Operating Income", "OperatingIncome"])

    if revenue is None or net_income is None:
        return events

    revenue = revenue.dropna()
    net_income = net_income.dropna()
    operating_income = operating_income.dropna() if operating_income is not None else pd.Series(dtype=float)

    if len(revenue) < 2 or len(net_income) < 2:
        return events

    # yfinance columns are often reverse-chronological; enforce date order newest first.
    revenue = revenue.sort_index(ascending=False)
    net_income = net_income.sort_index(ascending=False)
    if not operating_income.empty:
        operating_income = operating_income.sort_index(ascending=False)

    rev_now, rev_prev = float(revenue.iloc[0]), float(revenue.iloc[1])
    ni_now, ni_prev = float(net_income.iloc[0]), float(net_income.iloc[1])
    quarter_now = str(revenue.index[0])
    quarter_prev = str(revenue.index[1])

    rev_qoq = _safe_pct_change(rev_now, rev_prev)
    ni_qoq = _safe_pct_change(ni_now, ni_prev)

    # Positive quarterly acceleration proxy.
    if rev_qoq >= 8 and ni_qoq >= 12:
        confidence = _quarterly_confidence(rev_qoq=rev_qoq, ni_qoq=ni_qoq)
        events.append({
            "name": "earnings_surprise_15",
            "evidence": f"Quarterly momentum: revenue {rev_qoq:+.1f}% QoQ, net income {ni_qoq:+.1f}% QoQ",
            "source": "Quarterly Results",
            "source_type": "quarterly_results",
            "taxonomy": "earnings",
            "confidence": confidence,
            "details": {
                "quarter_now": quarter_now,
                "quarter_prev": quarter_prev,
                "revenue_qoq_pct": round(rev_qoq, 2),
                "net_income_qoq_pct": round(ni_qoq, 2),
            },
        })

    # Negative quarterly deterioration proxy.
    if rev_qoq <= -6 and ni_qoq <= -10:
        confidence = _quarterly_confidence(rev_qoq=abs(rev_qoq), ni_qoq=abs(ni_qoq))
        events.append({
            "name": "earnings_miss",
            "evidence": f"Quarterly slowdown: revenue {rev_qoq:+.1f}% QoQ, net income {ni_qoq:+.1f}% QoQ",
            "source": "Quarterly Results",
            "source_type": "quarterly_results",
            "taxonomy": "earnings",
            "confidence": confidence,
            "details": {
                "quarter_now": quarter_now,
                "quarter_prev": quarter_prev,
                "revenue_qoq_pct": round(rev_qoq, 2),
                "net_income_qoq_pct": round(ni_qoq, 2),
            },
        })

    # Margin expansion streak over 3 quarters if available.
    if len(revenue) >= 3 and not operating_income.empty and len(operating_income) >= 3:
        # Align by index to avoid mismatched quarters.
        aligned = pd.DataFrame({"rev": revenue, "op": operating_income}).dropna().sort_index(ascending=False)
        if len(aligned) >= 3:
            m0 = _safe_margin(aligned.iloc[0]["op"], aligned.iloc[0]["rev"])
            m1 = _safe_margin(aligned.iloc[1]["op"], aligned.iloc[1]["rev"])
            m2 = _safe_margin(aligned.iloc[2]["op"], aligned.iloc[2]["rev"])
            if m0 is not None and m1 is not None and m2 is not None and m0 > m1 > m2:
                confidence = _margin_streak_confidence(m0=m0, m1=m1, m2=m2)
                events.append({
                    "name": "margin_expansion_3q",
                    "evidence": f"Operating margin expansion streak: {m2:.1f}% -> {m1:.1f}% -> {m0:.1f}%",
                    "source": "Quarterly Results",
                    "source_type": "quarterly_results",
                    "taxonomy": "profitability",
                    "confidence": confidence,
                    "details": {
                        "margin_q_minus_2_pct": round(m2, 2),
                        "margin_q_minus_1_pct": round(m1, 2),
                        "margin_q_now_pct": round(m0, 2),
                    },
                })

    # YoY checks need 5+ quarters: current quarter vs same quarter last year.
    if len(revenue) >= 5 and len(net_income) >= 5:
        rev_yoy = _safe_pct_change(float(revenue.iloc[0]), float(revenue.iloc[4]))
        ni_yoy = _safe_pct_change(float(net_income.iloc[0]), float(net_income.iloc[4]))
        yoy_conf = _quarterly_confidence(rev_qoq=rev_yoy, ni_qoq=ni_yoy)

        if rev_yoy >= 10 and ni_yoy >= 14:
            events.append({
                "name": "earnings_surprise_15",
                "evidence": f"YoY growth strength: revenue {rev_yoy:+.1f}%, net income {ni_yoy:+.1f}%",
                "source": "Quarterly Results",
                "source_type": "quarterly_results",
                "taxonomy": "earnings_yoy",
                "confidence": yoy_conf,
                "details": {
                    "revenue_yoy_pct": round(rev_yoy, 2),
                    "net_income_yoy_pct": round(ni_yoy, 2),
                },
            })
        elif rev_yoy <= -8 and ni_yoy <= -12:
            events.append({
                "name": "earnings_miss",
                "evidence": f"YoY deterioration: revenue {rev_yoy:+.1f}%, net income {ni_yoy:+.1f}%",
                "source": "Quarterly Results",
                "source_type": "quarterly_results",
                "taxonomy": "earnings_yoy",
                "confidence": yoy_conf,
                "details": {
                    "revenue_yoy_pct": round(rev_yoy, 2),
                    "net_income_yoy_pct": round(ni_yoy, 2),
                },
            })

    # Acceleration quality: latest QoQ improves vs prior QoQ trend.
    if len(revenue) >= 3 and len(net_income) >= 3:
        rev_prev_qoq = _safe_pct_change(float(revenue.iloc[1]), float(revenue.iloc[2]))
        ni_prev_qoq = _safe_pct_change(float(net_income.iloc[1]), float(net_income.iloc[2]))
        rev_acc = rev_qoq - rev_prev_qoq
        ni_acc = ni_qoq - ni_prev_qoq
        acc_conf = _quarterly_confidence(rev_qoq=rev_acc, ni_qoq=ni_acc)

        if rev_acc >= 6 and ni_acc >= 8 and rev_qoq > 0 and ni_qoq > 0:
            events.append({
                "name": "earnings_acceleration",
                "evidence": f"Quarterly acceleration improved: revenue delta {rev_acc:+.1f}pp, net income delta {ni_acc:+.1f}pp",
                "source": "Quarterly Results",
                "source_type": "quarterly_results",
                "taxonomy": "earnings_acceleration",
                "confidence": acc_conf,
                "details": {
                    "revenue_qoq_current_pct": round(rev_qoq, 2),
                    "revenue_qoq_prev_pct": round(rev_prev_qoq, 2),
                    "net_income_qoq_current_pct": round(ni_qoq, 2),
                    "net_income_qoq_prev_pct": round(ni_prev_qoq, 2),
                },
            })
        elif rev_acc <= -6 and ni_acc <= -8 and rev_qoq < 0 and ni_qoq < 0:
            events.append({
                "name": "earnings_deceleration",
                "evidence": f"Quarterly deceleration worsened: revenue delta {rev_acc:+.1f}pp, net income delta {ni_acc:+.1f}pp",
                "source": "Quarterly Results",
                "source_type": "quarterly_results",
                "taxonomy": "earnings_acceleration",
                "confidence": acc_conf,
                "details": {
                    "revenue_qoq_current_pct": round(rev_qoq, 2),
                    "revenue_qoq_prev_pct": round(rev_prev_qoq, 2),
                    "net_income_qoq_current_pct": round(ni_qoq, 2),
                    "net_income_qoq_prev_pct": round(ni_prev_qoq, 2),
                },
            })

    return events[:8]

def _extract_insider_signals(ticker: yf.Ticker) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    try:
        tx = ticker.insider_transactions
    except Exception:
        return events

    if tx is None or tx.empty:
        return events

    rows = tx.head(25)
    for _, row in rows.iterrows():
        direction = _detect_insider_direction(row)
        if direction == "unknown":
            continue

        shares = _pick_numeric(row, ["Shares", "Shares Traded", "Shares Owned Following Transaction", "shares"])
        value = _pick_numeric(row, ["Value", "Value (USD)", "value", "Transaction Value"])
        actor = _pick_text(row, ["Insider", "Name", "Owner", "insider", "name"]) or "Insider"

        materiality = _insider_materiality(shares=shares, value=value)
        confidence = 0.72 if materiality == "medium" else 0.9 if materiality == "high" else 0.65

        if direction == "buy":
            name = "insider_buy_heavy" if materiality == "high" else "insider_buy"
        else:
            name = "insider_sell_heavy" if materiality == "high" else "insider_sell"

        piece = f"{actor} {direction}s"
        if shares is not None:
            piece += f" {int(abs(shares)):,} shares"
        elif value is not None:
            piece += f" trades worth {abs(value):,.0f}"

        events.append({
            "name": name,
            "evidence": piece,
            "source": "Insider Transactions",
            "source_type": "insider_trades",
            "taxonomy": "insider",
            "confidence": confidence,
            "details": {
                "materiality": materiality,
                "shares": shares,
                "value": value,
            },
        })

    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for e in events:
        key = (e["name"], e["evidence"])
        if key not in unique:
            unique[key] = e
    return list(unique.values())[:5]


def _extract_management_commentary_shift(news_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    positives = [
        "confident", "strong demand", "healthy pipeline", "improving margin",
        "visibility improving", "outlook improved", "guidance reiterated",
    ]
    negatives = [
        "cautious", "demand slowdown", "margin pressure", "cost inflation",
        "weak outlook", "uncertain demand", "guidance withdrawn",
    ]

    for item in news_items:
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        lower = title.lower()

        pos = sum(1 for w in positives if w in lower)
        neg = sum(1 for w in negatives if w in lower)
        if pos == 0 and neg == 0:
            continue

        if pos > neg:
            name = "mgmt_tone_improving"
            confidence = 0.7 if pos == 1 else 0.82
        elif neg > pos:
            name = "mgmt_tone_deteriorating"
            confidence = 0.72 if neg == 1 else 0.85
        else:
            continue

        source = item.get("publisher") or item.get("source") or "Management Commentary"
        events.append({
            "name": name,
            "evidence": title,
            "source": str(source),
            "source_type": "management_commentary",
            "taxonomy": "management_tone",
            "confidence": confidence,
            "details": {
                "positive_terms": pos,
                "negative_terms": neg,
            },
        })

    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for e in events:
        key = (e["name"], e["evidence"])
        if key not in unique:
            unique[key] = e
    return list(unique.values())[:4]


def _extract_regulatory_signals(news_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    negative_markers = [
        "penalty", "fine", "ban", "license suspended", "investigation",
        "search operation", "show cause notice", "compliance lapse",
    ]
    positive_markers = [
        "regulatory approval", "clearance", "license granted", "policy support",
        "tariff hike approved", "incentive approved", "order lifted",
    ]

    for item in news_items:
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        lower = title.lower()

        neg_hits = sum(1 for w in negative_markers if w in lower)
        pos_hits = sum(1 for w in positive_markers if w in lower)
        if neg_hits == 0 and pos_hits == 0:
            continue

        publish_time = item.get("providerPublishTime")
        recency_boost = _regulatory_recency_boost(publish_time)

        if neg_hits >= pos_hits:
            severity = "high" if neg_hits >= 2 else "medium"
            confidence = min(0.95, 0.72 + recency_boost + (0.12 if severity == "high" else 0.05))
            name = "regulatory_risk_high" if severity == "high" else "regulatory_probe"
        else:
            severity = "high" if pos_hits >= 2 else "medium"
            confidence = min(0.9, 0.68 + recency_boost + (0.10 if severity == "high" else 0.04))
            name = "regulatory_relief"

        source = item.get("publisher") or item.get("source") or "Regulatory Feed"
        events.append({
            "name": name,
            "evidence": title,
            "source": str(source),
            "source_type": "regulatory",
            "taxonomy": "regulatory",
            "confidence": round(confidence, 2),
            "details": {
                "severity": severity,
                "negative_hits": neg_hits,
                "positive_hits": pos_hits,
                "provider_publish_time": publish_time,
            },
        })

    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for e in events:
        key = (e["name"], e["evidence"])
        if key not in unique:
            unique[key] = e
    return list(unique.values())[:5]


def _regulatory_recency_boost(provider_publish_time: Any) -> float:
    if provider_publish_time is None:
        return 0.0
    try:
        ts = float(provider_publish_time)
        published = datetime.fromtimestamp(ts)
    except (TypeError, ValueError, OSError):
        return 0.0

    age_hours = max(0.0, (datetime.now() - published).total_seconds() / 3600.0)
    if age_hours <= 24:
        return 0.12
    if age_hours <= 72:
        return 0.07
    if age_hours <= 168:
        return 0.03
    return 0.0


def _get_series(df: pd.DataFrame, keys: list[str]) -> pd.Series | None:
    for key in keys:
        if key in df.index:
            series = df.loc[key]
            if isinstance(series, pd.Series):
                return pd.to_numeric(series, errors="coerce")
    return None


def _safe_pct_change(curr: float, prev: float) -> float:
    if prev == 0:
        return 0.0
    return (curr - prev) / abs(prev) * 100.0


def _safe_margin(op_income: float, revenue: float) -> float | None:
    if revenue == 0:
        return None
    return (op_income / revenue) * 100.0


def _pick_numeric(row: pd.Series, keys: list[str]) -> float | None:
    for key in keys:
        if key not in row:
            continue
        val = row.get(key)
        if pd.isna(val):
            continue
        try:
            return float(val)
        except (TypeError, ValueError):
            continue
    return None


def _pick_text(row: pd.Series, keys: list[str]) -> str | None:
    for key in keys:
        if key not in row:
            continue
        val = row.get(key)
        if pd.isna(val):
            continue
        s = str(val).strip()
        if s:
            return s
    return None


def _detect_insider_direction(row: pd.Series) -> str:
    combined = " ".join(
        str(row.get(k) or "")
        for k in ["Text", "Transaction", "Description", "Type", "text", "transaction", "type"]
    ).lower()

    if any(w in combined for w in ["buy", "purchase", "acquire", "acquired"]):
        return "buy"
    if any(w in combined for w in ["sell", "sale", "disposed", "disposal"]):
        return "sell"

    shares = _pick_numeric(row, ["Shares", "shares"])
    if shares is not None:
        return "buy" if shares > 0 else "sell"
    return "unknown"


def _insider_materiality(shares: float | None, value: float | None) -> str:
    abs_shares = abs(shares) if shares is not None else 0.0
    abs_value = abs(value) if value is not None else 0.0

    if abs_value >= 50_000_000 or abs_shares >= 1_000_000:
        return "high"
    if abs_value >= 10_000_000 or abs_shares >= 250_000:
        return "medium"
    return "low"


def _quarterly_confidence(rev_qoq: float, ni_qoq: float) -> float:
    # Convert magnitude of joint quarterly move into a bounded confidence score.
    score = min(abs(rev_qoq), 40.0) / 40.0 * 0.45 + min(abs(ni_qoq), 50.0) / 50.0 * 0.55
    return round(max(0.6, min(1.0, score)), 2)


def _margin_streak_confidence(m0: float, m1: float, m2: float) -> float:
    total_improvement = max(0.0, m0 - m2)
    score = min(total_improvement, 8.0) / 8.0
    return round(max(0.6, min(1.0, score)), 2)


def _cache_path(symbol: str) -> Path:
    return CACHE_DIR / f"{symbol}_fundamentals.json"


def _load_cache(symbol: str, max_age_hours: int) -> list[dict[str, Any]] | None:
    path = _cache_path(symbol)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
        ts = datetime.fromisoformat(payload.get("fetched_at"))
        if datetime.now() - ts > timedelta(hours=max_age_hours):
            return None
        data = payload.get("signals")
        return data if isinstance(data, list) else None
    except Exception:
        return None


def _save_cache(symbol: str, signals: list[dict[str, Any]]) -> None:
    path = _cache_path(symbol)
    payload = {
        "symbol": symbol,
        "fetched_at": datetime.now().isoformat(),
        "signals": signals,
    }
    try:
        path.write_text(json.dumps(payload, ensure_ascii=True))
    except Exception:
        pass
