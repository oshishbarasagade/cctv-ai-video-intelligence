"""AI Highlights — surface the most important real moments in a video.

Computed only from stored analysis (events + environment_states + object
detections). Each highlight carries an importance score and its source events;
nothing is invented.
"""
from __future__ import annotations

from typing import Dict, List

# Relative importance of each event type.
_WEIGHT = {
    "MULTIPLE_PEOPLE": 0.9,
    "VEHICLE_ARRIVED": 0.85,
    "VEHICLE_LEFT": 0.7,
    "PERSON_ENTERED": 0.6,
    "PERSON_LEFT": 0.55,
    "SCENE_CHANGED": 0.5,
    "TEXT_DETECTED": 0.45,
    "OBJECT_APPEARED": 0.5,
}


def _fmt(sec: float) -> str:
    s, m = int(sec) % 60, int(sec) // 60
    return f"{m:02d}:{s:02d}"


def _title(etype: str) -> str:
    return etype.replace("_", " ").title()


def build(events: List[Dict], states: List[Dict]) -> List[Dict]:
    highlights: List[Dict] = []

    # 1) Event-driven highlights.
    for i, e in enumerate(events):
        base = _WEIGHT.get(e["type"], 0.4)
        related = len(e.get("related_objects") or [])
        score = min(0.99, base + min(related, 5) * 0.02)
        end = events[i + 1]["start_time"] if i + 1 < len(events) else e["start_time"] + 3
        highlights.append({
            "ts": e["start_time"],
            "duration": round(max(1.0, min(end - e["start_time"], 8.0)), 1),
            "title": _title(e["type"]),
            "description": e.get("description", ""),
            "score": round(score, 2),
            "source": [{"ts": e["start_time"], "type": e["type"]}],
        })

    # 2) Peak-occupancy highlight from temporal memory (real state).
    if states:
        peak = max(states, key=lambda s: (s.get("state") or {}).get("people", 0))
        n = (peak.get("state") or {}).get("people", 0)
        if n >= 2:
            highlights.append({
                "ts": peak["ts"],
                "duration": 3.0,
                "title": "Peak Activity",
                "description": f"Highest number of people visible ({n}).",
                "score": round(min(0.99, 0.6 + n * 0.03), 2),
                "source": [{"ts": peak["ts"], "type": "PEAK"}],
            })

    # De-duplicate near-identical timestamps (keep the higher score), sort by score.
    highlights.sort(key=lambda h: h["score"], reverse=True)
    kept: List[Dict] = []
    for h in highlights:
        if any(abs(k["ts"] - h["ts"]) < 0.75 for k in kept):
            continue
        kept.append(h)
    kept = kept[:12]
    kept.sort(key=lambda h: h["ts"])  # chronological for the timeline
    return kept
