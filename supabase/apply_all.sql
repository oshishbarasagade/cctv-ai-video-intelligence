-- Subli 2.0 — run this once in Supabase → SQL Editor → New query → Run
-- Combines 0001_init + 0002_rls + 0003_storage

-- Subli 2.0 — initial schema
-- Postgres + RLS. Every table is scoped to the authenticated user (auth.uid()).
-- Apply with the Supabase CLI or the SQL editor. Idempotent-ish for dev.

create extension if not exists "uuid-ossp";
create extension if not exists vector;      -- pgvector for semantic search

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  use_case text,                 -- security | research | accessibility | ...
  experience text,               -- beginner | intermediate | advanced
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_owner on public.projects(owner_id);

-- ---------------------------------------------------------------------------
-- videos
-- ---------------------------------------------------------------------------
create table if not exists public.videos (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,        -- private bucket path
  original_name text,
  size_bytes bigint,
  duration_sec double precision,
  width int, height int, fps double precision,
  codec text, format text,
  created_at timestamptz not null default now()
);
create index if not exists idx_videos_project on public.videos(project_id);
create index if not exists idx_videos_owner on public.videos(owner_id);

-- ---------------------------------------------------------------------------
-- processing_jobs (async state machine)
-- ---------------------------------------------------------------------------
create table if not exists public.processing_jobs (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued',   -- queued|running|completed|failed
  stage text,                              -- metadata|sampling|detection|...
  progress int not null default 0,         -- 0..100
  mode text not null default 'balanced',   -- quick|balanced|deep
  error_code text, error_message text, failed_stage text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_jobs_video on public.processing_jobs(video_id);

-- ---------------------------------------------------------------------------
-- frames (sampled keyframes)
-- ---------------------------------------------------------------------------
create table if not exists public.frames (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  ts double precision not null,          -- seconds
  storage_path text,                     -- thumbnail path
  created_at timestamptz not null default now()
);
create index if not exists idx_frames_video_ts on public.frames(video_id, ts);

-- ---------------------------------------------------------------------------
-- objects (detections)
-- ---------------------------------------------------------------------------
create table if not exists public.objects (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  frame_id uuid references public.frames(id) on delete set null,
  type text not null,                    -- person|car|bag|door|...
  confidence real,
  bbox jsonb,                            -- [x,y,w,h]
  ts double precision not null,
  subject_id uuid                        -- optional link to subjects
);
create index if not exists idx_objects_video_ts on public.objects(video_id, ts);

-- ---------------------------------------------------------------------------
-- subjects (anonymous person tracks — NO identity, NO faces)
-- ---------------------------------------------------------------------------
create table if not exists public.subjects (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null,                   -- "Person #1"
  first_seen double precision,
  last_seen double precision,
  trajectory jsonb                       -- [{ts,bbox}, ...]
);
create index if not exists idx_subjects_video on public.subjects(video_id);

-- ---------------------------------------------------------------------------
-- ocr_results
-- ---------------------------------------------------------------------------
create table if not exists public.ocr_results (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  frame_id uuid references public.frames(id) on delete set null,
  text text not null,
  confidence real,
  bbox jsonb,
  ts double precision not null
);
create index if not exists idx_ocr_video_ts on public.ocr_results(video_id, ts);

-- ---------------------------------------------------------------------------
-- captions (BLIP / fallback scene descriptions)
-- ---------------------------------------------------------------------------
create table if not exists public.captions (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  frame_id uuid references public.frames(id) on delete set null,
  text text not null,
  model text,
  confidence real,
  ts double precision not null
);
create index if not exists idx_captions_video_ts on public.captions(video_id, ts);

-- ---------------------------------------------------------------------------
-- environment_states (temporal memory)
-- ---------------------------------------------------------------------------
create table if not exists public.environment_states (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  ts double precision not null,
  state jsonb not null                   -- {people:n, vehicles:n, door:"open"}
);
create index if not exists idx_states_video_ts on public.environment_states(video_id, ts);

-- ---------------------------------------------------------------------------
-- events + relations (event graph)
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null,                    -- PERSON_ENTERED|DOOR_OPENED|...
  start_time double precision not null,
  end_time double precision,
  description text,
  confidence real,
  source_frames jsonb, related_objects jsonb, related_subjects jsonb
);
create index if not exists idx_events_video_time on public.events(video_id, start_time);

