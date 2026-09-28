"""Offline auth: password hashing + signed bearer tokens.

Mirrors the shape of Supabase Auth (a user id + a bearer token) so the frontend
and route guards are identical when we swap in real Supabase later. Not meant to
replace a real IdP — it exists so the app runs end-to-end with no credentials.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Optional

from . import config

_ALG = "sha256"
_ITER = 120_000


def hash_password(password: str) -> str:
    salt = hashlib.sha256(config.AUTH_SECRET.encode()).digest()[:16]
    dk = hashlib.pbkdf2_hmac(_ALG, password.encode(), salt, _ITER)
    return dk.hex()


def verify_password(password: str, stored: Optional[str]) -> bool:
    if not stored:
        return False
    return hmac.compare_digest(hash_password(password), stored)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue_token(user_id: str, ttl_sec: int = 60 * 60 * 24 * 7) -> str:
    payload = {"sub": user_id, "exp": int(time.time()) + ttl_sec}
    body = _b64(json.dumps(payload).encode())
    sig = hmac.new(config.AUTH_SECRET.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(sig)}"


def verify_token(token: str) -> Optional[str]:
    try:
        body, sig = token.split(".", 1)
        expected = hmac.new(config.AUTH_SECRET.encode(), body.encode(),
                            hashlib.sha256).digest()
        if not hmac.compare_digest(_b64(expected), sig):
            return None
        payload = json.loads(_unb64(body))
        if payload.get("exp", 0) < time.time():
            return None
        return payload.get("sub")
    except Exception:
        return None
