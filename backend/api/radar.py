from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid
import asyncio
import numpy as np
import json
from pathlib import Path
from datetime import datetime

router = APIRouter()


RADAR_CACHE_FILE = Path("data/cache/latest_radar_result.json")
RADAR_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)


def _sanitize(obj):
    """Recursively convert numpy scalars/arrays to native Python types."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(i) for i in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


# In-memory job store — fine for hackathon
# Replace with SQLite if you need persistence across restarts
_jobs: dict = {}


def _save_latest_result(result: dict) -> None:
    try:
        with open(RADAR_CACHE_FILE, "w") as f:
            json.dump(result, f, default=str)
    except Exception:
        # Cache write failure should never break the API response.
        pass


def _load_latest_result() -> Optional[dict]:
    if not RADAR_CACHE_FILE.exists():
        return None
    try:
        with open(RADAR_CACHE_FILE) as f:
            return json.load(f)
    except Exception:
        return None


def _is_gemini_auth_error(message: str) -> bool:
    msg = (message or "").lower()
    return any(keyword in msg for keyword in [
        "api_key_invalid",
        "api key not found",
        "api key was reported as leaked",
        "invalid api key",
        "generativelanguage.googleapis.com",
        "429",
        "quota",
        "resource_exhausted",
        "permission_denied",
        "gemini api",
        "not retrying"
    ])


def _run_non_ai_radar(portfolio: list[str], symbols: list[str]) -> dict:
    """Fallback radar pipeline that does not depend on Gemini."""
    from backend.data.fetcher import fetch_all_ohlc, fetch_bulk_deals
    from backend.patterns.detector import detect_patterns_all
    from backend.signals.scorer import score_all_signals

    start = datetime.now()
    ohlc_data = fetch_all_ohlc(symbols)
    bulk_deals = fetch_bulk_deals()
    patterns = detect_patterns_all(ohlc_data)
    signals = score_all_signals(
        ohlc_data=ohlc_data,
        bulk_deals=bulk_deals,
        patterns=patterns,
        portfolio=portfolio or []
    )

    act = [s for s in signals if s.get("score", 0) >= 0.65][:6]
    watch = [s for s in signals if 0.35 <= s.get("score", 0) < 0.65][:10]
    exit_radar = [s for s in signals if s.get("score", 0) < 0][:10]
    elapsed = (datetime.now() - start).total_seconds()

    return {
        "act": act,
        "watch": watch,
        "exit_radar": exit_radar,
        "portfolio_brief": "AI summary unavailable due to Gemini key issue.",
        "total_scanned": len(ohlc_data),
        "total_signals": len(signals),
        "elapsed_seconds": round(elapsed, 1),
        "audit_log": [],
        "tool_calls": [],
        "scanned_at": datetime.now().isoformat(),
        "using_non_ai_fallback": True,
    }

class RadarRequest(BaseModel):
    portfolio: list[str] = []   # list of symbols user holds
    universe:  str = "nifty50"   # "nifty50" | "nifty500" | "full"

class RadarJob(BaseModel):
    job_id: str
    status: str   # pending | running | done | error
    result: Optional[dict] = None
    error: Optional[str] = None

@router.post("/run")
async def run_radar(request: RadarRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {"status": "pending", "result": None, "error": None}

    background_tasks.add_task(_run_radar_job, job_id, request)

    return {"job_id": job_id, "status": "pending",
            "message": "Radar scan started. Poll /api/radar/status/" + job_id}

@router.get("/status/{job_id}")
def get_radar_status(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return _jobs[job_id]

@router.get("/latest")
def get_latest_signals():
    completed = [j for j in _jobs.values() if j["status"] == "done"]
    if not completed:
        cached = _load_latest_result()
        if cached:
            return cached
        return {
            "act": [],
            "watch": [],
            "exit_radar": [],
            "total_scanned": 0,
            "total_signals": 0,
            "message": "No scan run yet. POST to /api/radar/run"
        }
    return completed[-1]["result"]

async def _run_radar_job(job_id: str, request: RadarRequest):
    try:
        _jobs[job_id]["status"] = "running"

        if request.universe == "full":
            # Full 4000+ stock scan — use three-tier pipeline
            from backend.agents.orchestrator import run_full_universe
            result = await run_full_universe(portfolio=request.portfolio)
        else:
            # Standard Nifty 50/500 scan — existing pipeline
            from backend.agents.orchestrator import GrowthArthaOrchestrator
            from backend.data.fetcher import NIFTY50
            from backend.data.universe import TIER_2_NIFTY500_EXTRA
            symbols = NIFTY50 if request.universe == "nifty50" \
                      else NIFTY50 + TIER_2_NIFTY500_EXTRA
            orch   = GrowthArthaOrchestrator()
            result = orch.run(portfolio=request.portfolio, symbols=symbols)

        _jobs[job_id] = {"status": "done", "result": _sanitize(result), "error": None}
        _save_latest_result(_jobs[job_id]["result"])

    except Exception as e:
        # Try cached result
        cached = _load_latest_result()
        if cached:
            cached["using_cached_data"] = True
            cached["fallback_reason"] = str(e)
            _jobs[job_id] = {"status": "done", "result": cached, "error": None}
            return

        _jobs[job_id] = {"status": "error", "result": None, "error": str(e)}


@router.get("/audit/{job_id}")
def get_audit_trail(job_id: str):
    """
    Returns the full agent reasoning log for a completed scan.
    Shows every tool call, decision, and result — the agentic audit trail.
    """
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = _jobs[job_id]
    if job["status"] != "done":
        return {"status": job["status"], "audit_log": []}

    return {
        "status":           "done",
        "audit_log":        job["result"].get("audit_log", []),
        "tool_calls":       job["result"].get("tool_calls", []),
        "elapsed_seconds":  job["result"].get("elapsed_seconds")
    }