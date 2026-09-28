"""Dashboard metrics — real counts from the database (spec §10, §39)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import store
from ..deps import current_user_id

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/metrics")
def metrics(uid: str = Depends(current_user_id)):
    return {
        "videos": store.count("videos", uid),
        "events": store.count("events", uid),
        "people": store.count("subjects", uid),
        "objects": store.count("objects", uid),
        "projects": store.count("projects", uid),
    }


@router.get("/analytics")
def analytics(uid: str = Depends(current_user_id)):
    """Real distributions from the DB (spec §39). Never hard-coded."""
    events = store.list_where("events", uid)
    objects = store.list_where("objects", uid)

    event_dist: dict = {}
    for e in events:
        key = e["type"].replace("_", " ").title()
        event_dist[key] = event_dist.get(key, 0) + 1

    object_dist: dict = {}
    for o in objects:
        object_dist[o["type"]] = object_dist.get(o["type"], 0) + 1

    # activity over time: events bucketed into 12 slots by start_time
    activity = [0] * 12
    if events:
        max_t = max((e["start_time"] for e in events), default=1) or 1
        for e in events:
            idx = min(11, int((e["start_time"] / max_t) * 11))
            activity[idx] += 1

    return {
        "event_distribution": [{"name": k, "value": v} for k, v in event_dist.items()],
        "object_distribution": [{"name": k, "value": v} for k, v in object_dist.items()],
        "activity": [{"bucket": i, "events": n} for i, n in enumerate(activity)],
    }
