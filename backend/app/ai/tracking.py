"""Real object detection + anonymous person tracking via YOLOv8 + ByteTrack.

One streaming pass over the video yields per-frame detections with persistent
track IDs. We map COCO classes to Subli's label set, turn person tracks into
anonymous "Person #N" subjects with trajectories, and return per-timestamp
detection counts the event engine can use.

Anonymous only — track IDs are transient integers, never identities; no faces
are recognized (spec §19/§61).

Returns None when YOLO is unavailable so the caller keeps the heuristic path.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

from .. import config

logger = logging.getLogger("subli.track")

_KEEP = {"person", "car", "truck", "bus", "motorcycle", "bicycle", "backpack",
         "handbag", "suitcase", "chair", "cell phone", "dog", "cat"}
_ALIAS = {"handbag": "bag", "suitcase": "bag", "cell phone": "phone",
          "dog": "animal", "cat": "animal"}


@lru_cache(maxsize=1)
def _model():
    if config.FORCE_FALLBACK:
        return None
    try:
        from ultralytics import YOLO  # type: ignore
        logger.info("Loading YOLOv8n for detection+tracking...")
        return YOLO("yolov8n.pt")
    except Exception as exc:
        logger.info("ultralytics unavailable (%s); heuristic detection.", exc)
        return None


def available() -> bool:
    return _model() is not None


def track(video_path: str, fps: float, stride: int = 3
          ) -> Optional[Tuple[List[dict], List[dict]]]:
    """Return (objects, subjects) or None if YOLO isn't available.

    objects: [{ts, type, confidence, bbox, model, track_id}]
    subjects: [{label, first_seen, last_seen, trajectory}]
    """
    model = _model()
    if model is None:
        return None

    fps = fps or 25.0
    objects: List[dict] = []
    tracks: Dict[int, dict] = {}          # person track_id -> aggregate
    # per-timestamp person counts (fallback when IDs aren't assigned)
    person_ts: List[Tuple[float, list]] = []

    try:
        # No vid_stride: skipping frames breaks tracker continuity. We limit work
        # by capping how many frames we walk (long videos: coarse but real).
        results = model.track(source=video_path, stream=True, persist=True,
                              verbose=False, tracker="bytetrack.yaml")
        for fi, res in enumerate(results):
            if fi % stride != 0:          # subsample the *outputs*, keep tracker state
                continue
            ts = fi / fps
            if res.boxes is None:
                continue
            names = res.names
            frame_persons = []
            for box in res.boxes:
                name = names[int(box.cls)]
                if name not in _KEEP:
                    continue
                label = _ALIAS.get(name, name)
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                bbox = [int(x1), int(y1), int(x2 - x1), int(y2 - y1)]
                tid = int(box.id[0]) if box.id is not None else -1
                objects.append({"ts": round(ts, 3), "type": label,
                                "confidence": round(float(box.conf), 2),
                                "bbox": bbox, "model": "yolov8n", "track_id": tid})
                if label == "person":
                    frame_persons.append(bbox)
                    if tid >= 0:
                        t = tracks.setdefault(tid, {"first": ts, "last": ts, "traj": []})
                        t["last"] = ts
                        if len(t["traj"]) < 200:
                            t["traj"].append({"ts": round(ts, 3), "bbox": bbox})
            if frame_persons:
                person_ts.append((ts, frame_persons))
    except Exception as exc:  # pragma: no cover - runtime/model dependent
        logger.warning("YOLO tracking failed (%s); falling back.", exc)
        return None

    subjects = _subjects_from(tracks, person_ts)
    logger.info("YOLO: %d detections, %d person subjects", len(objects), len(subjects))
    return objects, subjects


def _subjects_from(tracks: Dict[int, dict],
                   person_ts: List[Tuple[float, list]]) -> List[dict]:
    """Prefer real ByteTrack IDs; if none were assigned, synthesize anonymous
    Person #N from the maximum number seen simultaneously (still real, derived
    only from detections)."""
    if tracks:
        subjects = []
        for n, (_tid, t) in enumerate(
                sorted(tracks.items(), key=lambda kv: kv[1]["first"]), 1):
            subjects.append({"label": f"Person #{n}",
                             "first_seen": round(t["first"], 3),
                             "last_seen": round(t["last"], 3),
                             "trajectory": t["traj"]})
        return subjects

    if not person_ts:
        return []
    max_concurrent = max(len(p) for _ts, p in person_ts)
    first = person_ts[0][0]
    last = person_ts[-1][0]
    return [{"label": f"Person #{n}", "first_seen": round(first, 3),
             "last_seen": round(last, 3),
             "trajectory": [{"ts": round(ts, 3), "count": len(p)}
                            for ts, p in person_ts[:100]]}
            for n in range(1, max_concurrent + 1)]
