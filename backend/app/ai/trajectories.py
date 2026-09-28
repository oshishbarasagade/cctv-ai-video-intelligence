"""Reconstruct object movement paths from real detections.

The stored `objects` rows have a bounding box + timestamp + type. We link
detections across time by centroid proximity (per type) to form trajectories —
the same anonymous association used live. No identity, no faces; just paths.
"""
from __future__ import annotations

from typing import Dict, List


def build(objects: List[Dict], width: int, height: int,
          max_gap: float = 1.6, max_dist: float = 0.18) -> List[Dict]:
    W = max(width or 1, 1)
    H = max(height or 1, 1)
    objs = sorted((o for o in objects if o.get("bbox")), key=lambda o: o["ts"])

    tracks: List[Dict] = []
    for o in objs:
        x, y, w, h = o["bbox"]
        cx, cy = (x + w / 2) / W, (y + h / 2) / H
        best, best_d = None, max_dist
        for t in tracks:
            if t["type"] != o["type"] or o["ts"] <= t["last_ts"] \
                    or o["ts"] - t["last_ts"] > max_gap:
                continue
            d = ((t["cx"] - cx) ** 2 + (t["cy"] - cy) ** 2) ** 0.5
            if d < best_d:
                best_d, best = d, t
        pt = {"ts": round(o["ts"], 3), "x": round(cx, 4), "y": round(cy, 4)}
        if best:
            best["points"].append(pt)
            best.update(cx=cx, cy=cy, last_ts=o["ts"])
        else:
            tracks.append({"type": o["type"], "cx": cx, "cy": cy,
                           "last_ts": o["ts"], "points": [pt]})

    out: List[Dict] = []
    counts: Dict[str, int] = {}
    for t in sorted(tracks, key=lambda t: t["points"][0]["ts"]):
        if len(t["points"]) < 3:            # need real movement, not a blip
            continue
        counts[t["type"]] = counts.get(t["type"], 0) + 1
        n = counts[t["type"]]
        label = f"Person #{n}" if t["type"] == "person" else f"{t['type']} #{n}"
        out.append({"label": label, "type": t["type"], "points": t["points"]})
    # longest paths first, cap for a readable overlay
    out.sort(key=lambda t: len(t["points"]), reverse=True)
    return out[:16]
