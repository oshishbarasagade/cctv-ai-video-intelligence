# CCTV Optimization using AI — Complete Build Specification

> Hand this whole file to ChatGPT (or any coding assistant) to rebuild the project.
> It describes **what to build, the tech stack, the AI pipeline, the database, every
> API endpoint, and every frontend page.** A ready-to-paste build prompt is at the end.

---

## 1. What the project is

An **end-to-end AI video intelligence platform** that turns silent CCTV footage into
**structured, searchable, time-aware intelligence**. A user uploads a video; the system
runs a staged computer-vision pipeline, stores everything as queryable records, and lets
the user **search in plain language** and **ask questions** (e.g. *"what happened at 00:45?"*).
Every AI answer is **grounded** — it is produced only from the stored analysis and **cites
exact timestamps**, so the model never fabricates evidence. It is **privacy-preserving**
(anonymous tracking only, no face recognition) and has a **real-time webcam live mode**.

**Product name (UI):** Subli · **Brand color:** `#E11D48` (crimson).

---

## 2. Key features

- Upload a video → async analysis with **real, resumable progress** (stage + %).
- **Object detection** (YOLOv8), **anonymous multi-object tracking** (centroid/IoU, "Person #1").
- **Scene captioning** (BLIP) and **OCR** (EasyOCR) with timestamps.
- **Temporal memory** (running scene state) + **event engine** (PERSON_ENTERED, VEHICLE_ARRIVED, …).
- **Trajectory reconstruction**, **dwell time** (loitering), **activity heatmap**.
- **Semantic search** over captions/events using sentence embeddings + vector index.
- **Grounded reasoning** via an LLM (Claude) through a serverless edge function: Ask,
  "Find the Story" (narrative), "What Changed?" (diff of two moments), "Explain this moment".
- **Time-coded subtitles** (.srt / .vtt), **auto highlights**, **evidence board**, **PDF reports**.
- **Live mode**: webcam → server YOLO → overlays, user-drawn **zones** + debounced **alerts**.
- **Multi-camera Command Center** dashboard.
- **Offline-first**: runs fully without cloud/models using SQLite + heuristic fallbacks.

---

## 3. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, React Router 7, Zustand (state), TanStack Query, Axios, Recharts, lucide-react |
| Backend | Python 3.10+, FastAPI, Uvicorn, OpenCV, Pydantic |
| AI models | Ultralytics **YOLOv8-nano** (detection), **BLIP-base** (captioning), **EasyOCR** (text), **all-MiniLM-L6-v2** (384-d embeddings) |
| Reasoning | **Claude** LLM, called only from a Supabase **Edge Function** (key stays server-side) |
| Data | **Supabase** = PostgreSQL + **pgvector** + Row-Level Security + Auth + private Storage (signed URLs) |
| Offline fallback | SQLite DB + local file storage + heuristic CV + hashing-based search + template reasoning |
| Reports | reportlab (PDF) |

---

## 4. Architecture (3-tier)

```
Browser (React SPA)
      │  REST (Bearer token)
      ▼
FastAPI server  ──►  Analysis pipeline (runs async in a background worker)
      │                 sampling → detection → tracking → OCR → captioning
      │                 → temporal memory/events → embeddings
      ▼
Supabase: PostgreSQL (+pgvector, RLS) · private Object Storage · Edge Function (Claude)
```
- The CV pipeline is independent of the web API and persistence (swap a stage without touching the rest).
- The LLM is invoked from **exactly one** server location (the edge function), never the client.
- Read endpoints expose each artifact (frames, objects, subjects, ocr, captions, states, events, embeddings) as independent resources.
- `OFFLINE_MODE = not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)`.

---

## 5. AI pipeline (stages, in order)

