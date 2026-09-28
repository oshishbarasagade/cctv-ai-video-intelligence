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
