"""Live intelligence: smart zones, alerts, and cameras (spec §35/§36/§38).

Detection runs client-side in the browser (webcam) for the offline build; the
backend persists zone/alert/camera definitions and logged alerts, and exposes
the RTSP-ready camera model for the Command Center.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import store
from ..deps import current_user_id

router = APIRouter(prefix="/live", tags=["live"])


class ZoneCreate(BaseModel):
    project_id: str | None = None
    name: str
    polygon: list          # [[x,y], ...] normalized 0..1


class AlertCreate(BaseModel):
    project_id: str | None = None
    zone_id: str | None = None
    rule: dict             # {"when":"zone_enter","type":"person"}
    channel: str = "realtime"


class AlertLog(BaseModel):
    zone_id: str | None = None
    zone_name: str | None = None
    object_type: str | None = None
    ts: float | None = None


class CameraCreate(BaseModel):
    project_id: str | None = None
    name: str
    location: str | None = None
    status: str = "offline"


# --- zones ---
@router.post("/zones")
def create_zone(body: ZoneCreate, uid: str = Depends(current_user_id)):
    zid = store.insert("zones", {"owner_id": uid, "project_id": body.project_id,
                                 "name": body.name, "polygon": body.polygon})
    return store.get("zones", zid, uid)


@router.get("/zones")
def list_zones(uid: str = Depends(current_user_id)):
    return {"zones": store.list_where("zones", uid)}


@router.delete("/zones/{zone_id}")
def delete_zone(zone_id: str, uid: str = Depends(current_user_id)):
    store.delete("zones", zone_id, uid)
    return {"status": "success"}


# --- alerts (rules + logged firings) ---
@router.post("/alerts")
def create_alert(body: AlertCreate, uid: str = Depends(current_user_id)):
    aid = store.insert("alerts", {
        "owner_id": uid, "project_id": body.project_id, "zone_id": body.zone_id,
        "rule": body.rule, "channel": body.channel, "created_at": time.time()})
    return store.get("alerts", aid, uid)


@router.get("/alerts")
def list_alerts(uid: str = Depends(current_user_id)):
    return {"alerts": store.list_where("alerts", uid, order="created_at desc")}


@router.post("/alerts/log")
def log_alert(body: AlertLog, uid: str = Depends(current_user_id)):
    """Persist a realtime alert firing from the live view."""
    aid = store.insert("alerts", {
        "owner_id": uid, "project_id": None, "zone_id": body.zone_id,
        "rule": {"fired": True, "zone": body.zone_name,
                 "object": body.object_type, "ts": body.ts},
        "channel": "realtime", "created_at": time.time()})
    return {"status": "logged", "id": aid}


# --- cameras (Command Center) ---
@router.post("/cameras")
def create_camera(body: CameraCreate, uid: str = Depends(current_user_id)):
    cid = store.insert("cameras", {
        "owner_id": uid, "project_id": body.project_id, "name": body.name,
        "location": body.location, "status": body.status, "created_at": time.time()})
    return store.get("cameras", cid, uid)


@router.get("/cameras")
def list_cameras(uid: str = Depends(current_user_id)):
    return {"cameras": store.list_where("cameras", uid, order="created_at asc")}