1. **Intelligent frame sampling** (OpenCV) — keyframes via scene-change/motion cues. Modes: `quick | balanced | deep`.
2. **Object detection** — YOLOv8 → class, confidence, bbox `[x,y,w,h]`. Labels: person, car, truck, bus, motorcycle, bicycle, bag, phone, …
3. **Anonymous tracking** — link detections across frames by centroid + IoU → subjects "Person #1"… (no face/identity).
4. **Scene captioning** — BLIP caption per representative frame.
5. **OCR** — EasyOCR → text + bbox + confidence.
6. **Temporal memory + event engine** — maintain scene state `{people, vehicles, activity}`; state transitions emit events (PERSON_ENTERED, PERSON_LEFT, VEHICLE_ARRIVED, MULTIPLE_PEOPLE, SCENE_CHANGED), each with timestamp/confidence/source frames. Sequential events linked into a "leads-to" graph.
7. **Trajectory / dwell / density** — re-associate detections into paths (polylines), compute dwell time, aggregate into a grid heatmap.
8. **Embeddings** — embed captions + event descriptions (all-MiniLM-L6-v2, 384-d) into pgvector for semantic search.

**Grounding contract (the key idea):** for any question, the server first assembles a compact
set of **facts** from the stored analysis (events, states, ocr, captions; for a time query, the
people/objects/text at that instant). The LLM is given **only those facts** and must answer
using them, preserve timestamps, and **decline when evidence is insufficient**. If the LLM is
unavailable, return the grounded facts directly (graceful degradation).

---

## 6. Database schema (Supabase/PostgreSQL, 18 tables)

All tables have `owner_id uuid` + **Row-Level Security** (a user sees only their rows).
Timestamps `ts`/`start_time` are **seconds** into the video.

- **profiles**(id→auth.users, full_name, email, avatar_url, use_case, experience, onboarding_completed, …)
- **projects**(id, owner_id, name, description, …)
- **videos**(id, project_id, owner_id, storage_path, original_name, duration_sec, width, height, fps, codec, format)
- **processing_jobs**(id, video_id, owner_id, status[queued|running|completed|failed], stage, progress 0..100, mode[quick|balanced|deep], error_code, error_message, failed_stage)
- **frames**(id, video_id, owner_id, ts, storage_path[thumbnail])
- **objects**(id, video_id, owner_id, frame_id, type, confidence, bbox jsonb [x,y,w,h], ts, subject_id)
- **subjects**(id, video_id, owner_id, label["Person #1"], first_seen, last_seen, trajectory jsonb [{ts,bbox}])
- **ocr_results**(id, video_id, owner_id, frame_id, text, confidence, bbox jsonb, ts)
- **captions**(id, video_id, owner_id, frame_id, text, model, confidence, ts)
- **environment_states**(id, video_id, owner_id, ts, state jsonb {people,vehicles,activity})
- **events**(id, video_id, owner_id, type, start_time, end_time, description, confidence, source_frames jsonb, related_objects jsonb, related_subjects jsonb)
- **event_relations**(id, video_id, owner_id, from_event, to_event, relation[leads_to|co_occurs])
- **embeddings**(id, video_id, owner_id, kind[frame|event|caption], ref_id, ts, content, embedding **vector(384)**)
- **evidence**(id, project_id, video_id, owner_id, ts, frame_path, title, note, tags)
- **reports**(id, project_id/video_id, owner_id, storage_path, sections, created_at)
- **zones**(id, camera/video, owner_id, polygon/rect in normalized coords, label)
- **alerts**(id, owner_id, zone_id, type, ts, message)
- **cameras**(id, owner_id, name, source, status)  — for the Command Center

Also: `pgvector` extension, an `embeddings` ANN index, a DB trigger that creates a `profiles`
row on signup, and a private Storage bucket for videos/thumbnails accessed via signed URLs.

---

## 7. Backend (FastAPI) — modules & every endpoint

**Layout:** `app/main.py` (app + CORS + error envelope), `config.py`, `deps.py` (auth dep),
`security.py` (offline tokens), `supa.py` (Supabase client + `verify_token`), `store.py`
(facade over `store_sqlite.py` / `store_supa.py`), `worker/processor.py` (async pipeline runner),
`reporting.py` (PDF), `ai/*` (pipeline stages), `routers/*`.

`ai/`: `sampling, detection, tracking, captioning, ocr, embeddings, trajectories, highlights,
reasoning, analysis, pipeline`.

**Auth is a Bearer token.** Offline: own signed token. Online: Supabase access token verified
via `supabase.auth.get_user(token)`.

