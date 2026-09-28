"""Smart frame sampling + per-frame computer-vision features.

Real, computed analysis (no deep model required): background subtraction gives
foreground blobs, which we turn into coarse object detections; motion and
scene-change scores drive keyframe selection and the event engine. When a real
detector (YOLO) is installed, detection.py overrides the coarse boxes.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np

from .. import config


@dataclass
class Blob:
    bbox: Tuple[int, int, int, int]      # x, y, w, h (pixels)
    area_frac: float                     # fraction of frame area
    kind: str                            # coarse guess: person|vehicle|object


@dataclass
class FrameFeat:
    ts: float
    frame_bgr: np.ndarray = field(repr=False)
    brightness: float = 0.0
    motion: float = 0.0                  # fraction of changed pixels
    scene_change: bool = False
    blobs: List[Blob] = field(default_factory=list)

    @property
    def people(self) -> int:
        return sum(1 for b in self.blobs if b.kind == "person")

    @property
    def vehicles(self) -> int:
        return sum(1 for b in self.blobs if b.kind == "vehicle")


def _classify_blob(w: int, h: int, area_frac: float) -> str:
    ar = h / max(w, 1)
    if ar >= 1.3:
        return "person"          # tall
    if ar <= 0.7 and area_frac > 0.03:
        return "vehicle"         # wide + sizeable
    return "object"


def sample(video_path: str, mode: str = "balanced"
           ) -> Tuple[List[FrameFeat], dict]:
    """Return (frame features, video metadata)."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Could not open video (unsupported or corrupt).")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration = (total / fps) if fps > 0 else 0.0

    step = config.SAMPLING_MODES.get(mode, 1.0)
    times = list(np.arange(0.0, max(duration, step), step))
    if len(times) > config.MAX_FRAMES:
        idx = np.linspace(0, len(times) - 1, config.MAX_FRAMES).astype(int)
        times = [times[i] for i in idx]

    bg = cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=32,
                                            detectShadows=False)
    feats: List[FrameFeat] = []
    prev_gray: Optional[np.ndarray] = None
    frame_area = float(max(width * height, 1))

    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = float(gray.mean())

        motion = 0.0
        scene_change = False
        if prev_gray is not None and prev_gray.shape == gray.shape:
            diff = cv2.absdiff(gray, prev_gray)
            motion = float((diff > 25).mean())
            scene_change = motion > 0.45
        prev_gray = gray

        # Foreground blobs -> coarse objects.
        mask = bg.apply(frame)
        mask = cv2.medianBlur(mask, 5)
        mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)
        blobs: List[Blob] = []
        for c in contours:
            x, y, w, h = cv2.boundingRect(c)
            area_frac = (w * h) / frame_area
            if area_frac < 0.01:          # ignore noise
                continue
            blobs.append(Blob((x, y, w, h), area_frac,
                              _classify_blob(w, h, area_frac)))
        blobs.sort(key=lambda b: b.area_frac, reverse=True)

        feats.append(FrameFeat(ts=float(t), frame_bgr=frame,
                               brightness=brightness, motion=motion,
                               scene_change=scene_change, blobs=blobs[:12]))

    cap.release()
    if not feats:
        raise ValueError("No frames could be read from the video.")

    meta = {"duration_sec": round(duration, 3), "width": width,
            "height": height, "fps": round(fps, 3),
            "format": video_path.rsplit(".", 1)[-1].lower()}
    return feats, meta
