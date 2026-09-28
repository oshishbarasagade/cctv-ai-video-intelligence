# Subli 2.0 — Implementation Plan (Phase 1)

Companion to `ARCHITECTURE_AUDIT.md`. Maps the 37 spec phases into ordered,
verifiable milestones. Rule: **each phase must actually work — tests, typecheck,
lint, build — before the next** (spec §64). No fake buttons, no mocked AI in the
final product (spec §65).

---

## Target architecture

```
frontend/ (React + TypeScript + Vite + Tailwind + shadcn/ui)
   React Router (guarded) · TanStack Query · Zustand · Recharts · Lucide

backend/  (FastAPI + Pydantic)
   routers/  auth projects videos analysis search chat evidence reports live
   ai/       sampling captioning detection tracking ocr embeddings events
             temporal_memory event_graph claude_service
   worker/   async processing pipeline (job queue → stages → Realtime updates)

Supabase   Auth (Google+email) · Postgres+RLS · Storage (private, signed URLs)
           Realtime (jobs/events/alerts) · pgvector (semantic search)

Claude API (backend-only)  Ask Subli · Find the Story · What Changed? · reports
```

## Data model (Supabase, RLS on every table, scoped to `auth.uid()`)

`profiles · projects · videos · processing_jobs · frames · objects · subjects
(persons) · ocr_results · captions · environment_states · events ·
event_relations · embeddings(vector) · evidence · reports · zones · alerts ·
cameras`

---

## Milestones (grouping the 37 phases)

### M0 — Foundations (no external creds needed)
- **P1** Audit ✅ (this doc + `ARCHITECTURE_AUDIT.md`)
- Scaffold TS frontend (Tailwind + shadcn + router shell); restructure backend into routers/ai/worker packages; remove payments.
- Write all Supabase **SQL migrations** (tables, indexes, FKs, RLS, storage policies) — files first, applied when the project exists.
- ✅ Gate: frontend builds & typechecks; backend imports; migrations lint.

### M1 — Auth & account (P2–P8)  ⚠️ needs Supabase + Google OAuth
- Supabase client (front `anon`, back `service_role`), Google + email auth, `/auth/callback`, session guards, `profiles` (auto-create, no dupes).
- ✅ Gate: real login (Google + email), protected routes redirect, profile persists.

### M2 — Onboarding → Dashboard → Projects (P9 UI parts, P6–P12)
- Onboarding flow, dashboard (real metrics), project CRUD (real Supabase records), project page.
- ✅ Gate: create project persists; dashboard reflects DB; RLS isolates users.

### M3 — Upload & processing spine (P13–P16)  ⚠️ Supabase Storage
- Drag/drop upload → private `videos` bucket (signed URLs), backend validation, `videos` + `processing_jobs` records, **async worker**, real staged status via **Realtime**, metadata extraction (FFmpeg/OpenCV), retry on failure.
- ✅ Gate: upload persists; refresh restores job state; stages update for real.

### M4 — Core CV pipeline (P17–P21)
- Smart frame sampling (QUICK/BALANCED/DEEP), object detection (YOLO), anonymous person tracking, OCR, BLIP captioning — all with **offline fallbacks** + fixture tests.
- ✅ Gate: pipeline produces objects/tracks/ocr/captions rows for a sample clip.

### M5 — Intelligence layer (P22–P25 core, P17–P19)
- Event engine, temporal memory (`environment_states`), event graph, interactive **timeline** (click → seek).
- ✅ Gate: events generated from detections; timeline seeks video exactly.

### M6 — Analysis Workspace UI (P20, P41–P43)
- Left nav / center player / right insights / bottom timeline; key frames; video player with full controls + shortcuts.
- ✅ Gate: workspace wired to real analysis data end-to-end.

### M7 — Semantic search + Claude (P21–P24, P29–P31)  ⚠️ needs Claude key
- Embeddings → pgvector search; **ClaudeReasoningService** (Ask Subli, Find the Story, What Changed?, summaries) — backend-only, grounded in stored data, no hallucination.
- ✅ Gate: search returns real timestamps; Ask Subli cites real timestamps or says "couldn't determine".

### M8 — Evidence & reports (P32–P33)
- Evidence board (add/remove/preview/export); **PDF report** with metadata, timeline, observations, disclaimers.
- ✅ Gate: evidence persists; PDF generates from real analysis.

### M9 — Live intelligence (P34–P38)
- Webcam (MediaDevices) + lightweight realtime detection; smart zones (polygons); alerts (Realtime + optional email); Command Center; RTSP-ready backend ingestion design (no raw RTSP in browser).
- ✅ Gate: webcam detects; zone entry fires a realtime alert.

### M10 — Polish & hardening (P32,P39,P48–P58)
- Analytics (real values), demo mode, presentation mode, command palette (⌘K), keyboard shortcuts, error handling everywhere, security audit (RLS/secrets/validation/rate-limit/CORS/headers), Docker (front/back/**worker**), CI (lint+typecheck+test+build+docker), full docs set.
- ✅ Gate: `docker compose up` runs the stack; CI green; docs complete.

---

## Immediate next actions

1. **M0 now** (no credentials required): TS frontend scaffold, backend restructure, remove payments, author Supabase migrations.
2. In parallel, user provisions the **blockers** (see audit §4): Supabase project, Google OAuth, Claude API key. Needed from M1 onward.

## Definition of done (spec §65)
Auth real · Google login works · projects/uploads persist · processing updates
for real · **AI results not mocked** · timeline synced · Ask Subli grounded ·
search on real data · reports real · RLS enforced · no secrets exposed · tests
& build green.
