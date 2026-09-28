"""Supabase integration: client, auth, and storage.

Activated when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (i.e.
`not config.OFFLINE_MODE`). The backend uses the service-role client and
enforces owner scoping in code, exactly as the offline store does; Postgres RLS
is the second line of defense for any direct client access.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

from . import config

logger = logging.getLogger("subli.supa")

VIDEO_BUCKET = "videos"
ARTIFACT_BUCKET = "artifacts"


@lru_cache(maxsize=1)
def client():
    """Cached SERVICE-ROLE client for admin, table and storage ops.

    Never call sign_in_with_password on this client — supabase-py stores the
    session on the client and would then send a non-admin token on subsequent
    admin/table calls ("User not allowed"). Auth sign-in uses fresh clients.
    """
    if config.OFFLINE_MODE:
        return None
    from supabase import create_client
    logger.info("Connecting to Supabase %s", config.SUPABASE_URL)
    return create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)


def _fresh_anon():
    """A throwaway anon client for a single auth operation."""
    from supabase import create_client
    key = config.SUPABASE_ANON_KEY or config.SUPABASE_SERVICE_ROLE_KEY
    return create_client(config.SUPABASE_URL, key)


# --- auth ------------------------------------------------------------------
def sign_up(email: str, password: str, full_name: str) -> dict:
    """Create a confirmed user (service role) and return a session."""
    client().auth.admin.create_user({
        "email": email, "password": password, "email_confirm": True,
        "user_metadata": {"full_name": full_name},
    })
    return sign_in(email, password)


def sign_in(email: str, password: str) -> dict:
    res = _fresh_anon().auth.sign_in_with_password(
        {"email": email, "password": password})
    return {"token": res.session.access_token,
            "user": {"id": res.user.id, "email": res.user.email,
                     "full_name": (res.user.user_metadata or {}).get("full_name")}}


def verify_token(token: str) -> Optional[str]:
    try:
        res = _fresh_anon().auth.get_user(token)
        return res.user.id if res and res.user else None
    except Exception as exc:  # pragma: no cover
        logger.debug("token verify failed: %s", exc)
        return None


# --- storage ---------------------------------------------------------------
def upload(bucket: str, path: str, data: bytes, content_type: str) -> None:
    client().storage.from_(bucket).upload(
        path, data, {"content-type": content_type, "upsert": "true"})


def upload_file(bucket: str, path: str, local_path: str, content_type: str) -> bool:
    """Upload a local file to a private bucket. Returns True on success."""
    try:
        with open(local_path, "rb") as fh:
            upload(bucket, path, fh.read(), content_type)
        return True
    except Exception as exc:  # pragma: no cover
        logger.warning("storage upload failed for %s/%s: %s", bucket, path, exc)
        return False


def download_to(bucket: str, path: str, local_path: str) -> bool:
    """Fetch an object from a bucket to a local path (serving fallback)."""
    try:
        data = download(bucket, path)
        import os
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as fh:
            fh.write(data)
        return True
    except Exception as exc:  # pragma: no cover
        logger.warning("storage download failed for %s/%s: %s", bucket, path, exc)
        return False


def signed_url(bucket: str, path: str, expires: int = 3600) -> Optional[str]:
    try:
        res = client().storage.from_(bucket).create_signed_url(path, expires)
        return res.get("signedURL") or res.get("signedUrl")
    except Exception as exc:  # pragma: no cover
        logger.warning("signed url failed for %s/%s: %s", bucket, path, exc)
        return None


def download(bucket: str, path: str) -> bytes:
    return client().storage.from_(bucket).download(path)
