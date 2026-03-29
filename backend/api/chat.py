from fastapi import APIRouter
from pydantic import BaseModel
from backend.ai.gemini_client import answer_chat_question
from typing import Any
import re

router = APIRouter()

class ChatRequest(BaseModel):
    question: str
    portfolio: list[str] = []
    session_id: str = ""


def _normalize_signal_rows(signals_blob: Any) -> list[dict]:
    """Flatten radar result shape into a simple list of signal rows."""
    if isinstance(signals_blob, list):
        return [s for s in signals_blob if isinstance(s, dict)]
    if not isinstance(signals_blob, dict):
        return []

    rows: list[dict] = []
    for bucket in ("act", "watch", "exit_radar"):
        bucket_rows = signals_blob.get(bucket, [])
        if isinstance(bucket_rows, list):
            for s in bucket_rows:
                if isinstance(s, dict):
                    enriched = dict(s)
                    # Preserve bucket context for citation rendering.
                    if not enriched.get("bucket"):
                        enriched["bucket"] = bucket
                    rows.append(enriched)
    return rows


def _build_citations(question: str, portfolio: list[str], latest_signals: Any) -> list[dict]:
    rows = _normalize_signal_rows(latest_signals)
    if not rows:
        return []

    q = (question or "").upper()
    portfolio_set = {s.upper() for s in (portfolio or []) if isinstance(s, str)}

    def _is_relevant(row: dict) -> bool:
        sym = str(row.get("symbol", "")).upper()
        if sym and sym in q:
            return True
        if sym and sym in portfolio_set:
            return True
        return False

    relevant = [r for r in rows if _is_relevant(r)]
    if not relevant:
        # Fallback to top ranked signals when we cannot infer direct relevance.
        relevant = sorted(rows, key=lambda r: float(r.get("score", 0) or 0), reverse=True)[:3]

    citations = []
    for row in relevant[:5]:
        signal_rows = row.get("signals", []) if isinstance(row.get("signals"), list) else []
        source_types = []
        if signal_rows:
            source_types = [str(s.get("source_type") or s.get("source") or "unknown") for s in signal_rows if isinstance(s, dict)]
        bucket = row.get("bucket") or row.get("radar_bucket")
        citations.append({
            "symbol": row.get("symbol"),
            "score": row.get("score"),
            "bucket": bucket,
            "reason": row.get("reason") or row.get("headline") or "Signal data from latest radar run",
            "source": "radar.latest",
            "source_type": source_types[0] if source_types else "signal_bundle",
            "source_types": list(dict.fromkeys(source_types))[:4],
            "timestamp": row.get("scanned_at") or row.get("time") or None,
        })
    return citations


def _build_portfolio_impact(portfolio: list[str], latest_signals: Any) -> dict:
    rows = _normalize_signal_rows(latest_signals)
    pset = {s.upper() for s in (portfolio or []) if isinstance(s, str)}

    matching = [r for r in rows if str(r.get("symbol", "")).upper() in pset]
    total = len(pset)
    flagged = len(matching)

    return {
        "portfolio_count": total,
        "flagged_count": flagged,
        "flagged_symbols": [r.get("symbol") for r in matching if r.get("symbol")],
    }


def _detect_analysis_mode(answer: str) -> str:
    text = (answer or "").lower()
    if "unavailable" in text or "encountered an error" in text:
        return "fallback"
    return "ai"


def _evidence_quality(citations: list[dict]) -> str:
    if not citations:
        return "none"

    scores = [abs(float(c.get("score"))) for c in citations if isinstance(c.get("score"), (int, float))]
    max_score = max(scores) if scores else 0.0

    if len(citations) >= 3 and max_score >= 0.65:
        return "high"
    if len(citations) >= 2 and max_score >= 0.50:
        return "medium"
    return "low"


def _guardrail_answer(quality: str) -> str:
    if quality == "none":
        return "No strong radar-linked focus stocks are available yet. Run a fresh scan and ask again."
    return "Evidence is currently limited for a high-confidence call. Review citations and run a fresh scan for stronger convergence."


def _extract_answer_symbols(answer: str) -> set[str]:
    # Keep ticker-like uppercase tokens only; this avoids broad NLP and keeps checks deterministic.
    tokens = re.findall(r"\b[A-Z]{2,10}\b", answer or "")
    return {t for t in tokens if t not in {"AI", "NSE", "BSE", "ETF"}}


def _enforce_claim_support(answer: str, citations: list[dict], portfolio: list[str]) -> tuple[str, bool]:
    mentioned = _extract_answer_symbols(answer)
    if not mentioned:
        return answer, True

    supported = {
        str(c.get("symbol", "")).upper()
        for c in citations
        if isinstance(c, dict) and c.get("symbol")
    }
    supported.update({s.upper() for s in (portfolio or []) if isinstance(s, str)})

    unsupported = sorted([s for s in mentioned if s not in supported])
    if not unsupported:
        return answer, True

    guarded = (
        "Evidence is currently limited for a high-confidence call. "
        "The current response included unsupported symbol claims: "
        f"{', '.join(unsupported[:4])}. Review citations and run a fresh scan."
    )
    return guarded, False


def _build_fallback_answer(question: str, citations: list[dict], portfolio_impact: dict) -> str:
    flagged = portfolio_impact.get("flagged_symbols", []) or []
    flagged_text = ", ".join(flagged[:3]) if flagged else "none in your current holdings"

    if not citations:
        return "No strong radar-linked focus stocks are available yet. Run a fresh scan and ask again."

    top = citations[:3]
    bullets = []
    for c in top:
        symbol = c.get("symbol") or "N/A"
        score = c.get("score")
        bucket = c.get("bucket") or "watch"
        score_text = f"{float(score):.2f}" if isinstance(score, (int, float)) else "n/a"
        bullets.append(f"{symbol} ({bucket}, score {score_text})")

    return (
        f"Top focus stocks from the latest radar: {', '.join(bullets)}. "
        f"Flagged portfolio symbols: {flagged_text}."
    )