### Endpoints (grouped by router prefix)

- **/auth** — `POST /signup`, `POST /login` (→ `{token, user}`), `GET /me`, `POST /onboarding`
- **/projects** — `GET /` (list), `POST /` (create), `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`, `POST /reorder`, `GET /{id}/search` (semantic search within project)
- **/videos** — `POST /upload` (multipart video → create video + queue job)
- **/analysis/{video_id}** — `GET /overview`, `/status`, `/keyframes`, `/frame`, `/stream`,
  `/objects`, `/people`, `/ocr`, `/captions`, `/events`, `/states`, `/memory`, `/highlights`,
  `/trajectories`, `/dwell`, `/heatmap`, `/graph`, `/summary`, `/quality`, `/explain`,
  `/similar`, `/subtitles.{ext}` (srt|vtt); jobs: `GET /jobs/{job_id}`, `POST /jobs/{job_id}/retry`
- **/chat** — `POST /ask` ({video_id, question, ts?}), `POST /find-story`, `POST /investigate`, `POST /what-changed`
- **/dashboard** — `GET /metrics`, `GET /analytics`, `GET /compare`
- **/evidence** — `POST /`, `PATCH /{id}`, `DELETE /{id}`
- **/reports** — `POST /{video_id}/generate`, `GET /{report_id}/download`
- **/live** — `POST /detect` (webcam frame → detections), `GET /zones`, `POST /zones`,
  `DELETE /zones/{id}`, `GET /alerts`, `POST /alerts`, `POST /alerts/log`, `GET /cameras`, `POST /cameras`
- **/demo** — `POST /seed` (seed a ready demo analysis for new users)

All responses use a consistent error envelope `{status, message, code}`.

---

## 8. Frontend (React + TS) — pages & flow

**Routing** (React Router): `/` Landing, `/login` Login (+ Google OAuth via Supabase),
`/auth/callback`, `/onboarding`, `/dashboard`, `/projects/:id`, `/analysis/:videoId`,
`/live`, `/command-center`, `/compare`, `/present/:videoId`, `*` NotFound.
Protected routes via `<ProtectedRoute>`; auth state in Zustand (`store/auth.ts`),
token in `localStorage`, Axios interceptor attaches `Authorization: Bearer`.

