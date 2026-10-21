"""SQLite database — offline mirror of the Supabase schema.

Same tables/columns as supabase/migrations/0001_init.sql so the switch to
Postgres later is a driver change, not a redesign. Owner-scoping (the offline
equivalent of RLS) is enforced in the store layer.
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager

from . import config

_LOCAL = threading.local()

SCHEMA = """
create table if not exists profiles (
  id text primary key,
  full_name text, email text unique, avatar_url text,
  use_case text, experience text,
  onboarding_completed integer not null default 0,
  password_hash text,                       -- offline auth only
  created_at real, updated_at real
);
create table if not exists projects (
  id text primary key, owner_id text not null,
  name text not null, description text,
  created_at real, updated_at real
);
create table if not exists videos (
  id text primary key, project_id text not null, owner_id text not null,
  storage_path text not null, original_name text, size_bytes integer,
  duration_sec real, width integer, height integer, fps real,
  codec text, format text, created_at real
);
create table if not exists processing_jobs (
  id text primary key, video_id text not null, owner_id text not null,
  status text not null default 'queued', stage text, progress integer default 0,
  mode text default 'balanced',
  error_code text, error_message text, failed_stage text,
  created_at real, updated_at real
);
create table if not exists frames (
  id text primary key, video_id text not null, owner_id text not null,
  ts real not null, storage_path text, created_at real
);
create table if not exists objects (
  id text primary key, video_id text not null, owner_id text not null,
  frame_id text, type text not null, confidence real, bbox text, ts real not null,
  subject_id text
);
create table if not exists subjects (
  id text primary key, video_id text not null, owner_id text not null,
  label text not null, first_seen real, last_seen real, trajectory text
);
create table if not exists ocr_results (
  id text primary key, video_id text not null, owner_id text not null,
  frame_id text, text text not null, confidence real, bbox text, ts real not null
);
create table if not exists captions (
  id text primary key, video_id text not null, owner_id text not null,
  frame_id text, text text not null, model text, confidence real, ts real not null
);
create table if not exists environment_states (
  id text primary key, video_id text not null, owner_id text not null,
  ts real not null, state text not null
);
create table if not exists events (
  id text primary key, video_id text not null, owner_id text not null,
  type text not null, start_time real not null, end_time real,
  description text, confidence real,
  source_frames text, related_objects text, related_subjects text
);
create table if not exists event_relations (
  id text primary key, video_id text not null, owner_id text not null,
  from_event text, to_event text, relation text
);
create table if not exists embeddings (
  id text primary key, video_id text not null, owner_id text not null,
  kind text not null, ref_id text, ts real, content text, embedding text
);
create table if not exists evidence (
  id text primary key, project_id text not null, video_id text, owner_id text not null,
  ts real, frame_path text, event_id text, description text, confidence real, created_at real,
  title text, note text, tags text, sort integer default 0
);
create table if not exists reports (
  id text primary key, project_id text not null, video_id text, owner_id text not null,
  storage_path text, created_at real
);
create table if not exists zones (
  id text primary key, project_id text, owner_id text not null,
  name text not null, polygon text not null
);
create table if not exists alerts (
  id text primary key, owner_id text not null, project_id text, zone_id text,
  rule text not null, channel text default 'realtime', created_at real
);
create table if not exists cameras (
  id text primary key, owner_id text not null, project_id text,
  name text not null, location text, status text default 'offline', created_at real
);
create index if not exists idx_projects_owner on projects(owner_id);
create index if not exists idx_videos_project on videos(project_id);
create index if not exists idx_jobs_video on processing_jobs(video_id);
create index if not exists idx_objects_video_ts on objects(video_id, ts);
create index if not exists idx_events_video_time on events(video_id, start_time);
"""


def _conn() -> sqlite3.Connection:
    c = getattr(_LOCAL, "conn", None)
    if c is None:
        c = sqlite3.connect(str(config.DB_PATH), check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("pragma journal_mode=WAL;")
        c.execute("pragma foreign_keys=on;")
        _LOCAL.conn = c
    return c


def init_db() -> None:
    conn = _conn()
    conn.executescript(SCHEMA)
    conn.commit()


@contextmanager
def cursor():
    conn = _conn()
    cur = conn.cursor()
    try:
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