@router.post("/ask")
def ask(request: ChatRequest):
    from backend.api.radar import _jobs, _load_latest_result

    # Pull latest signals for context
    completed = [j for j in _jobs.values() if j["status"] == "done"]
    latest_signals = completed[-1]["result"] if completed else {}
    if not latest_signals:
        # Backend restarts clear in-memory jobs; fall back to persisted latest scan.
        latest_signals = _load_latest_result() or {}

    retrieval_plan = _build_retrieval_plan(request.question, request.portfolio, latest_signals)
    context = {
        "portfolio": request.portfolio,
        "signals": latest_signals,
        "retrieval_plan": retrieval_plan,
    }

    citations = _build_citations(request.question, request.portfolio, latest_signals)
    portfolio_impact = _build_portfolio_impact(request.portfolio, latest_signals)
    quality = _evidence_quality(citations)

    answer = answer_chat_question(request.question, context)
    analysis_mode = _detect_analysis_mode(answer)
    if analysis_mode == "fallback":
        answer = _build_fallback_answer(request.question, citations, portfolio_impact) if quality in ("medium", "high") else _guardrail_answer(quality)
    elif quality in ("none", "low"):
        # Even when AI is up, avoid confident wording without enough evidence.
        answer = _guardrail_answer(quality)
        analysis_mode = "fallback"

    # Enforce citation-backed symbol claims to reduce hallucinated ticker mentions.
    answer, claims_supported = _enforce_claim_support(answer, citations, request.portfolio)
    if not claims_supported:
        analysis_mode = "fallback"

    return {
        **_validate_response_schema({
            "answer": answer,
            "citations": citations,
            "analysis_mode": analysis_mode,
            "portfolio_impact": portfolio_impact,
            "evidence_quality": quality,
            "retrieval_plan": retrieval_plan,
        }),
    }


def _build_retrieval_plan(question: str, portfolio: list[str], latest_signals: Any) -> dict:
    q = (question or "").lower()
    rows = _normalize_signal_rows(latest_signals)
    portfolio_set = {s.upper() for s in (portfolio or []) if isinstance(s, str)}

    intent = "general"
    if any(k in q for k in ["why", "explain", "reason", "drivers"]):
        intent = "explain"
    elif any(k in q for k in ["risk", "downside", "danger", "exit"]):
        intent = "risk"
    elif any(k in q for k in ["portfolio", "holdings", "my stocks"]):
        intent = "portfolio"

    bucket_counts = {
        "act": len([r for r in rows if (r.get("bucket") or r.get("radar_bucket")) == "act"]),
        "watch": len([r for r in rows if (r.get("bucket") or r.get("radar_bucket")) == "watch"]),
        "exit_radar": len([r for r in rows if (r.get("bucket") or r.get("radar_bucket")) == "exit_radar"]),
    }

    portfolio_hits = [r.get("symbol") for r in rows if str(r.get("symbol", "")).upper() in portfolio_set]

    return {
        "intent": intent,
        "steps": [
            "retrieve_latest_radar",
            "rank_relevant_signals",
            "map_to_portfolio" if portfolio_set else "skip_portfolio_mapping",
            "build_citations",
            "generate_answer_with_guardrails",
        ],
        "bucket_counts": bucket_counts,
        "portfolio_hits": portfolio_hits[:8],
    }


def _validate_response_schema(payload: dict) -> dict:
    answer = payload.get("answer")
    if not isinstance(answer, str):
        answer = "No strong radar-linked focus stocks are available yet. Run a fresh scan and ask again."

    analysis_mode = payload.get("analysis_mode")
    if analysis_mode not in ("ai", "fallback"):
        analysis_mode = "fallback"

    evidence_quality = payload.get("evidence_quality")
    if evidence_quality not in ("none", "low", "medium", "high"):
        evidence_quality = "none"

    citations_raw = payload.get("citations")
    citations = citations_raw if isinstance(citations_raw, list) else []
    safe_citations = []
    for c in citations[:8]:
        if not isinstance(c, dict):
            continue
        safe_citations.append({
            "symbol": c.get("symbol"),
            "score": c.get("score") if isinstance(c.get("score"), (int, float)) else None,
            "bucket": c.get("bucket"),
            "reason": c.get("reason"),
            "source": c.get("source") or "radar.latest",
            "source_type": c.get("source_type") or "signal_bundle",
            "source_types": c.get("source_types") if isinstance(c.get("source_types"), list) else [],
            "timestamp": c.get("timestamp"),
        })

    p = payload.get("portfolio_impact") if isinstance(payload.get("portfolio_impact"), dict) else {}
    portfolio_impact = {
        "portfolio_count": int(p.get("portfolio_count") or 0),
        "flagged_count": int(p.get("flagged_count") or 0),
        "flagged_symbols": p.get("flagged_symbols") if isinstance(p.get("flagged_symbols"), list) else [],
    }

    retrieval_plan = payload.get("retrieval_plan") if isinstance(payload.get("retrieval_plan"), dict) else {}

    return {
        "answer": answer,
        "citations": safe_citations,
        "analysis_mode": analysis_mode,
        "portfolio_impact": portfolio_impact,
        "evidence_quality": evidence_quality,
        "retrieval_plan": retrieval_plan,
    }