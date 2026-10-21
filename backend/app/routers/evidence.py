"""Evidence board 2.0 (spec §32 / §8): add/list/update/remove with notes, tags,
titles, and ordering. Persisted per project."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException

from .. import store
from ..deps import current_user_id
from ..schemas import EvidenceCreate, EvidenceUpdate

router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.post("")
def add(body: EvidenceCreate, uid: str = Depends(current_user_id)):
    if not store.get("projects", body.project_id, uid):
        raise HTTPException(status_code=404, detail="Project not found.")
    n = store.count("evidence", uid, "project_id=?", (body.project_id,))
    base = {"project_id": body.project_id, "video_id": body.video_id,
            "owner_id": uid, "ts": body.ts, "frame_path": body.frame_path,
            "event_id": body.event_id, "description": body.description,
            "confidence": body.confidence, "created_at": time.time()}
    full = {**base, "title": body.title, "note": body.note,
            "tags": body.tags, "sort": n}
    try:
        eid = store.insert("evidence", full)
    except Exception:
        # Evidence 2.0 columns not migrated yet — degrade gracefully.
        eid = store.insert("evidence", base)
    return store.get("evidence", eid, uid)


@router.get("/{project_id}")
def list_evidence(project_id: str, uid: str = Depends(current_user_id)):
    try:
        rows = store.list_where("evidence", uid, "project_id=?", (project_id,), "sort asc")
    except Exception:
        rows = store.list_where("evidence", uid, "project_id=?", (project_id,), "created_at asc")
    return {"evidence": rows}


@router.patch("/{evidence_id}")
def update_evidence(evidence_id: str, body: EvidenceUpdate,
                    uid: str = Depends(current_user_id)):
    if not store.get("evidence", evidence_id, uid):
        raise HTTPException(status_code=404, detail="Evidence not found.")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        store.update("evidence", evidence_id, uid, patch)
    return store.get("evidence", evidence_id, uid)


@router.post("/reorder")
def reorder(body: dict, uid: str = Depends(current_user_id)):
    """body: { ids: [evidence_id, ...] } in the desired order."""
    for i, eid in enumerate(body.get("ids") or []):
        if store.get("evidence", eid, uid):
            store.update("evidence", eid, uid, {"sort": i})
    return {"status": "success"}


@router.delete("/{evidence_id}")
def remove(evidence_id: str, uid: str = Depends(current_user_id)):
    if not store.get("evidence", evidence_id, uid):
        raise HTTPException(status_code=404, detail="Evidence not found.")
    store.delete("evidence", evidence_id, uid)
    return {"status": "success"}