**Pages**
- **Landing** — premium dark animated marketing page (brand #E11D48).
- **Login** — email/password + "Continue with Google" (Supabase OAuth) + "Try a live demo".
- **Onboarding** — collect use_case / experience.
- **Dashboard** — metrics tiles (videos/events/people/objects) + recent projects + "New Analysis".
- **Project** — upload videos, list, open analysis.
- **Analysis** (core workspace) — 3-column layout `[240px | video | 340px]`:
  - left rail: tabs (Highlights, Events, Objects, People, OCR, Memory, Dwell) + list
  - center: `<video>` + overlays (detection **Boxes**, movement **Paths**, **Heatmap**) + controls + event **Timeline** (markers seek)
  - right: **AI Summary**, **Current moment** (caption + Add evidence / Explain / Similar), **Ask Subli** (free text + "what happened at mm:ss" + Summary/Vehicles/Find the Story)
  - top bar: Subtitles, Report, Investigate, Graph, Quality, JSON export, Present
  - ⚠️ use `grid-cols-[240px_minmax(0,1fr)_340px]` + `min-w-0` to avoid horizontal overflow
- **Live** — webcam capture → POST frames to `/live/detect` at a controlled rate → draw boxes;
  draw zones (normalized coords) → debounced zone-entry alerts; Live Insights panel.
- **Command Center** — multi-camera grid, each tile streams/analyzes a webcam.
- **Compare** — two analyzed videos side by side (What Changed).
- **Presentation** — step through the analysis as slides.

**UI kit:** `components/ui/{button,card,input,modal,misc}.tsx`, `AppShell` (sidebar + brand logo),
`CommandPalette` (keyboard ⌘K), `Analytics` (charts). Tailwind tokens incl. `brand=#E11D48`.

---

## 9. Setup & run

**Backend**
```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # (Windows) or source .venv/bin/activate
pip install -r requirements.txt
# optional real models: transformers torch ultralytics easyocr sentence-transformers anthropic supabase
uvicorn app.main:app --host 127.0.0.1 --port 8000
```
`.env` (backend): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`CLAUDE_EDGE_URL`, `CORS_ORIGINS`, `AUTH_SECRET`, `MAX_UPLOAD_MB`, `MAX_FRAMES`.
Leave Supabase vars empty to run **fully offline** (SQLite).

**Frontend**
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```
`.env` (frontend): `VITE_API_BASE` (backend URL; default `/api`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

**Supabase**: run `supabase/migrations/*.sql` (init, RLS, storage, evidence), enable `pgvector`,
deploy the Claude **edge function** with the Claude API key as a secret, enable Google Auth provider.

**Deploy**: frontend → Vercel (Root Dir = `frontend`, Vite, `vercel.json` SPA rewrite).
Backend (heavy ML) → a server/VM or a dev machine exposed via a tunnel (not Vercel).

---

## 10. ⭐ Ready-to-paste BUILD PROMPT for ChatGPT

> Build a full-stack **AI Video Intelligence web app** called "Subli" that turns silent CCTV
> footage into searchable, time-aware, **grounded** insights. Use **React + TypeScript + Vite +
> Tailwind** (brand color #E11D48) for the frontend and **Python FastAPI** for the backend, with
> **Supabase** (PostgreSQL + pgvector + RLS + Auth + Storage) for data and a **Supabase Edge
> Function calling Claude** for reasoning. It must also run **fully offline** with SQLite +
> heuristic fallbacks when Supabase/models/keys are absent.
>
> Pipeline (async background worker): intelligent frame sampling (OpenCV) → **YOLOv8** object
> detection → anonymous centroid/IoU tracking ("Person #1", no face recognition) → **EasyOCR**
> text → **BLIP** captions → temporal-memory scene state + event engine (PERSON_ENTERED,
> VEHICLE_ARRIVED, …) → trajectories/dwell/heatmap → **all-MiniLM-L6-v2** embeddings into pgvector.
>
> **Grounding rule:** for every question, assemble facts from the stored analysis only, pass just
> those facts to Claude, cite exact timestamps, and decline when evidence is missing.
>
> Build these DB tables (all with owner_id + RLS): profiles, projects, videos, processing_jobs,
> frames, objects, subjects, ocr_results, captions, environment_states, events, event_relations,
> embeddings(vector 384), evidence, reports, zones, alerts, cameras.
>
> Backend REST routers: /auth, /projects, /videos (upload), /analysis/{video_id}/* (overview,
> status, objects, people, ocr, captions, events, states, memory, highlights, trajectories,
> dwell, heatmap, graph, summary, quality, explain, similar, subtitles.srt/vtt), /chat (ask,
> find-story, investigate, what-changed), /search, /dashboard, /evidence, /reports, /live
> (detect, zones, alerts, cameras), /demo (seed). Auth = Bearer token (Supabase online, signed
> token offline). Consistent error envelope {status, message, code}.
>
> Frontend pages: Landing (premium animated), Login (email/pass + Google OAuth + demo),
> Onboarding, Dashboard, Project, **Analysis** (3-column workspace: left tabs/list, center video
> with detection boxes + paths + heatmap overlays + event timeline, right AI summary + current
> moment + Ask panel), Live (webcam → /live/detect with zones + alerts), Command Center
> (multi-camera), Compare, Presentation. Use React Router, Zustand for auth, TanStack Query,
> Axios with a Bearer interceptor. For the Analysis 3-column grid use
> `grid-cols-[240px_minmax(0,1fr)_340px]` + `min-w-0` to prevent overflow.
>
> Deliver it incrementally: (1) scaffold + offline SQLite + auth, (2) upload + pipeline + storage,
> (3) analysis workspace + overlays, (4) semantic search + grounded Ask, (5) live mode, (6) reports
> + evidence, (7) Supabase + Google OAuth, (8) deploy (frontend on Vercel). Explain each step.

---

*Generated from the actual Subli / CCTV-Optimization-using-AI codebase.*
