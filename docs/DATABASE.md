# Database

Two backends, one schema. Offline: **SQLite** (`backend/app/db.py`). Online:
**Supabase Postgres** via `supabase/migrations/*.sql`.

## Tables

`profiles` · `projects` · `videos` · `processing_jobs` · `frames` · `objects` ·
`subjects` (anonymous persons) · `ocr_results` · `captions` ·
`environment_states` · `events` · `event_relations` · `embeddings` (vector) ·
`evidence` · `reports` · `zones` · `alerts` · `cameras`

Every analysis table carries `owner_id` and (where relevant) `video_id` /
`project_id` foreign keys.

## Migrations (Supabase)

- `0001_init.sql` — tables, indexes, FKs, `pgvector`, `updated_at` triggers
- `0002_rls.sql` — RLS on every table (owner-only), auto-create-profile trigger
- `0003_storage.sql` — private `videos` + `artifacts` buckets, owner-scoped policies

Apply:
```bash
supabase db push          # or paste each file into the SQL editor
```

## Row Level Security

Online, RLS enforces isolation in the database:
```sql
create policy projects_owner_all on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
```
Offline, the same guarantee is enforced in `store.py` — every query filters by
`owner_id`, so User A can never read User B's rows (tested in
`tests/test_app.py::test_project_crud_and_rls`).

## Embeddings

`embeddings.embedding` is `vector(384)` in Postgres (ivfflat cosine index) and a
JSON array offline (cosine computed in Python). Change the dimension if you swap
the embedding model.
