"""Object detection.

Real: Ultralytics YOLO when installed (mapped to Subli's label set).
Offline: coarse foreground blobs from sampling.py, classified by shape. Honest —
labelled with model 'blob-heuristic' so the UI/report can show provenance.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import List

import cv2

from .. import config
from .sampling import FrameFeat

logger = logging.getLogger("subli.detect")

# COCO -> Subli label set (spec §18)
_KEEP = {"person", "car", "truck", "bus", "motorcycle", "bicycle", "backpack",
         "handbag", "suitcase", "chair", "cell phone", "dog", "cat"}
_ALIAS = {"handbag": "bag", "suitcase": "bag", "cell phone": "phone",
          "dog": "animal", "cat": "animal"}


@lru_cache(maxsize=1)
def _yolo():
    if config.FORCE_FALLBACK:
        return None
    try:
        from ultralytics import YOLO  # type: ignore
        logger.info("Loading YOLO model...")
        return YOLO("yolov8n.pt")
    except Exception:
        logger.info("ultralytics/YOLO not installed; blob-heuristic detection.")
        return None


def detect(feats: List[FrameFeat]) -> List[dict]:
    model = _yolo()
    if model is not None:
        return _detect_yolo(model, feats)      # pragma: no cover
    return _detect_blobs(feats)


def _detect_blobs(feats: List[FrameFeat]) -> List[dict]:
    out = []
    for f in feats:
        for b in f.blobs:
            out.append({
                "ts": f.ts, "type": b.kind,
                "confidence": round(min(0.4 + b.area_frac * 3, 0.9), 2),
                "bbox": list(b.bbox), "model": "blob-heuristic"})
    return out


def _detect_yolo(model, feats: List[FrameFeat]) -> List[dict]:  # pragma: no cover
    out = []
    for f in feats:
        res = model.predict(f.frame_bgr, verbose=False)[0]
        for box in res.boxes:
            name = model.names[int(box.cls)]
            if name not in _KEEP:
                continue
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            out.append({
                "ts": f.ts, "type": _ALIAS.get(name, name),
                "confidence": round(float(box.conf), 2),
                "bbox": [int(x1), int(y1), int(x2 - x1), int(y2 - y1)],
                "model": "yolov8n"})
    return out
