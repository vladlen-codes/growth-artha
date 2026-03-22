from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import uuid
import asyncio

router = APIRouter()

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
    try:
        _jobs[job_id]["status"] = "running"

        # Import here to keep startup fast
        from backend.data.fetcher import fetch_all_ohlc, fetch_bulk_deals, NIFTY50
        from backend.signals.scorer import score_all_signals
        from backend.patterns.detector import detect_patterns_all
        from backend.ai.gemini_client import generate_signal_card

        # Step 1: fetch data
        symbols = NIFTY50
        ohlc_data = fetch_all_ohlc(symbols)
        bulk_deals = fetch_bulk_deals()

        # Step 2: detect patterns
        patterns = detect_patterns_all(ohlc_data)

        # Step 3: score signals
        signals = score_all_signals(
            ohlc_data=ohlc_data,
            bulk_deals=bulk_deals,
            patterns=patterns,
            portfolio=request.portfolio
        )

        # Step 4: generate AI cards for top 10 signals only
        # (don't call Gemini for every stock — rate limits)
        top_signals = signals[:10]
        for signal in top_signals:
            signal["ai_card"] = generate_signal_card(signal)

        # Step 5: split into three buckets
        act    = [s for s in signals if s["score"] >= 0.65][:3]
        watch  = [s for s in signals if 0.35 <= s["score"] < 0.65][:5]
        exit_r = [s for s in signals if s["score"] < 0][:3]

        _jobs[job_id] = {
            "status": "done",
            "result": {
                "act": act,
                "watch": watch,
                "exit_radar": exit_r,
                "total_scanned": len(symbols),
                "total_signals": len(signals),
            },
            "error": None
        }

    except Exception as e:
        _jobs[job_id] = {"status": "error", "result": None, "error": str(e)}
        raise