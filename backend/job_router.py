"""
job_router.py — Async video-generation job endpoints for SuperLiving Ad Generator.

This module adds four endpoints to the FastAPI app:

  POST /api/generate-video-async      → returns {job_id} immediately
  POST /api/regenerate-clips-async    → returns {job_id} immediately
  GET  /api/job-status/{job_id}       → returns JobStatus (polled by frontend every 5s)
  GET  /api/cancel-job/{job_id}       → best-effort cancel (marks job as cancelled)

The actual Veo rendering runs in a background thread so the HTTP response
returns instantly — no more browser timeouts.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ─── Job store (in-memory, good for single-process deployments) ──────────────

class JobState(str, Enum):
    PENDING  = "pending"
    RUNNING  = "running"
    DONE     = "done"
    FAILED   = "failed"
    CANCELLED = "cancelled"


@dataclass
class Job:
    job_id: str
    state: JobState = JobState.PENDING
    progress: int = 0          # 0-100
    current_clip: int = 0      # 1-based
    total_clips: int = 0
    message: str = "Queued…"
    video_url: Optional[str] = None
    clip_paths: List[str] = field(default_factory=list)
    error: Optional[str] = None
    cancel_event: threading.Event = field(default_factory=threading.Event)


_jobs: Dict[str, Job] = {}
_jobs_lock = threading.Lock()


def _new_job(total_clips: int) -> Job:
    jid = str(uuid.uuid4())
    job = Job(job_id=jid, total_clips=total_clips)
    with _jobs_lock:
        _jobs[jid] = job
    return job


def _get_job(job_id: str) -> Job:
    with _jobs_lock:
        return _jobs.get(job_id)


# ─── Router ──────────────────────────────────────────────────────────────────

router = APIRouter()


# ── Status schema ─────────────────────────────────────────────────────────────

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: int
    current_clip: int
    total_clips: int
    message: str
    video_url: Optional[str] = None
    clip_paths: Optional[List[str]] = None
    error: Optional[str] = None


@router.get("/api/job-status/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str):
    job = _get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return JobStatusResponse(
        job_id=job.job_id,
        status=job.state.value,
        progress=job.progress,
        current_clip=job.current_clip,
        total_clips=job.total_clips,
        message=job.message,
        video_url=job.video_url,
        clip_paths=job.clip_paths if job.clip_paths else None,
        error=job.error,
    )


@router.get("/api/cancel-job/{job_id}")
def cancel_job(job_id: str):
    job = _get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    job.cancel_event.set()
    job.state = JobState.CANCELLED
    job.message = "Cancelled by user."
    return {"cancelled": True}


# ── Request schemas ───────────────────────────────────────────────────────────

class GenerateVideoRequest(BaseModel):
    clips: List[Dict[str, Any]]
    veo_model: str = "veo-3.1-generate-preview"
    aspect_ratio: str = "9:16"
    num_clips: int = 6


class RegenerateClipsRequest(BaseModel):
    clip_indices: List[int]
    clips: List[Dict[str, Any]]
    clip_paths: List[str]
    veo_model: str = "veo-3.1-generate-preview"
    aspect_ratio: str = "9:16"
    num_clips: int = 6


# ── Async generate-video ──────────────────────────────────────────────────────

@router.post("/api/generate-video-async")
def generate_video_async(req: GenerateVideoRequest):
    """
    Start video generation in a background thread.
    Returns {job_id} immediately — frontend polls /api/job-status/{job_id}.
    """
    job = _new_job(total_clips=req.num_clips)
    thread = threading.Thread(
        target=_run_generate_video,
        args=(job, req),
        daemon=True,
        name=f"veo-job-{job.job_id[:8]}",
    )
    thread.start()
    logger.info(f"Started video generation job {job.job_id} in background thread {thread.name}")
    return {"job_id": job.job_id}


def _run_generate_video(job: Job, req: GenerateVideoRequest):
    """Runs in a background thread. Calls the existing synchronous video pipeline."""
    try:
        job.state = JobState.RUNNING
        job.message = "Initializing Veo clients…"
        job.progress = 2

        # Import here so the router module itself has no hard deps at import time
        from . import video_pipeline   # your existing pipeline module
        # video_pipeline.generate_full_video must accept a progress_callback kwarg:
        #   progress_callback(clip_num: int, total: int, message: str)
        # See the adapter below if your pipeline doesn't have this yet.

        def _progress(clip_num: int, total: int, message: str):
            if job.cancel_event.is_set():
                raise RuntimeError("Job cancelled by user")
            job.current_clip = clip_num
            job.total_clips = total
            job.progress = max(5, int((clip_num - 1) / total * 95)) if total > 0 else 5
            job.message = message
            logger.info(f"[{job.job_id[:8]}] Clip {clip_num}/{total}: {message}")

        result = video_pipeline.generate_full_video(
            clips=req.clips,
            veo_model=req.veo_model,
            aspect_ratio=req.aspect_ratio,
            num_clips=req.num_clips,
            progress_callback=_progress,
        )

        job.video_url  = result["video_url"]
        job.clip_paths = result["clip_paths"]
        job.progress   = 100
        job.message    = "Done! Your ad is ready."
        job.state      = JobState.DONE
        logger.info(f"Job {job.job_id} completed: {result['video_url']}")

    except Exception as exc:
        if job.cancel_event.is_set():
            job.state   = JobState.CANCELLED
            job.message = "Cancelled."
        else:
            job.state   = JobState.FAILED
            job.error   = str(exc)
            job.message = f"Failed: {exc}"
            logger.exception(f"Job {job.job_id} failed")


# ── Async regenerate-clips ────────────────────────────────────────────────────

@router.post("/api/regenerate-clips-async")
def regenerate_clips_async(req: RegenerateClipsRequest):
    job = _new_job(total_clips=len(req.clip_indices))
    thread = threading.Thread(
        target=_run_regenerate_clips,
        args=(job, req),
        daemon=True,
        name=f"veo-regen-{job.job_id[:8]}",
    )
    thread.start()
    logger.info(f"Started clip regen job {job.job_id}: clips {req.clip_indices}")
    return {"job_id": job.job_id}


def _run_regenerate_clips(job: Job, req: RegenerateClipsRequest):
    try:
        job.state   = JobState.RUNNING
        job.message = "Starting clip regeneration…"
        job.progress = 2

        from . import video_pipeline

        def _progress(clip_num: int, total: int, message: str):
            if job.cancel_event.is_set():
                raise RuntimeError("Job cancelled by user")
            job.current_clip = clip_num
            job.total_clips  = total
            job.progress     = max(5, int((clip_num - 1) / total * 95)) if total > 0 else 5
            job.message      = message

        result = video_pipeline.regenerate_clips(
            clip_indices=req.clip_indices,
            clips=req.clips,
            clip_paths=req.clip_paths,
            veo_model=req.veo_model,
            aspect_ratio=req.aspect_ratio,
            num_clips=req.num_clips,
            progress_callback=_progress,
        )

        job.video_url  = result["video_url"]
        job.clip_paths = result["clip_paths"]
        job.progress   = 100
        job.message    = "Done! Clips regenerated."
        job.state      = JobState.DONE

    except Exception as exc:
        if job.cancel_event.is_set():
            job.state   = JobState.CANCELLED
            job.message = "Cancelled."
        else:
            job.state   = JobState.FAILED
            job.error   = str(exc)
            job.message = f"Failed: {exc}"
            logger.exception(f"Regen job {job.job_id} failed")


# ─────────────────────────────────────────────────────────────────────────────
# HOW TO WIRE THIS INTO YOUR EXISTING main.py / app.py
# ─────────────────────────────────────────────────────────────────────────────
#
# In your main FastAPI app file, add:
#
#   from job_router import router as job_router
#   app.include_router(job_router)
#
# Then add progress_callback support to your existing pipeline function.
# If your pipeline function is a long loop like:
#
#   def generate_full_video(clips, veo_model, aspect_ratio, num_clips):
#       for i, clip in enumerate(clips):
#           ... render clip i ...
#       return {"video_url": ..., "clip_paths": ...}
#
# Just add the callback parameter and call it at the start of each clip:
#
#   def generate_full_video(clips, veo_model, aspect_ratio, num_clips,
#                           progress_callback=None):
#       for i, clip in enumerate(clips):
#           if progress_callback:
#               progress_callback(i + 1, len(clips), f"Rendering clip {i+1} of {len(clips)}…")
#           ... render clip i ...
#       return {"video_url": ..., "clip_paths": ...}
#
# ─────────────────────────────────────────────────────────────────────────────