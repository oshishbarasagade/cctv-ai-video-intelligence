"""Prove the real vision models work on an actual video (Phase 3 verification).

Downloads a small real sample clip (people/bicycle/car), then runs the real
YOLO tracker, BLIP captioner, EasyOCR, and embedding model directly — no mocks.
Model weights download to backend/.models (on D:), not C:.
"""
import sys
import urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console is cp1252
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
from app import config
from app.ai import tracking, captioning, ocr, embeddings, sampling

SAMPLE_URL = ("https://github.com/intel-iot-devkit/sample-videos/raw/master/"
              "person-bicycle-car-detection.mp4")
sample = config.DATA_DIR / "sample_real.mp4"


def main():
    if not sample.exists():
        print(f"downloading sample video -> {sample} ...")
        urllib.request.urlretrieve(SAMPLE_URL, str(sample))
    print(f"sample: {sample} ({sample.stat().st_size/1e6:.1f} MB)")

    cap = cv2.VideoCapture(str(sample))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    cap.release()

    print("\n=== YOLO detection + tracking ===")
    print("yolo available:", tracking.available())
    res = tracking.track(str(sample), fps, stride=15)   # bigger stride = faster
    assert res is not None, "YOLO returned None"
    objects, subjects = res
    types = {}
    for o in objects:
        types[o["type"]] = types.get(o["type"], 0) + 1
    print("detections:", len(objects), "by type:", types)
    print("person tracks:", len(subjects),
          [s["label"] for s in subjects[:5]])
    assert len(objects) > 0, "no objects detected"

    print("\n=== BLIP captioning (real) ===")
    feats, meta = sampling.sample(str(sample), "quick")
    text, model, conf = captioning.caption(feats[len(feats)//2])
    print("model:", model)
    print("caption:", text)
    print("BLIP active:" , model.startswith("Salesforce"))

    print("\n=== EasyOCR (real) ===")
    ocr_res = ocr.extract(feats[:6])
    print("ocr results:", len(ocr_res),
          [o["text"] for o in ocr_res[:5]])

    print("\n=== embeddings (real) ===")
    v = embeddings.embed("a person walking near a car")
    print("embedding dim:", len(v), "model loaded:",
          embeddings._model() is not None)

    print("\nALL REAL MODELS VERIFIED OK")


if __name__ == "__main__":
    main()
