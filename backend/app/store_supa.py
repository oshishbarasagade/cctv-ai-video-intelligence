"""Supabase (Postgres) implementation of the store interface.

Same function names/signatures as store_sqlite so the app is unchanged — only
the backend differs (spec: replace services, keep everything else). JSON columns
are native jsonb here, so values pass through without encoding. Owner scoping is
enforced in every query (service-role bypasses RLS; RLS still guards direct
client access).
"""
from __future__ import annotations

import datetime as _dt
import time
import uuid
from typing import Any, Dict, List, Optional

from .supa import client

# Columns that are Postgres `timestamptz` — epoch floats must become ISO strings.
_TS_COLS = {"created_at", "updated_at"}


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> float:
    return time.time()


def _fix_ts(data: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(data)
    for k in _TS_COLS:
        v = out.get(k)
        if isinstance(v, (int, float)):
            out[k] = _dt.datetime.fromtimestamp(v, _dt.timezone.utc).isoformat()
    return out


def insert(table: str, data: Dict[str, Any]) -> str:
    row = _fix_ts(data)
    row.setdefault("id", _uid())
    client().table(table).insert(row).execute()
    return row["id"]


def update(table: str, row_id: str, owner_id: str, data: Dict[str, Any]) -> None:
    client().table(table).update(_fix_ts(data)) \
        .eq("id", row_id).eq("owner_id", owner_id).execute()


def get(table: str, row_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
    res = client().table(table).select("*") \
        .eq("id", row_id).eq("owner_id", owner_id).limit(1).execute()
    return res.data[0] if res.data else None


def list_where(table: str, owner_id: str, where: str = "", args: tuple = (),
               order: str = "") -> List[Dict[str, Any]]:
    q = client().table(table).select("*").eq("owner_id", owner_id)
    # Translate the tiny SQL-ish predicates the app uses ("col=?").
    if where:
        for clause, val in zip([c.strip() for c in where.split("and")], args):
            col = clause.split("=")[0].strip()
            q = q.eq(col, val)
    if order:
        col, _, direction = order.partition(" ")
        q = q.order(col, desc=direction.strip().lower() == "desc")
    return q.execute().data or []


def delete(table: str, row_id: str, owner_id: str) -> None:
    client().table(table).delete().eq("id", row_id).eq("owner_id", owner_id).execute()


def count(table: str, owner_id: str, where: str = "", args: tuple = ()) -> int:
    q = client().table(table).select("id", count="exact").eq("owner_id", owner_id)
    if where:
        for clause, val in zip([c.strip() for c in where.split("and")], args):
            col = clause.split("=")[0].strip()
            q = q.eq(col, val)
    return q.execute().count or 0


# --- profiles (keyed by auth uid, no owner_id column) ----------------------
def get_profile(user_id: str) -> Optional[Dict[str, Any]]:
    res = client().table("profiles").select("*").eq("id", user_id).limit(1).execute()
    return res.data[0] if res.data else None


def get_profile_by_email(email: str) -> Optional[Dict[str, Any]]:
    res = client().table("profiles").select("*") \
        .eq("email", email.lower()).limit(1).execute()
    return res.data[0] if res.data else None


def create_profile(data: Dict[str, Any]) -> str:
    # In Supabase, a DB trigger auto-creates the profile row on signup; this
    # upserts any extra fields (and covers the rare missing-row case).
    row = _fix_ts(data)
    row.setdefault("id", _uid())
    if row.get("email"):
        row["email"] = row["email"].lower()
    client().table("profiles").upsert(row).execute()
    return row["id"]


def update_profile(user_id: str, data: Dict[str, Any]) -> None:
    client().table("profiles").update(_fix_ts(data)).eq("id", user_id).execute()
