"""Semantic search over a video's captions and events (spec §28).

Offline: cosine similarity in Python over stored embeddings. With Supabase this
becomes a pgvector query; the request/response shape is identical.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import store
from ..ai import embeddings
from ..deps import current_user_id
from ..schemas import SearchRequest

router = APIRouter(prefix="/search", tags=["search"])


@router.post("")
def search(body: SearchRequest, uid: str = Depends(current_user_id)):
    if not store.get("videos", body.video_id, uid):
        raise HTTPException(status_code=404, detail="Video not found.")

    qvec = embeddings.embed(body.query)
    rows = store.list_where("embeddings", uid, "video_id=?", (body.video_id,))
    scored = []
    for r in rows:
        vec = r.get("embedding")
        if not vec:
            continue
        scored.append({
            "ts": r.get("ts"), "kind": r.get("kind"),
            "content": r.get("content"), "ref_id": r.get("ref_id"),
            "relevance": round(embeddings.cosine(qvec, vec), 4),
        })
    scored.sort(key=lambda x: x["relevance"], reverse=True)
    return {"results": scored[: max(1, min(body.limit, 50))]}
