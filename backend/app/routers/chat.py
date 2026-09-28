"""Ask Subli, Find the Story, What Changed — all grounded in stored analysis
(spec §26/§27/§29). Claude is called only here, on the backend, never exposed."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import store
from ..ai.reasoning import service
from ..deps import current_user_id
from ..schemas import AskRequest, WhatChangedRequest

router = APIRouter(prefix="/chat", tags=["chat"])


def _context(video_id: str, uid: str) -> dict:
    if not store.get("videos", video_id, uid):
        raise HTTPException(status_code=404, detail="Video not found.")
    return {
        "events": store.list_where("events", uid, "video_id=?", (video_id,),
                                   "start_time asc"),
        "ocr": store.list_where("ocr_results", uid, "video_id=?", (video_id,),
                                "ts asc"),
        "states": store.list_where("environment_states", uid, "video_id=?",
                                   (video_id,), "ts asc"),
    }


@router.post("/ask")
def ask(body: AskRequest, uid: str = Depends(current_user_id)):
    ctx = _context(body.video_id, uid)
    return service.answer_question(body.question, ctx)


@router.post("/find-story")
def find_story(video_id: str, uid: str = Depends(current_user_id)):
    ctx = _context(video_id, uid)
    return service.find_story(ctx)


@router.post("/what-changed")
def what_changed(body: WhatChangedRequest, uid: str = Depends(current_user_id)):
    ctx = _context(body.video_id, uid)
    states = ctx["states"]
    if not states:
        raise HTTPException(status_code=404, detail="No temporal data.")

    def nearest(ts: float):
        return min(states, key=lambda s: abs(s["ts"] - ts))["state"]

    a, b = nearest(body.ts_a), nearest(body.ts_b)
    return service.compare_states(a, b, body.ts_a, body.ts_b)
