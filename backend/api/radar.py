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
RADAR_JOBS_FILE = Path("data/cache/radar_jobs.json")
RADAR_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)


def _sanitize(obj):
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

_jobs: dict = {}

def _save_jobs() -> None:
    try:
        payload = {
            "updated_at": datetime.now().isoformat(),
            "jobs": _sanitize(_jobs),
        }
        tmp = RADAR_JOBS_FILE.with_suffix(".json.tmp")
        with open(tmp, "w") as f:
            json.dump(payload, f, default=str)
        tmp.replace(RADAR_JOBS_FILE)
    except Exception:
        pass


def _load_jobs() -> dict:
    if not RADAR_JOBS_FILE.exists():
        return {}
    try:
        with open(RADAR_JOBS_FILE) as f:
            payload = json.load(f)
        jobs = payload.get("jobs", {}) if isinstance(payload, dict) else {}
        return jobs if isinstance(jobs, dict) else {}
    except Exception:
        return {}


def _prune_jobs(max_jobs: int = 120) -> None:
    if len(_jobs) <= max_jobs:
        return
    # Keep most recent jobs first by scanned_at if available.
    def _job_sort_key(item):
        job = item[1] if isinstance(item, tuple) else {}
        result = job.get("result") if isinstance(job, dict) else {}
        return (result or {}).get("scanned_at", "")

    keep = sorted(_jobs.items(), key=_job_sort_key, reverse=True)[:max_jobs]
    _jobs.clear()
    _jobs.update({k: v for k, v in keep})


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


