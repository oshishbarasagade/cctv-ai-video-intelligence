"""Evidence board (spec §32): add/list/remove important moments per project."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException

from .. import store
from ..deps import current_user_id
from ..schemas import EvidenceCreate

router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.post("")
def add(body: EvidenceCreate, uid: str = Depends(current_user_id)):
    if not store.get("projects", body.project_id, uid):
        raise HTTPException(status_code=404, detail="Project not found.")
    eid = store.insert("evidence", {
        "project_id": body.project_id, "video_id": body.video_id,
        "owner_id": uid, "ts": body.ts, "frame_path": body.frame_path,
        "event_id": body.event_id, "description": body.description,
        "confidence": body.confidence, "created_at": time.time()})
    return store.get("evidence", eid, uid)


@router.get("/{project_id}")
def list_evidence(project_id: str, uid: str = Depends(current_user_id)):
    return {"evidence": store.list_where("evidence", uid, "project_id=?",
                                         (project_id,), "created_at asc")}


@router.delete("/{evidence_id}")
def remove(evidence_id: str, uid: str = Depends(current_user_id)):
    if not store.get("evidence", evidence_id, uid):
        raise HTTPException(status_code=404, detail="Evidence not found.")
    store.delete("evidence", evidence_id, uid)
    return {"status": "success"}
