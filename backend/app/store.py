"""Store dispatcher.

Picks the persistence backend once, at import, based on configuration:
  * OFFLINE_MODE  -> SQLite (store_sqlite)
  * otherwise     -> Supabase Postgres (store_supa)

Both modules expose the same function names, so the rest of the app imports
`store` and is unaware of which backend is active.
"""
from __future__ import annotations

from . import config

if config.OFFLINE_MODE:
    from .store_sqlite import (  # noqa: F401
        count, create_profile, delete, get, get_profile, get_profile_by_email,
        insert, list_where, update, update_profile,
    )
    BACKEND = "sqlite"
else:
    from .store_supa import (  # noqa: F401
        count, create_profile, delete, get, get_profile, get_profile_by_email,
        insert, list_where, update, update_profile,
    )
    BACKEND = "supabase"