# Load persisted jobs on module import.
_jobs.update(_load_jobs())


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
    from backend.data.fetcher import fetch_all_ohlc, fetch_bulk_deals
    from backend.patterns.detector import detect_patterns_all
    from backend.signals.scorer import score_all_signals

    start = datetime.now()
    audit_log: list[dict] = []
    tool_calls: list[dict] = []

    def _step(step: str, detail: str):
        audit_log.append({
            "time": datetime.now().isoformat(),
            "agent": "FallbackPipeline",
            "message": f"{step}: {detail}",
        })

    def _tool(tool: str, started_at: datetime, status: str, summary: str):
        elapsed_ms = int((datetime.now() - started_at).total_seconds() * 1000)
        tool_calls.append({
            "tool": tool,
            "status": status,
            "result_summary": summary,
            "elapsed_ms": elapsed_ms,
        })

    _step("start", "Gemini unavailable, switching to deterministic fallback pipeline")

    t = datetime.now()
    ohlc_data = fetch_all_ohlc(symbols)
    _tool("fetch_all_ohlc", t, "success", f"Fetched OHLC for {len(ohlc_data)} symbols")

    t = datetime.now()
    bulk_deals = fetch_bulk_deals()
    _tool("fetch_bulk_deals", t, "success", f"Fetched {len(bulk_deals)} bulk deal rows")

    t = datetime.now()
    patterns = detect_patterns_all(ohlc_data)
    pattern_count = sum(len(v) for v in patterns.values())
    _tool("detect_patterns_all", t, "success", f"Detected {pattern_count} patterns across {len(patterns)} symbols")

    t = datetime.now()
    signals = score_all_signals(
        ohlc_data=ohlc_data,
        bulk_deals=bulk_deals,
        patterns=patterns,
        portfolio=portfolio or []
    )
    _tool("score_all_signals", t, "success", f"Scored {len(signals)} symbols")

    act = [s for s in signals if s.get("score", 0) >= 0.65][:6]
    watch = [s for s in signals if 0.35 <= s.get("score", 0) < 0.65][:10]
    exit_radar = [s for s in signals if s.get("score", 0) < 0][:10]
    elapsed = (datetime.now() - start).total_seconds()

    _step("bucket", f"Act={len(act)}, Watch={len(watch)}, Exit={len(exit_radar)}")
    _step("done", f"Fallback scan completed in {round(elapsed, 1)}s")

    return {
        "act": act,
        "watch": watch,
        "exit_radar": exit_radar,
        "portfolio_brief": "AI summary unavailable due to Gemini key issue.",
        "total_scanned": len(ohlc_data),
        "total_signals": len(signals),
        "elapsed_seconds": round(elapsed, 1),
        "audit_log": audit_log,
        "tool_calls": tool_calls,
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
    _jobs[job_id] = {
        "status": "pending",
        "result": None,
        "error": None,
        "created_at": datetime.now().isoformat(),
    }
    _prune_jobs()
    _save_jobs()

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


@router.get("/jobs")
def list_recent_jobs(limit: int = 20):
    """List recent radar jobs so older audits can be reopened after restarts."""
    safe_limit = max(1, min(limit, 100))

    def _sort_key(item):
        job = item[1] if isinstance(item, tuple) else {}
        result = job.get("result") if isinstance(job, dict) else {}
        return (
            (result or {}).get("scanned_at")
            or job.get("finished_at")
            or job.get("started_at")
            or job.get("created_at")
            or ""
        )

    ordered = sorted(_jobs.items(), key=_sort_key, reverse=True)
    jobs = []
    for job_id, job in ordered[:safe_limit]:
        result = (job or {}).get("result") or {}
        jobs.append({
            "job_id": job_id,
            "status": job.get("status"),
            "created_at": job.get("created_at"),
            "started_at": job.get("started_at"),
            "finished_at": job.get("finished_at"),
            "scanned_at": result.get("scanned_at"),
            "total_scanned": result.get("total_scanned", 0),
            "total_signals": result.get("total_signals", 0),
            "using_cached_data": result.get("using_cached_data", False),
            "using_non_ai_fallback": result.get("using_non_ai_fallback", False),
        })

    return {"jobs": jobs, "count": len(jobs)}

async def _run_radar_job(job_id: str, request: RadarRequest):
    try:
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["started_at"] = datetime.now().isoformat()
        _save_jobs()

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

        _jobs[job_id] = {
            "status": "done",
            "result": _sanitize(result),
            "error": None,
            "created_at": _jobs[job_id].get("created_at"),
            "started_at": _jobs[job_id].get("started_at"),
            "finished_at": datetime.now().isoformat(),
        }
        _save_latest_result(_jobs[job_id]["result"])
        _prune_jobs()
        _save_jobs()

    except Exception as e:
        from backend.data.fetcher import NIFTY50
        from backend.data.universe import TIER_2_NIFTY500_EXTRA

        symbols = NIFTY50 if request.universe == "nifty50" \
            else NIFTY50 + TIER_2_NIFTY500_EXTRA if request.universe == "nifty500" \
            else NIFTY50

        try:
            fallback = _run_non_ai_radar(request.portfolio, symbols)
            fallback["fallback_reason"] = str(e)
            fallback["fallback_trigger"] = (
                "gemini_auth_or_quota" if _is_gemini_auth_error(str(e)) else "orchestrator_error"
            )

            _jobs[job_id] = {
                "status": "done",
                "result": _sanitize(fallback),
                "error": None,
                "created_at": _jobs[job_id].get("created_at"),
                "started_at": _jobs[job_id].get("started_at"),
                "finished_at": datetime.now().isoformat(),
            }
            _save_latest_result(_jobs[job_id]["result"])
            _prune_jobs()
            _save_jobs()
            return
        except Exception as fallback_error:
            # If deterministic fallback itself fails, try cached result.
            e = Exception(f"Primary error: {e}; Fallback error: {fallback_error}")

        # Try cached result
        cached = _load_latest_result()
        if cached:
            cached["using_cached_data"] = True
            cached["fallback_reason"] = str(e)
            _jobs[job_id] = {
                "status": "done",
                "result": cached,
                "error": None,
                "created_at": _jobs[job_id].get("created_at"),
                "started_at": _jobs[job_id].get("started_at"),
                "finished_at": datetime.now().isoformat(),
            }
            _prune_jobs()
            _save_jobs()
            return

        _jobs[job_id] = {
            "status": "error",
            "result": None,
            "error": str(e),
            "created_at": _jobs[job_id].get("created_at"),
            "started_at": _jobs[job_id].get("started_at"),
            "finished_at": datetime.now().isoformat(),
        }
        _prune_jobs()
        _save_jobs()


@router.get("/audit/{job_id}")
def get_audit_trail(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = _jobs[job_id]
    if job["status"] != "done":
        return {"status": job["status"], "audit_log": []}

    return {
        "status":           "done",
        "audit_log":        job["result"].get("audit_log", []),
        "tool_calls":       job["result"].get("tool_calls", []),
        "elapsed_seconds":  job["result"].get("elapsed_seconds"),
        "using_cached_data": job["result"].get("using_cached_data", False),
        "using_non_ai_fallback": job["result"].get("using_non_ai_fallback", False),
        "fallback_reason": job["result"].get("fallback_reason")
    }