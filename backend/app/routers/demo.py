"""Demo mode (spec §57): one call seeds a ready-to-explore analysis.

Generates a synthetic surveillance-style clip, runs the pipeline synchronously,
and returns the project/video so 'Try demo' lands straight in the workspace.
The demo data belongs to the calling user (no cross-user access).
"""
from __future__ import annotations

import time

import cv2
import numpy as np

from fastapi import APIRouter, Depends

from .. import config, store
from ..ai import pipeline
from ..deps import current_user_id

router = APIRouter(prefix="/demo", tags=["demo"])


def _make_clip(path: str) -> None:
    w, h, fps, secs = 240, 160, 10, 6
    vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    for i in range(fps * secs):
        # brightness phases (dawn -> day) + a person and a car moving through
        bg = 40 if i < fps else (140 if i < 4 * fps else 210)
        frame = np.full((h, w, 3), bg, np.uint8)
        # a "person" (tall box) walking left->right
        px = int((i / (fps * secs)) * (w - 30))
        cv2.rectangle(frame, (px, 60), (px + 18, 130), (20, 20, 20), -1)
        # a "car" (wide box) appears in the second half
        if i > 3 * fps:
            cx = int(((i - 3 * fps) / (3 * fps)) * (w - 60))
            cv2.rectangle(frame, (cx, 110), (cx + 55, 145), (10, 10, 10), -1)
        vw.write(frame)
    vw.release()


@router.post("/seed")
def seed(uid: str = Depends(current_user_id)):
    now = time.time()
    pid = store.insert("projects", {
        "owner_id": uid, "name": "Demo — Campus Entrance",
        "description": "Sample analysis generated for you to explore.",
        "created_at": now, "updated_at": now})

    dest_dir = config.VIDEO_DIR / uid / pid
    dest_dir.mkdir(parents=True, exist_ok=True)
    video_id = store.insert("videos", {
        "project_id": pid, "owner_id": uid, "storage_path": "",
        "original_name": "campus_entrance_demo.mp4", "created_at": now})
    dest = dest_dir / f"{video_id}.mp4"
    _make_clip(str(dest))
    store.update("videos", video_id, uid,
                 {"storage_path": str(dest), "size_bytes": dest.stat().st_size,
                  "format": "mp4"})

    job_id = store.insert("processing_jobs", {
        "video_id": video_id, "owner_id": uid, "status": "running",
        "stage": "starting", "progress": 1, "mode": "balanced",
        "created_at": now, "updated_at": now})

    def progress(stage, pct):
        store.update("processing_jobs", job_id, uid,
                     {"stage": stage, "progress": pct, "updated_at": time.time()})

    pipeline.run(video_id, uid, str(dest), "balanced", progress)
    store.update("processing_jobs", job_id, uid,
                 {"status": "completed", "stage": "done", "progress": 100})

    return {"project_id": pid, "video_id": video_id}
