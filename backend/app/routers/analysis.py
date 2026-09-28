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
