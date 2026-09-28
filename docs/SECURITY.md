# Security & Privacy

## Authentication
- Offline: passwords hashed with PBKDF2 (`security.py`); signed, expiring bearer
  tokens. Online: Supabase Auth (Google OAuth + email), verified server-side.
- Every protected route resolves the user via `deps.current_user_id`.

## Authorization / data isolation (spec §44)
- Every query is scoped to `owner_id`. User A can never access User B's projects,
  videos, events, evidence, reports, or cameras.
- Online, Postgres **RLS** enforces this at the database (`0002_rls.sql`).
- Covered by `tests/test_app.py::test_project_crud_and_rls`.

## Storage (spec §45)
- Videos and artifacts live in **private** buckets/folders.
- Online: signed URLs only; path convention `<uid>/<project>/<file>` with
  owner-scoped storage policies (`0003_storage.sql`). No permanent public URLs.
- Raw video can be deleted after processing; generated outputs kept separately.

## Secrets (spec §49)
- Never exposed to the frontend: `SUPABASE_SERVICE_ROLE_KEY`, `CLAUDE_API_KEY`,
  `GOOGLE_CLIENT_SECRET`. Frontend uses only `VITE_SUPABASE_URL` / anon key.
- Claude is called **only** on the backend (`ai/reasoning.py`).
- `.env` and any key files are git-ignored.

## Input validation
- File type/extension **and** size validated server-side (not just the UI).
- Pydantic models validate every request body; consistent error envelope.

## Privacy (spec §61)
- **No** facial recognition, face identification, or identity inference.
- Anonymous tracking only ("Person #1").
- AI results are presented as observations, never absolute facts; the PDF report
  carries a human-review disclaimer.

## Hardening checklist for production
CORS to trusted origins · HTTPS · rate limiting · secure headers · rotate
`AUTH_SECRET` · enable Supabase RLS · review Storage policies.
