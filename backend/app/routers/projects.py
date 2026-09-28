"""Project CRUD + dashboard metrics. All scoped to the authenticated user."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException

from .. import store
from ..deps import current_user_id
from ..schemas import ProjectCreate, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
def list_projects(uid: str = Depends(current_user_id)):
    projects = store.list_where("projects", uid, order="created_at desc")
    for p in projects:
        p["video_count"] = store.count("videos", uid, "project_id=?", (p["id"],))
        p["event_count"] = _events_in_project(uid, p["id"])
    return {"projects": projects}


@router.post("")
def create_project(body: ProjectCreate, uid: str = Depends(current_user_id)):
    now = time.time()
    pid = store.insert("projects", {
        "owner_id": uid, "name": body.name, "description": body.description,
        "created_at": now, "updated_at": now})
    return store.get("projects", pid, uid)


@router.get("/{project_id}")
def get_project(project_id: str, uid: str = Depends(current_user_id)):
    p = store.get("projects", project_id, uid)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found.")
    p["videos"] = store.list_where("videos", uid, "project_id=?", (project_id,),
                                   "created_at desc")
    return p


@router.patch("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate,
                   uid: str = Depends(current_user_id)):
    if not store.get("projects", project_id, uid):
        raise HTTPException(status_code=404, detail="Project not found.")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        patch["updated_at"] = time.time()
        store.update("projects", project_id, uid, patch)
    return store.get("projects", project_id, uid)


@router.delete("/{project_id}")
def delete_project(project_id: str, uid: str = Depends(current_user_id)):
    if not store.get("projects", project_id, uid):
        raise HTTPException(status_code=404, detail="Project not found.")
    store.delete("projects", project_id, uid)
    return {"status": "success"}


def _events_in_project(uid: str, project_id: str) -> int:
    videos = store.list_where("videos", uid, "project_id=?", (project_id,))
    total = 0
    for v in videos:
        total += store.count("events", uid, "video_id=?", (v["id"],))
    return total
