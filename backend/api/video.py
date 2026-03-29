from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
import json
import uuid
import shutil
import subprocess
import threading
import time

from backend.api.radar import _load_latest_result, _jobs

router = APIRouter()
_DATA_CACHE_DIR = Path("data/cache")
_VIDEO_DIR = _DATA_CACHE_DIR / "videos"
_JOBS_FILE = _DATA_CACHE_DIR / "video_jobs.json"

_DATA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
_JOB_LOCK = threading.Lock()
_MAX_CONCURRENT_VIDEO_JOBS = 2
_VIDEO_JOB_SEMAPHORE = threading.Semaphore(_MAX_CONCURRENT_VIDEO_JOBS)


class VideoPlanRequest(BaseModel):
    template: str = "daily_wrap"  # daily_wrap | movers
    duration_seconds: int = 45
    portfolio: list[str] = []


class VideoJobRequest(VideoPlanRequest):
    title: str = "Growth Artha Render"
    render_mode: str = "auto"  # auto | mp4 | json


def _load_video_jobs() -> dict[str, dict]:
    if not _JOBS_FILE.exists():
        return {}
    try:
        data = json.loads(_JOBS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_video_jobs(jobs: dict[str, dict]) -> None:
    _JOBS_FILE.write_text(json.dumps(jobs, ensure_ascii=True, indent=2), encoding="utf-8")


_video_jobs: dict[str, dict] = _load_video_jobs()


def _get_job(job_id: str) -> dict:
    job = _video_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Video job not found")
    return job


def _update_job(job_id: str, **updates) -> dict:
    with _JOB_LOCK:
        existing = dict(_video_jobs.get(job_id) or {})
        existing.setdefault("job_id", job_id)
        existing.update(updates)
        _video_jobs[job_id] = existing
        _save_video_jobs(_video_jobs)
        return existing


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _latest_scan() -> dict:
    completed = [j for j in _jobs.values() if j.get("status") == "done"]
    if completed:
        return completed[-1].get("result") or {}
    return _load_latest_result() or {}


def _scene(title: str, narration: str, visual: str, seconds: int) -> dict:
    return {
        "title": title,
        "narration": narration,
        "visual": visual,
        "seconds": seconds,
    }


def _build_daily_wrap(scan: dict, duration_seconds: int, portfolio: list[str]) -> dict:
    act = (scan.get("act") or [])[:3]
    watch = (scan.get("watch") or [])[:3]
    risks = (scan.get("exit_radar") or [])[:3]

    act_syms = [s.get("symbol") for s in act if isinstance(s, dict) and s.get("symbol")]
    watch_syms = [s.get("symbol") for s in watch if isinstance(s, dict) and s.get("symbol")]
    risk_syms = [s.get("symbol") for s in risks if isinstance(s, dict) and s.get("symbol")]

    pset = {p.upper() for p in portfolio}
    portfolio_hits = [s for s in act_syms + watch_syms + risk_syms if s and s.upper() in pset]

    base_scene_len = max(8, duration_seconds // 4)
    scenes = [
        _scene(
            "Market Pulse",
            f"Today's radar scanned {scan.get('total_scanned', 0)} stocks and found {scan.get('total_signals', 0)} actionable signals.",
            "Title card with total scanned and signal counts",
            base_scene_len,
        ),
        _scene(
            "Top Opportunities",
            f"Act bucket leaders: {', '.join(act_syms) if act_syms else 'none today'}.",
            "Top 3 Act symbols with score bars",
            base_scene_len,
        ),
        _scene(
            "Watchlist Setup",
            f"Watch names: {', '.join(watch_syms) if watch_syms else 'none today'}.",
            "Watch bucket cards with trend arrows",
            base_scene_len,
        ),
        _scene(
            "Risk Radar",
            f"Exit-risk names: {', '.join(risk_syms) if risk_syms else 'none today'}. Portfolio overlaps: {', '.join(portfolio_hits) if portfolio_hits else 'none'}.",
            "Risk list and portfolio overlap highlights",
            duration_seconds - (base_scene_len * 3),
        ),
    ]

    return {
        "template": "daily_wrap",
        "headline": "Growth Artha Daily Wrap",
        "scenes": scenes,
    }


def _build_movers(scan: dict, duration_seconds: int) -> dict:
    all_rows = []
    for bucket in ("act", "watch", "exit_radar"):
        rows = scan.get(bucket) or []
        if isinstance(rows, list):
            for r in rows:
                if isinstance(r, dict):
                    row = dict(r)
                    row["bucket"] = bucket
                    all_rows.append(row)

    ranked = sorted(all_rows, key=lambda r: abs(float(r.get("score", 0) or 0)), reverse=True)[:5]
    names = [r.get("symbol") for r in ranked if r.get("symbol")]

    base_scene_len = max(8, duration_seconds // 3)
    scenes = [
        _scene(
            "Top Movers",
            f"Highest-conviction movers today: {', '.join(names) if names else 'none'}.",
            "Ranked mover list by absolute score",
            base_scene_len,
        ),
        _scene(
            "Momentum vs Risk",
            "We compare positive and negative conviction buckets to balance opportunity and downside.",
            "Split chart: positive vs negative score distribution",
            base_scene_len,
        ),
        _scene(
            "Closing Take",
            "Use these signals as a watchlist accelerator, not blind recommendations.",
            "Outro card with next scan reminder",
            duration_seconds - (base_scene_len * 2),
        ),
    ]

    return {
        "template": "movers",
        "headline": "Growth Artha Movers Board",
        "scenes": scenes,
    }


def _build_storyboard_payload(request: VideoPlanRequest) -> dict:
    scan = _latest_scan()
    duration = max(30, min(request.duration_seconds, 90))

    if request.template == "movers":
        payload = _build_movers(scan, duration)
    else:
        payload = _build_daily_wrap(scan, duration, request.portfolio)

    return {
        "created_at": datetime.now().isoformat(),
        "duration_seconds": duration,
        "scan_timestamp": scan.get("scanned_at"),
        "storyboard": payload,
        "render_manifest": {
            "status": "planned",
            "format": "mp4",
            "resolution": "1080x1920",
            "audio": "tts_narration_pending",
            "notes": "Phase 2 initial pipeline: storyboard + render manifest only",
        },
    }


def _sanitize_text(text: str, max_len: int = 70) -> str:
    raw = (text or "").replace("\n", " ").strip()
    clipped = raw[:max_len]
    return "".join(ch for ch in clipped if ch.isalnum() or ch in " .,:;!?+-_/()[]")


def _render_storyboard_mp4(storyboard_payload: dict, output_path: Path) -> None:
    storyboard = storyboard_payload.get("storyboard") if isinstance(storyboard_payload, dict) else {}
    scenes = storyboard.get("scenes") if isinstance(storyboard, dict) else []
    headline = _sanitize_text((storyboard.get("headline") if isinstance(storyboard, dict) else "") or "Growth Artha Daily Video", 50)
    scene = scenes[0] if isinstance(scenes, list) and scenes else {}
    scene_title = _sanitize_text(str(scene.get("title") or "Market Snapshot"), 45)
    scene_line = _sanitize_text(str(scene.get("narration") or "Signals generated from latest radar scan"), 70)

    total_sec = int(storyboard_payload.get("duration_seconds") or 45)
    duration = max(6, min(total_sec, 90))

    if not _ffmpeg_available():
        raise RuntimeError("ffmpeg is not available on this host")

    draw_filter = (
        "drawtext=fontsize=48:fontcolor=white:x=(w-text_w)/2:y=240:text='{}',"
        "drawtext=fontsize=34:fontcolor=0x16C97B:x=(w-text_w)/2:y=360:text='{}',"
        "drawtext=fontsize=24:fontcolor=white:x=(w-text_w)/2:y=430:text='{}'"
    ).format(headline.replace("'", ""), scene_title.replace("'", ""), scene_line.replace("'", ""))

    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=#0B1220:s=1080x1920:d={duration}",
        "-vf",
        draw_filter,
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        str(output_path),
    ]
    completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if completed.returncode != 0 or not output_path.exists():
        raise RuntimeError((completed.stderr or completed.stdout or "ffmpeg failed").strip()[:400])


def _render_storyboard_json(storyboard_payload: dict, output_path: Path) -> None:
    output_path.write_text(json.dumps(storyboard_payload, ensure_ascii=True, indent=2), encoding="utf-8")


def _pick_render_mode(requested: str) -> str:
    mode = (requested or "auto").strip().lower()
    if mode not in ("auto", "mp4", "json"):
        return "auto"
    return mode


def _execute_video_job(job_id: str) -> dict:
    job = _get_job(job_id)
    req_payload = dict(job.get("request", {}))
    req = VideoPlanRequest(**req_payload)
    requested_mode = _pick_render_mode(str(req_payload.get("render_mode") or "auto"))
    storyboard = _build_storyboard_payload(req)

    rendered_mode = requested_mode
    if requested_mode == "auto":
        rendered_mode = "mp4" if _ffmpeg_available() else "json"

    if rendered_mode == "mp4":
        artifact_path = _VIDEO_DIR / f"{job_id}.mp4"
        _render_storyboard_mp4(storyboard, artifact_path)
        artifact_format = "mp4"
    else:
        artifact_path = _VIDEO_DIR / f"{job_id}.json"
        _render_storyboard_json(storyboard, artifact_path)
        artifact_format = "json"

    return {
        "finished_at": datetime.now().isoformat(),
        "artifact_path": str(artifact_path),
        "artifact_format": artifact_format,
        "render_mode": requested_mode,
        "rendered_mode": rendered_mode,
        "download_url": f"/api/video/jobs/{job_id}/download",
        "error": None,
    }


def _can_retry(job: dict) -> bool:
    if not isinstance(job, dict):
        return False
    status = str(job.get("status") or "").lower()
    attempts = int(job.get("attempt_count") or 0)
    max_attempts = int(job.get("max_attempts") or 2)
    return status == "error" and attempts < max_attempts


def _run_video_job(job_id: str) -> None:
    if job_id not in _video_jobs:
        return

    _VIDEO_JOB_SEMAPHORE.acquire()
    try:
        job = _update_job(job_id, status="running", started_at=datetime.now().isoformat())
        max_attempts = int(job.get("max_attempts") or 2)
        attempt = int(job.get("attempt_count") or 0)

        while attempt < max_attempts:
            if str(_video_jobs.get(job_id, {}).get("status") or "").lower() == "cancelled":
                return

            attempt += 1
            _update_job(job_id, attempt_count=attempt)
            try:
                result = _execute_video_job(job_id)
                _update_job(job_id, status="done", **result)
                return
            except Exception as exc:
                is_last = attempt >= max_attempts
                _update_job(
                    job_id,
                    status="error" if is_last else "retrying",
                    finished_at=datetime.now().isoformat() if is_last else None,
                    error=str(exc),
                    last_error_at=datetime.now().isoformat(),
                )
                if is_last:
                    return
                time.sleep(min(2 ** attempt, 4))
    finally:
        _VIDEO_JOB_SEMAPHORE.release()


@router.post("/storyboard")
def create_storyboard(request: VideoPlanRequest):
    return _build_storyboard_payload(request)


@router.post("/jobs")
def create_video_job(request: VideoJobRequest, background_tasks: BackgroundTasks):
    render_mode = _pick_render_mode(request.render_mode)
    job_id = f"video_{uuid.uuid4().hex[:10]}"
    _update_job(job_id, **{
        "status": "queued",
        "created_at": datetime.now().isoformat(),
        "request": {**request.model_dump(), "render_mode": render_mode},
        "title": request.title,
        "started_at": None,
        "attempt_count": 0,
        "max_attempts": 2,
        "render_mode": render_mode,
        "rendered_mode": None,
        "artifact_path": None,
        "artifact_format": None,
        "download_url": None,
    })
    background_tasks.add_task(_run_video_job, job_id)
    return {
        "job_id": job_id,
        "status": "queued",
        "render_mode": render_mode,
        "message": "Video render job accepted",
    }


@router.get("/jobs")
def list_video_jobs(limit: int = 20):
    ordered = sorted(
        _video_jobs.values(),
        key=lambda j: str(j.get("created_at") or ""),
        reverse=True,
    )
    lim = max(1, min(int(limit or 20), 100))
    return {"jobs": ordered[:lim]}


@router.get("/jobs/{job_id}")
def get_video_job(job_id: str):
    return _get_job(job_id)


@router.post("/jobs/{job_id}/retry")
def retry_video_job(job_id: str, background_tasks: BackgroundTasks):
    job = _get_job(job_id)
    if not _can_retry(job):
        raise HTTPException(status_code=409, detail="Video job is not retryable")

    _update_job(
        job_id,
        status="queued",
        started_at=None,
        finished_at=None,
        artifact_path=None,
        artifact_format=None,
        download_url=None,
        rendered_mode=None,
    )
    background_tasks.add_task(_run_video_job, job_id)
    return {"job_id": job_id, "status": "queued", "message": "Retry scheduled"}


@router.post("/jobs/{job_id}/cancel")
def cancel_video_job(job_id: str):
    job = _get_job(job_id)
    status = str(job.get("status") or "").lower()
    if status in ("done", "error", "cancelled"):
        raise HTTPException(status_code=409, detail="Video job cannot be cancelled in current state")

    _update_job(job_id, status="cancelled", finished_at=datetime.now().isoformat())
    return {"job_id": job_id, "status": "cancelled"}


@router.get("/jobs/{job_id}/download")
def download_video_job(job_id: str):
    job = _video_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Video job not found")
    if job.get("status") != "done":
        raise HTTPException(status_code=409, detail="Video artifact is not ready")

    artifact_path = Path(str(job.get("artifact_path") or ""))
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Video artifact file not found")

    artifact_format = str(job.get("artifact_format") or artifact_path.suffix.lstrip(".") or "json")
    media_type = "video/mp4" if artifact_format == "mp4" else "application/json"

    return FileResponse(
        str(artifact_path),
        media_type=media_type,
        filename=f"{job_id}.{artifact_format}",
    )
