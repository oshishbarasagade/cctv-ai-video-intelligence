"""OCR — extract visible text from keyframes.

Real: EasyOCR or Tesseract (pytesseract) when installed. Offline (neither
present): returns nothing rather than inventing text (spec §62 — never fabricate).
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import List

from .. import config
from .sampling import FrameFeat

logger = logging.getLogger("subli.ocr")


@lru_cache(maxsize=1)
def _engine():
    if config.FORCE_FALLBACK:
        return None
    try:
        import easyocr  # type: ignore
        import os
        logger.info("Loading EasyOCR...")
        os.makedirs(config.EASYOCR_DIR, exist_ok=True)
        return ("easyocr", easyocr.Reader(
            ["en"], gpu=False,
            model_storage_directory=config.EASYOCR_DIR,
            download_enabled=True))
    except Exception:
        pass
    try:
        import pytesseract  # type: ignore  # noqa: F401
        logger.info("Using Tesseract for OCR.")
        return ("tesseract", None)
    except Exception:
        logger.info("No OCR engine installed; skipping text extraction.")
        return None


def extract(keyframes: List[FrameFeat]) -> List[dict]:
    eng = _engine()
    if eng is None:
        return []
    kind, reader = eng
    out = []
    for f in keyframes:                                # pragma: no cover
        try:
            if kind == "easyocr":
                for bbox, text, conf in reader.readtext(f.frame_bgr):
                    if len(text.strip()) >= 2 and conf >= 0.4:
                        xs = [p[0] for p in bbox]; ys = [p[1] for p in bbox]
                        out.append({"ts": f.ts, "text": text.strip(),
                                    "confidence": round(float(conf), 2),
                                    "bbox": [int(min(xs)), int(min(ys)),
                                             int(max(xs) - min(xs)),
                                             int(max(ys) - min(ys))]})
            else:
                import pytesseract, cv2
                gray = cv2.cvtColor(f.frame_bgr, cv2.COLOR_BGR2GRAY)
                txt = pytesseract.image_to_string(gray).strip()
                if len(txt) >= 2:
                    out.append({"ts": f.ts, "text": txt, "confidence": 0.5,
                                "bbox": None})
        except Exception as exc:
            logger.debug("OCR failed on frame %.2f: %s", f.ts, exc)
    return out
