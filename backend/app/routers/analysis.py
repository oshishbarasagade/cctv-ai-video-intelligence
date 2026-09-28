"""Read the analysis results for a video: overview, timeline, objects, people,
OCR, captions, temporal states, event graph, key frames, and subtitles."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from .. import config, store
from ..deps import current_user_id

router = APIRouter(prefix="/analysis", tags=["analysis"])


def _own_video(video_id: str, uid: str) -> dict:
    v = store.get("videos", video_id, uid)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found.")
    return v


def _ensure_local(local: Path, bucket: str, key: str) -> bool:
    """True if the file is available locally, fetching it from Supabase Storage
    (private bucket) when the local copy is missing."""
    if local.exists():
        return True
    if config.OFFLINE_MODE:
        return False
    from .. import supa
    return supa.download_to(bucket, key, str(local))


@router.get("/{video_id}/overview")
def overview(video_id: str, uid: str = Depends(current_user_id)):
    v = _own_video(video_id, uid)
    return {
        "video": v,
        "counts": {
            "events": store.count("events", uid, "video_id=?", (video_id,)),
            "objects": store.count("objects", uid, "video_id=?", (video_id,)),
            "people": store.count("subjects", uid, "video_id=?", (video_id,)),
            "ocr": store.count("ocr_results", uid, "video_id=?", (video_id,)),
            "frames": store.count("frames", uid, "video_id=?", (video_id,)),
        },
    }


@router.get("/{video_id}/status")
def status(video_id: str, uid: str = Depends(current_user_id)):
    """Latest processing-job status for a video — drives live refresh in the
    analysis workspace so results appear as they are produced."""
    _own_video(video_id, uid)
    jobs = store.list_where("processing_jobs", uid, "video_id=?", (video_id,),
                            "created_at desc")
    if not jobs:
        return {"status": "unknown", "stage": None, "progress": 0}
    j = jobs[0]
    return {"status": j["status"], "stage": j.get("stage"),
            "progress": j.get("progress", 0)}


@router.get("/{video_id}/events")
def events(video_id: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    return {"events": store.list_where("events", uid, "video_id=?", (video_id,),
                                       "start_time asc")}


@router.get("/{video_id}/graph")
def graph(video_id: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    return {
        "nodes": store.list_where("events", uid, "video_id=?", (video_id,),
                                  "start_time asc"),
        "edges": store.list_where("event_relations", uid, "video_id=?", (video_id,)),
    }


@router.get("/{video_id}/trajectories")
def trajectories(video_id: str, uid: str = Depends(current_user_id)):
    """Movement paths reconstructed from real object detections."""
    v = _own_video(video_id, uid)
    from ..ai import trajectories as traj
    objects = store.list_where("objects", uid, "video_id=?", (video_id,), "ts asc")
    paths = traj.build(objects, v.get("width") or 0, v.get("height") or 0)
    return {"trajectories": paths, "width": v.get("width"), "height": v.get("height")}


@router.get("/{video_id}/highlights")
def get_highlights(video_id: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    from ..ai import highlights
    events = store.list_where("events", uid, "video_id=?", (video_id,), "start_time asc")
    states = store.list_where("environment_states", uid, "video_id=?", (video_id,), "ts asc")
    return {"highlights": highlights.build(events, states)}


@router.get("/{video_id}/memory")
def memory(video_id: str, uid: str = Depends(current_user_id)):
    """Chronological state-change memory from temporal memory (real states)."""
    _own_video(video_id, uid)
    states = store.list_where("environment_states", uid, "video_id=?", (video_id,), "ts asc")
    items = []
    prev = None
    for s in states:
        st = s.get("state") or {}
        if prev is None:
            items.append({"ts": s["ts"], "changes": [
                {"field": "people", "from": 0, "to": st.get("people", 0)}],
                "state": st})
        else:
            changes = []
            for k in ("people", "vehicles", "activity"):
                if st.get(k) != prev.get(k):
                    changes.append({"field": k, "from": prev.get(k), "to": st.get(k)})
            if changes:
                items.append({"ts": s["ts"], "changes": changes, "state": st})
        prev = st
    return {"memory": items}


@router.get("/{video_id}/quality")
def quality(video_id: str, uid: str = Depends(current_user_id)):
    """Analysis quality metrics + warnings (spec §12). Real counts only."""
    v = _own_video(video_id, uid)
    counts = {t: store.count(t, uid, "video_id=?", (video_id,)) for t in
              ("frames", "objects", "subjects", "ocr_results", "events",
               "captions", "embeddings")}
    jobs = store.list_where("processing_jobs", uid, "video_id=?", (video_id,),
                            "created_at desc")
    job = jobs[0] if jobs else {}
    warnings = []
    if counts["frames"] < 5:
        warnings.append("Few frames were sampled — try DEEP mode for finer analysis.")
    if counts["objects"] == 0:
        warnings.append("No objects detected — video may be low quality or empty.")
    if counts["ocr_results"] == 0:
        warnings.append("No readable text detected (OCR).")
    if job.get("status") == "failed":
        warnings.append(f"Processing failed at stage: {job.get('failed_stage')}.")
    caps = store.list_where("captions", uid, "video_id=?", (video_id,))
    model = caps[0]["model"] if caps else "n/a"
    return {
        "metrics": {**counts,
                    "duration_sec": v.get("duration_sec"),
                    "mode": job.get("mode"),
                    "status": job.get("status")},
        "models": {"detection": "yolov8n", "captioning": model,
                   "embeddings": "all-MiniLM-L6-v2"},
        "warnings": warnings,
    }


@router.get("/{video_id}/explain")
def explain(video_id: str, ts: float, uid: str = Depends(current_user_id)):
    """Explain the moment at a timestamp using only real analyzed data."""
    _own_video(video_id, uid)
    from ..ai.reasoning import service

    win = 1.5
    subjects = [s for s in store.list_where("subjects", uid, "video_id=?", (video_id,))
                if (s.get("first_seen") or 0) - win <= ts <= (s.get("last_seen") or 0) + win]
    objects = [o for o in store.list_where("objects", uid, "video_id=?", (video_id,))
               if abs(o["ts"] - ts) <= win]
    ocr = [o for o in store.list_where("ocr_results", uid, "video_id=?", (video_id,))
           if abs(o["ts"] - ts) <= win]
    caps = store.list_where("captions", uid, "video_id=?", (video_id,), "ts asc")
    caption = min(caps, key=lambda c: abs(c["ts"] - ts))["text"] if caps else None
    states = store.list_where("environment_states", uid, "video_id=?", (video_id,), "ts asc")
    state = min(states, key=lambda s: abs(s["ts"] - ts))["state"] if states else {}
    events = [e for e in store.list_where("events", uid, "video_id=?", (video_id,))
              if abs(e["start_time"] - ts) <= win]

    obj_counts: dict = {}
    for o in objects:
        obj_counts[o["type"]] = obj_counts.get(o["type"], 0) + 1

    moment = {
        "ts": ts, "caption": caption, "state": state,
        "people": [s["label"] for s in subjects],
        "objects": obj_counts, "ocr": [o["text"] for o in ocr],
        "events": [{"ts": e["start_time"], "description": e.get("description")} for e in events],
    }
    moment["explanation"] = service.explain_moment(moment)
    return moment


@router.get("/{video_id}/objects")
def objects(video_id: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    rows = store.list_where("objects", uid, "video_id=?", (video_id,), "ts asc")
    counts: dict = {}
    for r in rows:
        counts[r["type"]] = counts.get(r["type"], 0) + 1
    return {"objects": rows, "counts": counts}


@router.get("/{video_id}/people")
def people(video_id: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    return {"people": store.list_where("subjects", uid, "video_id=?", (video_id,))}


@router.get("/{video_id}/ocr")
def ocr(video_id: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    return {"ocr": store.list_where("ocr_results", uid, "video_id=?", (video_id,),
                                    "ts asc")}


@router.get("/{video_id}/captions")
def captions(video_id: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    return {"captions": store.list_where("captions", uid, "video_id=?", (video_id,),
                                         "ts asc")}


@router.get("/{video_id}/states")
def states(video_id: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    return {"states": store.list_where("environment_states", uid, "video_id=?",
                                       (video_id,), "ts asc")}


@router.get("/{video_id}/keyframes")
def keyframes(video_id: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    return {"frames": store.list_where("frames", uid, "video_id=?", (video_id,),
                                       "ts asc")}


@router.get("/{video_id}/subtitles.{ext}")
def subtitles(video_id: str, ext: str, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    if ext not in ("srt", "vtt"):
        raise HTTPException(status_code=400, detail="ext must be srt or vtt.")
    path = config.ARTIFACT_DIR / uid / video_id / f"subtitles.{ext}"
    if not _ensure_local(path, "artifacts", f"{uid}/{video_id}/subtitles.{ext}"):
        raise HTTPException(status_code=404, detail="Subtitles not found.")
    return FileResponse(path, media_type="text/plain",
                        filename=f"{video_id}.{ext}")


@router.get("/{video_id}/stream")
def stream_video(video_id: str, uid: str = Depends(current_user_id)):
    v = _own_video(video_id, uid)
    path = Path(v.get("storage_path") or "")
    fmt = v.get("format") or "mp4"
    key = f"{uid}/{v.get('project_id')}/{video_id}.{fmt}"
    if not _ensure_local(path, "videos", key):
        raise HTTPException(status_code=404, detail="Video file not found.")
    return FileResponse(path, media_type=f"video/{fmt}")


@router.get("/{video_id}/frame")
def frame_image(video_id: str, ts: float, uid: str = Depends(current_user_id)):
    _own_video(video_id, uid)
    frames = store.list_where("frames", uid, "video_id=?", (video_id,), "ts asc")
    if not frames:
        raise HTTPException(status_code=404, detail="No frames.")
    nearest = min(frames, key=lambda f: abs(f["ts"] - ts))
    path = Path(nearest["storage_path"] or "")
    key = f"{uid}/{video_id}/{path.name}"
    if not _ensure_local(path, "artifacts", key):
        raise HTTPException(status_code=404, detail="Frame image not found.")
    return FileResponse(path, media_type="image/jpeg")
