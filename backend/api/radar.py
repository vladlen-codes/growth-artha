from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid
import asyncio
import numpy as np

router = APIRouter()


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

class RadarRequest(BaseModel):
    portfolio: Optional[list[str]] = []   # list of symbols user holds
    universe: Optional[str] = "nifty50"  # which stock universe to scan

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
        return {"signals": [], "message": "No scan run yet. POST to /api/radar/run"}
    return completed[-1]["result"]

async def _run_radar_job(job_id: str, request: RadarRequest):
    """Now delegates entirely to the multi-agent orchestrator."""
    try:
        _jobs[job_id]["status"] = "running"

        from backend.agents.orchestrator import GrowthArthaOrchestrator
        from backend.data.fetcher import NIFTY50

        orchestrator = GrowthArthaOrchestrator()
        result = orchestrator.run(
            portfolio=request.portfolio,
            symbols=NIFTY50
        )

        _jobs[job_id] = {
            "status": "done",
            "result": _sanitize(result),
            "error":  None
        }

    except Exception as e:
        _jobs[job_id] = {"status": "error", "result": None, "error": str(e)}
        raise


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