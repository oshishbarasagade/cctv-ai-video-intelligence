"""Full analysis pipeline: video file -> structured intelligence in the store.

Stages (each reported to the processing job for real progress, spec §15):
  metadata -> sampling -> detection -> ocr -> captioning -> events -> subtitles
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable, List, Tuple

import cv2

from .. import config, store
from . import analysis, captioning, detection, embeddings, ocr, sampling, tracking
from .sampling import Blob

logger = logging.getLogger("subli.pipeline")

ProgressCb = Callable[[str, int], None]


def run(video_id: str, owner_id: str, storage_path: str, mode: str,
        progress: ProgressCb) -> dict:
    progress("metadata", 5)
    feats, meta = sampling.sample(storage_path, mode)
    store.update("videos", video_id, owner_id, meta)

    duration = meta["duration_sec"]
    step = config.SAMPLING_MODES.get(mode, 1.0)

    # --- frames + thumbnails (keyframes only: scene changes + evenly spaced) --
    progress("sampling", 20)
    thumb_dir = config.ARTIFACT_DIR / owner_id / video_id
    thumb_dir.mkdir(parents=True, exist_ok=True)
    frame_ids = {}
    keyframes = _pick_keyframes(feats)
    for f in keyframes:
        tp = thumb_dir / f"frame_{int(f.ts*1000):07d}.jpg"
        cv2.imwrite(str(tp), f.frame_bgr)
        fid = store.insert("frames", {
            "video_id": video_id, "owner_id": owner_id, "ts": f.ts,
            "storage_path": str(tp), "created_at": _now()})
        frame_ids[round(f.ts, 3)] = fid

    # --- detection + tracking -------------------------------------------------
    # Real path: YOLOv8 + ByteTrack over the video (persistent person tracks).
    # Fallback: coarse foreground-blob detection + presence-based subjects.
    progress("detection", 40)
    tracked = tracking.track(str(storage_path), meta["fps"])
    if tracked is not None:
        det, subjects = tracked
        _apply_real_counts(feats, det)                 # events/states use YOLO counts
        for s in subjects:
            store.insert("subjects", {"video_id": video_id, "owner_id": owner_id, **s})
    else:
        det = detection.detect(feats)
        _build_subjects(video_id, owner_id, feats)

    for d in det:
        store.insert("objects", {
            "video_id": video_id, "owner_id": owner_id,
            "frame_id": frame_ids.get(round(d["ts"], 3)),
            "type": d["type"], "confidence": d["confidence"],
            "bbox": d["bbox"], "ts": d["ts"]})

    # --- OCR ------------------------------------------------------------------
    progress("ocr", 55)
    for o in ocr.extract(keyframes):
        store.insert("ocr_results", {
            "video_id": video_id, "owner_id": owner_id,
            "frame_id": frame_ids.get(round(o["ts"], 3)),
            "text": o["text"], "confidence": o["confidence"],
            "bbox": o.get("bbox"), "ts": o["ts"]})

    # --- captioning -----------------------------------------------------------
    progress("captioning", 70)
    caps: List[Tuple[float, str]] = []
    for f in feats:
        text, model, conf = captioning.caption(f)
        caps.append((f.ts, text))
        store.insert("captions", {
            "video_id": video_id, "owner_id": owner_id,
            "frame_id": frame_ids.get(round(f.ts, 3)),
            "text": text, "model": model, "confidence": conf, "ts": f.ts})

    # --- temporal memory + events + graph ------------------------------------
    progress("events", 85)
    for s in analysis.build_states(feats):
        store.insert("environment_states", {
            "video_id": video_id, "owner_id": owner_id,
            "ts": s["ts"], "state": s["state"]})
    events = analysis.build_events(feats)
    event_ids = []
    for e in events:
        eid = store.insert("events", {"video_id": video_id, "owner_id": owner_id, **e})
        event_ids.append(eid)
    for a, b, rel in analysis.build_relations(event_ids):
        store.insert("event_relations", {
            "video_id": video_id, "owner_id": owner_id,
            "from_event": a, "to_event": b, "relation": rel})

    # --- embeddings (captions + events) --------------------------------------
    for ts, text in caps:
        store.insert("embeddings", {
            "video_id": video_id, "owner_id": owner_id, "kind": "caption",
            "ts": ts, "content": text, "embedding": embeddings.embed(text)})
    for e, eid in zip(events, event_ids):
        store.insert("embeddings", {
            "video_id": video_id, "owner_id": owner_id, "kind": "event",
            "ref_id": eid, "ts": e["start_time"], "content": e["description"],
            "embedding": embeddings.embed(e["description"])})

    # --- subtitles ------------------------------------------------------------
    progress("subtitles", 95)
    cues = analysis.smooth_subtitles(caps, duration, step)
    (thumb_dir / "subtitles.srt").write_text(analysis.to_srt(cues), encoding="utf-8")
    (thumb_dir / "subtitles.vtt").write_text(analysis.to_vtt(cues), encoding="utf-8")

    # Real Supabase Storage: push keyframes + subtitles to the private artifacts
    # bucket (kept local too for fast serving).
    if not config.OFFLINE_MODE:
        _upload_artifacts(owner_id, video_id, thumb_dir)

    progress("done", 100)
    summary = {"frames": len(keyframes), "objects": len(det),
               "events": len(events), "captions": len(caps),
               "duration": duration, "engine": det[0]["model"] if det else "none"}
    logger.info("Pipeline complete for %s: %s", video_id, summary)
    return summary


def _upload_artifacts(owner_id: str, video_id: str, thumb_dir) -> None:
    from .. import supa
    for f in thumb_dir.iterdir():
        ct = "image/jpeg" if f.suffix == ".jpg" else "text/plain"
        supa.upload_file(supa.ARTIFACT_BUCKET, f"{owner_id}/{video_id}/{f.name}",
                         str(f), ct)


def _pick_keyframes(feats, max_thumbs: int = 40):
    scene = [f for f in feats if f.scene_change]
    if len(scene) >= max_thumbs:
        return scene[:max_thumbs]
    # top up with evenly spaced frames
    others = [f for f in feats if not f.scene_change]
    stepn = max(1, len(others) // max(1, (max_thumbs - len(scene))))
    return sorted(scene + others[::stepn][: max_thumbs - len(scene)],
                  key=lambda f: f.ts)


def _apply_real_counts(feats, objects: List[dict]) -> None:
    """Rewrite each sampled frame's blobs from real YOLO detections near its ts,
    so the event engine, temporal states and heuristic captions reflect actual
    people/vehicle counts instead of foreground blobs."""
    VEHICLES = {"car", "truck", "bus", "motorcycle", "bicycle"}
    if not feats:
        return
    half = max((feats[1].ts - feats[0].ts) if len(feats) > 1 else 1.0, 0.5) / 2
    for f in feats:
        near = [o for o in objects if abs(o["ts"] - f.ts) <= half]
        blobs = []
        for o in near:
            kind = "person" if o["type"] == "person" else (
                "vehicle" if o["type"] in VEHICLES else "object")
            x, y, w, h = (o.get("bbox") or [0, 0, 1, 1])
            blobs.append(Blob((x, y, w, h), 0.05, kind))
        f.blobs = blobs


def _build_subjects(video_id: str, owner_id: str, feats) -> None:
    """Very coarse anonymous person presence -> Person #N tracks. No identity."""
    person_frames = [f for f in feats if f.people > 0]
    if not person_frames:
        return
    max_people = max(f.people for f in person_frames)
    first = person_frames[0].ts
    last = person_frames[-1].ts
    for n in range(1, min(max_people, 8) + 1):
        store.insert("subjects", {
            "video_id": video_id, "owner_id": owner_id, "label": f"Person #{n}",
            "first_seen": first, "last_seen": last,
            "trajectory": [{"ts": f.ts, "people": f.people}
                           for f in person_frames[:50]]})


def _now() -> float:
    import time
    return time.time()
