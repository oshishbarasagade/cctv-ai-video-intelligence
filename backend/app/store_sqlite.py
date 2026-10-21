"""Data-access layer. Every read/write is scoped to owner_id — the offline
equivalent of Supabase RLS (spec §44). Rows are dicts; JSON columns are
transparently encoded/decoded.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from .db import cursor

_JSON_COLS = {
    "bbox", "trajectory", "state", "source_frames", "related_objects",
    "related_subjects", "embedding", "polygon", "rule", "tags",
}


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> float:
    return time.time()


def _enc(data: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in data.items():
        out[k] = json.dumps(v) if k in _JSON_COLS and v is not None else v
    return out


def _dec(row) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    d = dict(row)
    for k in list(d.keys()):
        if k in _JSON_COLS and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


def insert(table: str, data: Dict[str, Any]) -> str:
    data = dict(data)
    data.setdefault("id", _uid())
    data = _enc(data)
    cols = ", ".join(data.keys())
    ph = ", ".join("?" for _ in data)
    with cursor() as cur:
        cur.execute(f"insert into {table} ({cols}) values ({ph})", list(data.values()))
    return data["id"]


def update(table: str, row_id: str, owner_id: str, data: Dict[str, Any]) -> None:
    data = _enc(dict(data))
    sets = ", ".join(f"{k}=?" for k in data)
    with cursor() as cur:
        cur.execute(
            f"update {table} set {sets} where id=? and owner_id=?",
            [*data.values(), row_id, owner_id],
        )


def get(table: str, row_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
    with cursor() as cur:
        cur.execute(f"select * from {table} where id=? and owner_id=?", (row_id, owner_id))
        return _dec(cur.fetchone())


def list_where(table: str, owner_id: str, where: str = "", args: tuple = (),
               order: str = "") -> List[Dict[str, Any]]:
    q = f"select * from {table} where owner_id=?"
    params: List[Any] = [owner_id]
    if where:
        q += f" and {where}"
        params.extend(args)
    if order:
        q += f" order by {order}"
    with cursor() as cur:
        cur.execute(q, params)
        return [_dec(r) for r in cur.fetchall()]


def delete(table: str, row_id: str, owner_id: str) -> None:
    with cursor() as cur:
        cur.execute(f"delete from {table} where id=? and owner_id=?", (row_id, owner_id))


def count(table: str, owner_id: str, where: str = "", args: tuple = ()) -> int:
    q = f"select count(*) as n from {table} where owner_id=?"
    params: List[Any] = [owner_id]
    if where:
        q += f" and {where}"
        params.extend(args)
    with cursor() as cur:
        cur.execute(q, params)
        return int(cur.fetchone()["n"])


# --- profiles (special: keyed by auth id, no owner_id column) ---------------
def get_profile(user_id: str) -> Optional[Dict[str, Any]]:
    with cursor() as cur:
        cur.execute("select * from profiles where id=?", (user_id,))
        return _dec(cur.fetchone())


def get_profile_by_email(email: str) -> Optional[Dict[str, Any]]:
    with cursor() as cur:
        cur.execute("select * from profiles where email=?", (email.lower(),))
        return _dec(cur.fetchone())


def create_profile(data: Dict[str, Any]) -> str:
    data = dict(data)
    data.setdefault("id", _uid())
    data.setdefault("created_at", _now())
    data.setdefault("updated_at", _now())
    if data.get("email"):
        data["email"] = data["email"].lower()
    cols = ", ".join(data.keys())
    ph = ", ".join("?" for _ in data)
    with cursor() as cur:
        cur.execute(f"insert into profiles ({cols}) values ({ph})", list(data.values()))
    return data["id"]


def update_profile(user_id: str, data: Dict[str, Any]) -> None:
    data = dict(data)
    data["updated_at"] = _now()
    sets = ", ".join(f"{k}=?" for k in data)
    with cursor() as cur:
        cur.execute(f"update profiles set {sets} where id=?", [*data.values(), user_id])
