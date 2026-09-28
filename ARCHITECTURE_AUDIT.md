# Subli 2.0 — Architecture Audit (Phase 1)

Date: 2026-09-27
Author: senior engineering review
Scope: audit the existing Subli 1.0 repository before the 2.0 rebuild into an
**AI Video Intelligence Platform**.

---

## 1. What exists today (Subli 1.0)

A working full-stack subtitle generator built to the original developer guide.

**Backend** (`backend/`, Python + FastAPI):
| File | Purpose | Quality |
|------|---------|---------|
| `main.py` | FastAPI app, routes (`/analyze`, `/save_result`, `/create-checkout-session`, `/webhook`, …) | Solid, clean error envelope |
| `subtitle_engine.py` | OpenCV frame sampling + BLIP/fallback captioning + `.srt`/`.vtt` | Reusable core |
| `firebase_store.py` | Firestore **or** local-JSON persistence | Firebase — being replaced by Supabase |
| `payments.py` | Stripe checkout + webhook | **Out of scope** for 2.0 (no payments) |
| `config.py`, `schemas.py` | Env config + Pydantic models | Reusable patterns |
| `tests/test_api.py` | 9 passing pytest e2e tests | Good foundation |

**Frontend** (`frontend/`, React + **JavaScript** + Vite):
- Plain-JS React (no TypeScript), custom CSS (no Tailwind/shadcn)
- Components: `AuthForm`, `VideoUpload`, `SubtitleList`, `PaymentButton`, `Dashboard`, `Navbar`
- Firebase auth (guest fallback), axios API client, EmailJS utils

**Infra:** backend/frontend Dockerfiles, `docker-compose.yml`, GitHub Actions CI.

---

## 2. Gap analysis: 1.0 → 2.0 target

Subli 2.0 is a **fundamentally larger product**. 1.0 delivers ~1 of the 18
target capabilities (smart subtitles). The rest are new:

| 2.0 capability | Exists in 1.0? |
|----------------|----------------|
| Smart subtitles | ✅ (basic) |
| Object detection (YOLO) | ❌ new |
| Anonymous person tracking | ❌ new |
| OCR | ❌ new |
| AI captioning (BLIP) | ⚠️ present but not wired to real model by default |
| Temporal memory / environment states | ❌ new |
| Event engine | ❌ new |
| Event timeline (interactive) | ❌ new |
| Event graph | ❌ new |
| Semantic search (pgvector) | ❌ new |
| Ask Subli (Claude) | ❌ new |
| Find the Story / What Changed? | ❌ new |
| Evidence board | ❌ new |
| PDF reports | ❌ new |
| Live webcam + zones + alerts | ❌ new |
| Command Center / Analytics | ❌ new |
| Async processing jobs + realtime | ❌ new |
| Supabase (Auth/DB/Storage/Realtime/pgvector) | ❌ new (replaces Firebase) |

---

## 3. Classification: REUSE / REFACTOR / REPLACE / REMOVE / NEW

### ♻️ REUSE (keep as-is or lightly)
- `subtitle_engine.py` frame-sampling + `.srt`/`.vtt` serialization logic — becomes the base of the CV pipeline's captioning + subtitle stages.
- Backend error-envelope pattern (`{status, message, code}`).
- `config.py` env-driven pattern.
- Docker + CI scaffolding (extend, don't rewrite).
- Pytest structure and the "runs offline with fallbacks" testing philosophy.

### 🔧 REFACTOR
- `main.py` → split monolith into FastAPI **routers** (`auth`, `projects`, `videos`, `analysis`, `search`, `chat`, `evidence`, `reports`, `live`).
- `subtitle_engine.py` → move under a new `ai/` package; split captioning out from serialization; add detection/OCR/tracking as sibling modules.
- Frontend → **migrate JS → TypeScript**, add Tailwind + shadcn/ui, React Router guarded routes, TanStack Query.

### 🔁 REPLACE
- `firebase_store.py` → **Supabase** (Postgres + Auth + Storage + Realtime + pgvector). Keep the thin store-interface idea, new implementation.
- `AuthContext` (Firebase/guest) → Supabase Auth (Google OAuth + email).
- Custom CSS `index.css` → Tailwind design tokens (white-first system).

### 🗑️ REMOVE (out of scope for 2.0)
- `payments.py`, `PaymentButton.jsx`, `pages/Success.jsx`, `pages/Cancel.jsx`, `sendPaymentEmail.js` — **no payments** in 2.0.
- Stripe deps from `requirements.txt`; EmailJS payment path.
- (Email notifications: optional — demote, not core.)

### 🆕 NEW (the bulk of 2.0)
- Async **processing worker** + `processing_jobs` state machine + Supabase Realtime status.
- CV pipeline: object detection (YOLO), person tracking, OCR, keyframe/scene sampling.
- **Temporal memory** (`environment_states`), **event engine**, **event graph**.
- **Embeddings + pgvector semantic search.**
- **ClaudeReasoningService** (backend-only): Ask Subli, Find the Story, What Changed?, report/subtitle generation.
- Evidence board, **PDF report** generator.
- Live webcam (MediaDevices), smart zones, alerts, Command Center, analytics.
- Full Supabase **SQL migrations** with RLS + storage policies.
- Analysis Workspace UI (video player + timeline + panels), demo mode, presentation mode, command palette, keyboard shortcuts.

---

## 4. Hard external dependencies (BLOCKERS — user must provide)

These cannot be created from this environment; the product cannot be *fully*
functional without them:

1. **Supabase project** → `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. **Google OAuth** app → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (configured in Supabase Auth).
3. **Claude API key** → `CLAUDE_API_KEY` (Ask Subli / Find the Story / reports — **billed usage**).
4. **CV model weights** (downloaded at build/first-run): YOLO, an OCR engine (EasyOCR/PaddleOCR/Tesseract), BLIP, a sentence-embedding model. Large (multi-GB); GPU strongly recommended for real-time.

Everything not depending on the above (schema, migrations, UI scaffolding, CV
pipeline code, tests with fixtures/mocks) can be built first.

---

## 5. Risk & reality notes

- **Scope:** 37 phases; this is a multi-session build, not a single pass. We proceed phase-by-phase, verifying each before the next (spec §64).
- **Compute:** real object detection + OCR + embeddings on CPU is slow. We keep the 1.0 "fallback/offline" philosophy so the app and tests run without GPU or downloads, and light up real models when available.
- **Claude cost:** every Ask Subli / report call is billed. Backend-only, rate-limited, never per-frame.
- **Privacy:** anonymous tracking only — no face recognition/identity inference (spec §61). Raw video deleted after processing.

---

## 6. Verdict

**Non-destructive evolution, not a from-scratch rewrite.** Reuse the CV/subtitle
core and infra patterns; replace the persistence/auth layer with Supabase;
migrate the frontend to TS + Tailwind + shadcn; build the large new
intelligence layer on top. See `IMPLEMENTATION_PLAN.md`.
