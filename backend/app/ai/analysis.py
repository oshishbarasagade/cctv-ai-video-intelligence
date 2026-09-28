"""Temporal memory, event engine, and subtitle derivation.

Turns the per-frame CV features + captions into higher-level structures:
  * environment_states  — a running snapshot (people/vehicles/motion) over time
  * events              — discrete happenings derived from state deltas
  * event_relations     — sequential "leads_to" chain for the event graph
  * subtitles           — smoothed .srt/.vtt cues
"""
from __future__ import annotations

from typing import Dict, List, Tuple

from .sampling import FrameFeat


def build_states(feats: List[FrameFeat]) -> List[dict]:
    states = []
    for f in feats:
        if f.motion > 0.35:
            activity = "high"
        elif f.motion > 0.08:
            activity = "some"
        else:
            activity = "low"
        states.append({
            "ts": round(f.ts, 3),
            "state": {"people": f.people, "vehicles": f.vehicles,
                      "activity": activity,
                      "brightness": round(f.brightness, 1)},
        })
    return states


def build_events(feats: List[FrameFeat]) -> List[dict]:
    """Derive neutral, observational events from state transitions."""
    events: List[dict] = []
    prev_people = prev_vehicles = 0
    for i, f in enumerate(feats):
        ts = round(f.ts, 3)
        p, v = f.people, f.vehicles

        if p > prev_people:
            events.append(_ev("PERSON_ENTERED", ts,
                              f"A person appeared (now {p} visible).", 0.6, f))
        elif p < prev_people:
            events.append(_ev("PERSON_LEFT", ts,
                              f"A person left the view (now {p} visible).", 0.6, f))
        if p >= 3 and prev_people < 3:
            events.append(_ev("MULTIPLE_PEOPLE", ts,
                              f"Multiple people present ({p}).", 0.55, f))

        if v > prev_vehicles:
            events.append(_ev("VEHICLE_ARRIVED", ts, "A vehicle appeared.", 0.55, f))
        elif v < prev_vehicles:
            events.append(_ev("VEHICLE_LEFT", ts, "A vehicle left the view.", 0.55, f))

        if f.scene_change and i > 0:
            events.append(_ev("SCENE_CHANGED", ts,
                              "The scene changed significantly.", 0.5, f))

        prev_people, prev_vehicles = p, v

    # De-duplicate near-identical consecutive events.
    cleaned: List[dict] = []
    for e in events:
        if cleaned and cleaned[-1]["type"] == e["type"] and \
                abs(cleaned[-1]["start_time"] - e["start_time"]) < 0.5:
            continue
        cleaned.append(e)
    return cleaned


def _ev(etype: str, ts: float, desc: str, conf: float, f: FrameFeat) -> dict:
    return {"type": etype, "start_time": ts, "end_time": ts,
            "description": desc, "confidence": conf,
            "source_frames": [ts],
            "related_objects": [b.kind for b in f.blobs[:5]],
            "related_subjects": []}


def build_relations(event_ids: List[str]) -> List[Tuple[str, str, str]]:
    """Sequential leads_to chain for the event graph."""
    rels = []
    for a, b in zip(event_ids, event_ids[1:]):
        rels.append((a, b, "leads_to"))
    return rels


# --- subtitles ---------------------------------------------------------------
def smooth_subtitles(caps: List[Tuple[float, str]], duration: float,
                     step: float) -> List[dict]:
    if not caps:
        return []
    cues = []
    idx = 1
    start, text = caps[0]
    for t, txt in caps[1:]:
        if txt != text:
            cues.append({"index": idx, "start": start, "end": t, "text": text})
            idx += 1
            start, text = t, txt
    end = max(duration if duration > 0 else caps[-1][0] + step, start + step)
    cues.append({"index": idx, "start": start, "end": end, "text": text})
    return cues


def _fmt(sec: float, vtt: bool) -> str:
    sec = max(sec, 0.0)
    ms = int(round((sec - int(sec)) * 1000))
    s, m, h = int(sec) % 60, (int(sec) // 60) % 60, int(sec) // 3600
    sep = "." if vtt else ","
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def to_srt(cues: List[dict]) -> str:
    return "\n".join(
        f"{c['index']}\n{_fmt(c['start'], False)} --> {_fmt(c['end'], False)}\n{c['text']}\n"
        for c in cues
    ).strip() + "\n"


def to_vtt(cues: List[dict]) -> str:
    lines = ["WEBVTT", ""]
    for c in cues:
        lines.append(f"{_fmt(c['start'], True)} --> {_fmt(c['end'], True)}")
        lines.append(c["text"])
        lines.append("")
    return "\n".join(lines).strip() + "\n"
