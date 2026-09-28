"""Async processing worker.

Runs the AI pipeline off the request thread and updates the processing_jobs row
so the frontend sees real, resumable progress (spec §14/§15/§47). Offline this
uses FastAPI BackgroundTasks; the same entrypoint can be driven by a real queue
worker (Supabase/Celery) later without changing the pipeline.
"""
from __future__ import annotations

import logging
import time

from .. import store
from ..ai import pipeline

logger = logging.getLogger("subli.worker")


def process_video(job_id: str, video_id: str, owner_id: str,
                  storage_path: str, mode: str) -> None:
    def progress(stage: str, pct: int) -> None:
        store.update("processing_jobs", job_id, owner_id,
                     {"status": "running", "stage": stage,
                      "progress": pct, "updated_at": time.time()})

    try:
        store.update("processing_jobs", job_id, owner_id,
                     {"status": "running", "stage": "starting",
                      "progress": 1, "updated_at": time.time()})
        summary = pipeline.run(video_id, owner_id, storage_path, mode, progress)
        store.update("processing_jobs", job_id, owner_id,
                     {"status": "completed", "stage": "done", "progress": 100,
                      "updated_at": time.time()})
        logger.info("Job %s completed: %s", job_id, summary)
    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        current = store.get("processing_jobs", job_id, owner_id) or {}
        store.update("processing_jobs", job_id, owner_id, {
            "status": "failed", "error_code": type(exc).__name__,
            "error_message": str(exc)[:500],
            "failed_stage": current.get("stage"),
            "updated_at": time.time()})