create table if not exists public.event_relations (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_event uuid references public.events(id) on delete cascade,
  to_event uuid references public.events(id) on delete cascade,
  relation text                          -- leads_to | co_occurs | ...
);

-- ---------------------------------------------------------------------------
-- embeddings (pgvector semantic search over frames/events/captions)
-- ---------------------------------------------------------------------------
create table if not exists public.embeddings (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.videos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                    -- frame | event | caption
  ref_id uuid,                           -- id of the referenced row
  ts double precision,
  content text,
  embedding vector(384)                  -- all-MiniLM-L6-v2 dim; adjust to model
);
create index if not exists idx_embeddings_video on public.embeddings(video_id);
-- ANN index (cosine). Build after data load for best results.
create index if not exists idx_embeddings_vec on public.embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------------
-- evidence
-- ---------------------------------------------------------------------------
create table if not exists public.evidence (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  ts double precision,
  frame_path text,
  event_id uuid references public.events(id) on delete set null,
  description text,
  confidence real,
  created_at timestamptz not null default now()
);
create index if not exists idx_evidence_project on public.evidence(project_id);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text,                     -- generated PDF
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- zones + alerts + cameras (live)
-- ---------------------------------------------------------------------------
create table if not exists public.zones (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  polygon jsonb not null                 -- [[x,y],...] normalized
);

create table if not exists public.alerts (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  rule jsonb not null,                   -- {when:"zone_enter", type:"person"}
  channel text default 'realtime',       -- realtime | email
  created_at timestamptz not null default now()
);

create table if not exists public.cameras (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  location text,
  status text default 'offline',         -- live | offline
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_jobs_touch on public.processing_jobs;
create trigger trg_jobs_touch before update on public.processing_jobs
  for each row execute function public.touch_updated_at();

-- Subli 2.0 — Row Level Security
-- Enable RLS on every table and scope all access to the owner (auth.uid()).
-- User A can NEVER read/write User B's rows (spec §44).

-- Helper: enable RLS + owner-only policy for a table whose owner column is owner_id.
do $$
declare t text;
begin
  foreach t in array array[
    'projects','videos','processing_jobs','frames','objects','subjects',
    'ocr_results','captions','environment_states','events','event_relations',
    'embeddings','evidence','reports','zones','alerts','cameras'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_owner_all on public.%I;', t, t);
    execute format($p$
      create policy %I_owner_all on public.%I
        for all
        using (owner_id = auth.uid())
        with check (owner_id = auth.uid());
    $p$, t, t);
  end loop;
end $$;

-- profiles: a user can see/edit only their own profile row (id = auth.uid()).
alter table public.profiles enable row level security;
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());
drop policy if exists profiles_self_upsert on public.profiles;
create policy profiles_self_upsert on public.profiles
  for insert with check (id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Subli 2.0 — private storage buckets + policies
-- Videos and generated artifacts are private; access via signed URLs only
-- (spec §45). Path convention: <auth.uid()>/<project_id>/<file>.

insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('artifacts', 'artifacts', false)   -- thumbnails, srt/vtt, pdf reports
on conflict (id) do nothing;

-- Owner-only access: the first path segment must equal the user's uid.
do $$
declare b text;
begin
  foreach b in array array['videos','artifacts']
  loop
    execute format($p$drop policy if exists %I_owner_read on storage.objects;$p$, b);
    execute format($p$
      create policy %I_owner_read on storage.objects
        for select to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, b, b);

    execute format($p$drop policy if exists %I_owner_write on storage.objects;$p$, b);
    execute format($p$
      create policy %I_owner_write on storage.objects
        for insert to authenticated
        with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, b, b);

    execute format($p$drop policy if exists %I_owner_delete on storage.objects;$p$, b);
    execute format($p$
      create policy %I_owner_delete on storage.objects
        for delete to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, b, b);
  end loop;
end $$;
