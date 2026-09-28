"""Frame captioning: BLIP when available, otherwise a heuristic scene describer
built from the per-frame CV features (brightness, motion, detected blobs).

BLIP is loaded via its model classes (BlipProcessor + BlipForConditionalGeneration)
rather than a pipeline, which is robust across transformers versions.
"""
from __future__ import annotations

import logging
from functools import lru_cache

import cv2

from .. import config
from .sampling import FrameFeat

logger = logging.getLogger("subli.caption")


@lru_cache(maxsize=1)
def _blip():
    """Return (processor, model) or None if unavailable."""
    if config.FORCE_FALLBACK:
        return None
    try:
        import torch  # noqa: F401
        from transformers import BlipForConditionalGeneration, BlipProcessor
    except Exception as exc:
        logger.info("transformers/torch not available (%s); heuristic captioner.", exc)
        return None
    try:
        logger.info("Loading BLIP model %s...", config.CAPTION_MODEL)
        proc = BlipProcessor.from_pretrained(config.CAPTION_MODEL)
        model = BlipForConditionalGeneration.from_pretrained(config.CAPTION_MODEL)
        model.eval()
        return proc, model
    except Exception as exc:  # pragma: no cover
        logger.warning("BLIP load failed (%s); heuristic captioner.", exc)
        return None


def _caption_blip(feat: FrameFeat) -> tuple[str, str, float]:
    import torch
    from PIL import Image

    proc, model = _blip()
    rgb = cv2.cvtColor(feat.frame_bgr, cv2.COLOR_BGR2RGB)
    inputs = proc(images=Image.fromarray(rgb), return_tensors="pt")
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=30)
    text = proc.decode(out[0], skip_special_tokens=True).strip()
    return (text or "a scene"), config.CAPTION_MODEL, 0.0


def caption(feat: FrameFeat) -> tuple[str, str, float]:
    """Return (text, model_name, confidence)."""
    if _blip() is not None:
        try:
            return _caption_blip(feat)
        except Exception as exc:  # pragma: no cover
            logger.warning("BLIP inference failed (%s); heuristic.", exc)

    # --- heuristic fallback ---
    if feat.brightness < 40:
        light = "a very dark scene"
    elif feat.brightness < 90:
        light = "a dimly lit area"
    elif feat.brightness < 170:
        light = "an indoor area"
    else:
        light = "a brightly lit area"

    people, vehicles = feat.people, feat.vehicles
    who = []
    if people == 1:
        who.append("one person")
    elif people > 1:
        who.append(f"{people} people")
    if vehicles == 1:
        who.append("a vehicle")
    elif vehicles > 1:
        who.append(f"{vehicles} vehicles")
    subj = " and ".join(who) if who else "no clear subjects"

    if feat.motion > 0.35:
        act = "with significant movement"
    elif feat.motion > 0.08:
        act = "with some activity"
    else:
        act = "with little movement"

    return f"Surveillance view of {light}; {subj}, {act}.", "heuristic-v2", 0.5
