"""Live intelligence: smart zones, alerts, and cameras (spec §35/§36/§38).

Detection runs client-side in the browser (webcam) for the offline build; the
backend persists zone/alert/camera definitions and logged alerts, and exposes
the RTSP-ready camera model for the Command Center.
"""
from __future__ import annotations

import time

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .. import store
from ..ai import tracking
from ..deps import current_user_id

router = APIRouter(prefix="/live", tags=["live"])


@router.post("/detect")
async def detect_frame(
    file: UploadFile = File(...),
    conf: float = Form(0.5),
    _uid: str = Depends(current_user_id),
):
    """Run the REAL YOLO model on a single webcam frame and return detections.

    Browser-side YOLO is not installed, so live inference runs on the backend
    model (the same yolov8n used by the offline pipeline). No fake detections:
    if the model is unavailable we say so explicitly.
    """
    model = tracking._model()
    if model is None:
        return {"available": False, "detections": [], "inference_ms": 0,
                "width": 0, "height": 0}

    raw = await file.read()
    arr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image frame.")

    t0 = time.time()
    res = model.predict(img, verbose=False, conf=max(0.1, min(conf, 0.95)))[0]
    dets = []
    names = res.names
    for box in res.boxes:
        name = names[int(box.cls)]
        if name not in tracking._KEEP:
            continue
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        dets.append({
            "type": tracking._ALIAS.get(name, name),
            "confidence": round(float(box.conf), 2),
            "bbox": [round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)],
        })
    return {"available": True, "detections": dets,
            "inference_ms": round((time.time() - t0) * 1000),
            "width": int(img.shape[1]), "height": int(img.shape[0])}


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
