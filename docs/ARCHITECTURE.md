# Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (React + TS + Vite + Tailwind)                       │
│  Landing · Auth · Onboarding · Dashboard · Project · Analysis │
│  Workspace · Live · Command Center · Command Palette (⌘K)     │
│  state: Zustand (auth) · data: TanStack Query · charts: Recharts│
└───────────────┬──────────────────────────────────────────────┘
                │  /api (Vite proxy in dev, nginx in prod)
┌───────────────▼──────────────────────────────────────────────┐
│ Backend (FastAPI)                                             │
│  routers/  auth projects videos analysis search chat          │
│            evidence reports live dashboard demo               │
│  ai/       sampling detection tracking ocr captioning         │
│            analysis(events/temporal/subtitles) embeddings     │
│            reasoning(ClaudeReasoningService)                  │
│  worker/   processor (async pipeline runner)                  │
│  store + db (SQLite offline / Supabase online)                │
└───────────────┬──────────────────────────────────────────────┘
                │
        ┌───────▼────────┐   ┌──────────────┐   ┌──────────────┐
        │ SQLite / Postgres│  │ local / Supabase│ │ Claude API   │
        │ (owner-scoped)   │  │ Storage         │ │ (backend only)│
        └──────────────────┘  └────────────────┘  └──────────────┘
```

## Request → analysis flow

1. **Upload** → `POST /videos/upload` streams the file to private storage,
   creates a `videos` row and a `processing_jobs` row, and schedules the worker.
2. **Worker** runs the pipeline off the request thread, updating the job's
   `stage`/`progress` at each step. The frontend polls `/videos/jobs/{id}`
   (→ Supabase Realtime online).
3. **Pipeline** (see AI_PIPELINE.md) writes frames, objects, subjects, ocr,
   captions, environment_states, events, event_relations, embeddings, subtitles.
4. **Read** endpoints under `/analysis/{video_id}/*` power the workspace; the
   raw video streams from `/analysis/{video_id}/stream`.
5. **Reasoning** (`/chat/*`) and **search** (`/search`) read stored analysis only.

## Design principles

- **Offline-first with real fallbacks** — same interfaces, swappable backends.
- **Owner-scoped everywhere** — every query filters by `owner_id` (offline RLS).
- **Grounded AI** — reasoning never invents; it cites stored timestamps.
- **Separation** — the CV pipeline is independent of the API and the store;
  Claude is called only in `ai/reasoning.py`, never from the frontend.
