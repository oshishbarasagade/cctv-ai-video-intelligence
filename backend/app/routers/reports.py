"""Report generation + download (spec §33)."""
from __future__ import annotations

import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from .. import reporting, store
from ..deps import current_user_id

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/{video_id}/generate")
def generate(video_id: str, body: dict | None = None,
             uid: str = Depends(current_user_id)):
    video = store.get("videos", video_id, uid)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")
    sections = (body or {}).get("sections")
    path = reporting.generate(video_id, uid, sections=sections)
    rid = store.insert("reports", {
        "project_id": video["project_id"], "video_id": video_id,
        "owner_id": uid, "storage_path": str(path), "created_at": time.time()})
    return {"report_id": rid, "filename": path.name,
            "download_url": f"/reports/{rid}/download"}


@router.get("/{report_id}/download")
def download(report_id: str, uid: str = Depends(current_user_id)):
    rep = store.get("reports", report_id, uid)
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found.")
    path = Path(rep["storage_path"] or "")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report file missing.")
    media = "application/pdf" if path.suffix == ".pdf" else "text/plain"
    return FileResponse(path, media_type=media, filename=f"subli-report{path.suffix}")
