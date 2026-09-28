"""Video upload, processing-job creation, and job status.

Offline: video bytes are streamed to local private storage; processing runs via
FastAPI BackgroundTasks. Status is polled at /videos/jobs/{id} (the same shape
the frontend will get from Supabase Realtime later).
"""
from __future__ import annotations

import time
from pathlib import Path

from fastapi import (APIRouter, BackgroundTasks, Depends, File, Form,
                     HTTPException, UploadFile)

from .. import config, store
from ..deps import current_user_id
from ..worker.processor import process_video

router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("/upload")
def upload_video(
    background: BackgroundTasks,
    project_id: str = Form(...),
    mode: str = Form("balanced"),
    file: UploadFile = File(...),
    uid: str = Depends(current_user_id),
):
    if not store.get("projects", project_id, uid):
        raise HTTPException(status_code=404, detail="Project not found.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in config.ALLOWED_VIDEO_EXTS:
        raise HTTPException(status_code=400,
                            detail=f"Unsupported file type '{ext or 'unknown'}'.")
    if mode not in config.SAMPLING_MODES:
        mode = "balanced"

    # Stream to private per-user storage with a size cap (backend validation, §13).
    dest_dir = config.VIDEO_DIR / uid / project_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    now = time.time()
    video_id = store.insert("videos", {
        "project_id": project_id, "owner_id": uid,
        "storage_path": "", "original_name": file.filename,
        "created_at": now})
    dest = dest_dir / f"{video_id}{ext}"

    size = 0
    try:
        with open(dest, "wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > config.MAX_UPLOAD_BYTES:
                    raise ValueError("File exceeds maximum allowed size.")
                out.write(chunk)
    except ValueError as exc:
        _safe_unlink(dest)
        store.delete("videos", video_id, uid)
        raise HTTPException(status_code=413, detail=str(exc))

    fmt = ext.lstrip(".")
    store.update("videos", video_id, uid,
                 {"storage_path": str(dest), "size_bytes": size, "format": fmt})

    # Real Supabase Storage: also upload the video to a private bucket. The local
    # copy is kept for the CV pipeline and for fast serving during the session.
    if not config.OFFLINE_MODE:
        from .. import supa
        key = f"{uid}/{project_id}/{video_id}.{fmt}"
        supa.upload_file(supa.VIDEO_BUCKET, key, str(dest), f"video/{fmt}")

    job_id = store.insert("processing_jobs", {
        "video_id": video_id, "owner_id": uid, "status": "queued",
        "stage": "queued", "progress": 0, "mode": mode,
        "created_at": now, "updated_at": now})

    background.add_task(process_video, job_id, video_id, uid, str(dest), mode)
    return {"video_id": video_id, "job_id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
def job_status(job_id: str, uid: str = Depends(current_user_id)):
    job = store.get("processing_jobs", job_id, uid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, background: BackgroundTasks,
              uid: str = Depends(current_user_id)):
    job = store.get("processing_jobs", job_id, uid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    video = store.get("videos", job["video_id"], uid)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")
    store.update("processing_jobs", job_id, uid,
                 {"status": "queued", "stage": "queued", "progress": 0,
                  "error_code": None, "error_message": None, "failed_stage": None,
                  "updated_at": time.time()})
    background.add_task(process_video, job_id, video["id"], uid,
                        video["storage_path"], job.get("mode", "balanced"))
    return {"status": "queued", "job_id": job_id}


def _safe_unlink(path) -> None:
    try:
        Path(path).unlink()
    except OSError:
        pass
