"""FastAPI dependencies: resolve the authenticated user from the bearer token."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException

from . import config, security, store


def current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    token = authorization.split(" ", 1)[1].strip()
    if config.OFFLINE_MODE:
        uid = security.verify_token(token)
    else:
        from . import supa
        uid = supa.verify_token(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return uid


def current_profile(uid: str = Depends(current_user_id)) -> dict:
    profile = store.get_profile(uid)
    if not profile:
        raise HTTPException(status_code=401, detail="Profile not found.")
    return profile
