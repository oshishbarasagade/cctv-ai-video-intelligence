# Real Integration Status

Audit of the current offline adapters and exactly what must be replaced to reach
a real end-to-end system. **No production code has been modified yet** — this is
the pre-work report the integration plan requires.

Legend: 🟥 mock/offline (must replace) · 🟩 already real · 🟦 real but upgradeable

---

## 1. Adapter-by-adapter audit

| Area | File | Now | Target | Needs |
|------|------|-----|--------|-------|
| Auth | `app/security.py` | 🟥 PBKDF2 + signed local token | Supabase Auth (Google + email), `/auth/callback` | **Supabase project + Google OAuth** |
| DB | `app/db.py`, `app/store.py` | 🟥 SQLite, in-code owner scoping | Supabase Postgres + **RLS** | **Supabase** (migrations already written) |
| Storage | `config.VIDEO_DIR`/`ARTIFACT_DIR` | 🟥 local private folders | Supabase Storage, signed URLs | **Supabase** (policies written) |
| Realtime | FE polls `/videos/jobs/{id}` | 🟥 polling | Supabase Realtime subscription | **Supabase** |
| Vector search | `app/ai/embeddings.py` | 🟥 hashing vectors + Python cosine | pgvector + `sentence-transformers` | pip + **Supabase** (or local pgvector) |
| Object detection | `app/ai/detection.py` | 🟥 foreground-blob heuristic | **YOLOv8** (ultralytics) | `pip install ultralytics` (no key) |
| Person tracking | `app/ai/pipeline.py` | 🟥 coarse presence → Person #N | ByteTrack via YOLO track | `pip install ultralytics` (no key) |
| Captioning | `app/ai/captioning.py` | 🟥 heuristic scene text | **BLIP** image-to-text | `pip install transformers torch` (no key) |
| OCR | `app/ai/ocr.py` | 🟥 returns nothing | **EasyOCR** / Tesseract | `pip install easyocr` (no key) |
| Reasoning | `app/ai/reasoning.py` | 🟥 grounded templates | **Claude API** (Ask/Story/Changed/summary) | **CLAUDE_API_KEY** |
| Frame extraction | `app/ai/sampling.py` | 🟩 **real OpenCV** (bg-subtraction, scene change) | — | none |
| Event engine | `app/ai/analysis.py` | 🟩 derived from real CV features | quality improves with real detection | none |
| Temporal memory | `app/ai/analysis.py` | 🟩 real state from counts | — | none |
| Subtitles | `app/ai/analysis.py` | 🟩 real `.srt`/`.vtt` from captions | — | none |
| Processing worker | `app/worker/processor.py` | 🟦 real async, real progress (in-process) | queue worker + Realtime status | Supabase (optional queue) |
| Reports | `app/reporting.py` | 🟩 real PDF from DB records | — | none |
| Evidence | `app/routers/evidence.py` | 🟩 persisted, survives refresh (SQLite) | move to Supabase | Supabase |

## 2. Hardcoded/demo paths to isolate (Definition of Done: zero hardcoded analysis)

- `app/routers/demo.py` — generates a **synthetic** clip, then runs the **real**
  pipeline. Its events are real (CV-derived), **not** hardcoded. Action: keep it
  clearly labelled as demo, never on the production upload path. ✅ already separate.
- `frontend/src/pages/Landing.tsx` — the "00:12 Person enters…" timeline is
  **static marketing decoration** on the public landing page, not an analysis
  result. Action: leave (it's not in any production analysis path).
- No other hardcoded events/objects/people exist in analysis endpoints — all read
  from the DB, which is written only by the pipeline.

## 3. What blocks full "real" — credentials required

These cannot be created from this environment; you must provide them:

1. **Supabase project** → `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (Phases 1, 6-infra, 8, 10-persist).
2. **Google OAuth** app (client id/secret) configured in Supabase Auth (Phase 1).
3. **Claude API key** → `CLAUDE_API_KEY` (Phase 5). Billed usage.

## 4. What can go real RIGHT NOW — no credentials, only downloads

The code already auto-detects and switches to real models; enabling them is a
`pip install` + `FORCE_FALLBACK=0`, then verify:

| Phase | Install | Size (approx) |
|-------|---------|---------------|
| 3 detection + tracking | `ultralytics` (pulls torch) | ~1–2 GB |
| 3 captioning | `transformers` (uses torch) + model | ~1–2 GB weights |
| 3 OCR | `easyocr` | ~100 MB + models |
| 6 embeddings | `sentence-transformers` | ~100 MB |

CPU works (slower); a GPU is optional. Total first-run download ~3–5 GB.

## 5. Phase readiness

| Phase | Can do now (no keys) | Needs keys |
|-------|----------------------|-----------|
| 1 Supabase | — | ✅ Supabase + Google |
| 2 Video pipeline | 🟩 already real (OpenCV); add FFmpeg metadata | — |
| 3 Vision AI (YOLO/BLIP/OCR) | ✅ pip installs | — |
| 4 Event engine (real inputs) | ✅ follows Phase 3 | — |
| 5 Claude reasoning | — | ✅ Claude key |
| 6 Semantic search | ✅ sentence-transformers (local cosine); pgvector needs Supabase | partial |
| 7 Subtitles | 🟩 already real | — |
| 8 Evidence persistence | 🟩 real (SQLite); Supabase = upgrade | partial |
| 9 Reports | 🟩 real PDF from DB | — |
| 10 Live camera | 🟩 real webcam detection; Realtime alerts need Supabase | partial |

## 6. Recommended order

1. **Now, no keys:** Phase 3 (real YOLO + BLIP + OCR) → Phase 6 (real embeddings)
   → re-verify Phase 4/7 with real inputs. This makes *"upload a real video →
   real objects/people/OCR/captions/events/search"* true.
2. **On your keys:** Phase 1 (Supabase auth/DB/storage/realtime/pgvector/RLS) →
   Phase 5 (Claude) → migrate persistence (8/10) to Supabase.

Every phase: implement → tests → typecheck → build → test with a real video →
verify DB persistence → fix → continue.

---

## 7. Progress log (live)

### Environment
- C: drive was full (0.2 GB) — created a project **venv on D:** (`backend/.venv`)
  and redirected all model caches to `backend/.models` (also on D:).
- Installed: torch 2.14 (cpu), ultralytics 8.4, transformers 5.17, easyocr 1.7,
  sentence-transformers 6.1, supabase 2.31.

### Phase 3 — Real Vision AI  ✅ verified
- **YOLOv8 object detection: REAL.** On a downloaded real sample clip
  (`person-bicycle-car-detection.mp4`) it detected **31 objects**:
  15 person, 7 car, 7 bicycle, 1 bus, 1 phone.
- **Tracking:** real detections → anonymous `Person #N` subjects (ByteTrack IDs
  when assigned, else derived from max concurrent persons). No faces/identity.
- **BLIP captioning:** switched to `BlipProcessor`/`BlipForConditionalGeneration`
  (transformers 5.x removed the `image-to-text` pipeline task). Re-verifying.
- **EasyOCR + embeddings (sentence-transformers):** wired, model dirs on D:.
- Pipeline uses YOLO counts to drive events/temporal states when available.

### Phase 1 — Supabase  🟨 wired, awaiting schema
- Keys verified live: Storage API 200, Auth Admin 200, service-role valid.
- **Backend wired:** `app/supa.py` (client + auth + storage), `store_supa.py`
  (Postgres via PostgREST), `store.py` dispatcher (sqlite | supabase), auth
  router uses Supabase Auth for email/password, token verify via Supabase.
- App boots with `backend: supabase`. Frontend needs **no change** for
  email/password (backend returns a real Supabase session token).
- **BLOCKER:** tables not yet created. The Supabase MCP in this session is a
  different account (permission denied on the user's project), and API keys
  can't run DDL. **User must run `supabase/apply_all.sql` in the SQL Editor once.**
- Google OAuth deferred (no Google keys yet); Supabase Storage for media is the
  next step after DB persistence is verified.

### Phase 1-4, 6-7 — END-TO-END PROVEN ✅ (2026-09-28)
Real video upload → real analysis persisted in Supabase Postgres:
- frames 27 · **objects 137** (77 person, 27 car, 24 bicycle, 7 phone, 2 motorcycle)
  · subjects 7 · captions 27 (BLIP: "a man is standing in a parking lot")
  · events 34 · embeddings 61 · environment_states 27
- Staged job progress persisted live; auth user + profile via trigger; all rows
  carry the correct owner_id. Zero hardcoded analysis in the path.

### Supabase Storage — DONE ✅ (2026-09-28)
- Video uploaded to private `videos` bucket; keyframes + `.srt`/`.vtt` to `artifacts`.
- Verified live: `videos/<uid>/<pid>/<vid>.mp4`, `artifacts/<uid>/<vid>/frame_*.jpg`
  + `subtitles.srt/.vtt`; signed URL works; serving endpoints fall back to
  downloading from the bucket when the local copy is gone (durable across restarts).

### New features added
- **Live AI detection overlay** — real YOLO boxes drawn on the video during playback.
- **Export analysis as JSON** — full real analysis download.
- **Presentation Mode** (spec §58) — stepped full-screen demo at `/present/:videoId`,
  driven entirely by the real analysis (keyframe with boxes, object/people/event
  stats, real caption). Launch via the **Present** button in the workspace.

### Phase 5 Claude — via Supabase Edge Function — LIVE ✅ (2026-09-28)
- Edge Function deployed as `hyper-endpoint`; secret `Claud_Api` set; backend
  points at `/functions/v1/hyper-endpoint` with model `claude-haiku-4-5-20251001`
  (the only family this key can access — older models are blocked).
- Verified live: Ask Subli returns a real Claude answer, grounded in stored facts,
  and honestly declines when the facts don't cover the question. `/health` →
  `reasoning: edge`.

### Phase 5 Claude — via Supabase Edge Function (superseded by the LIVE note above) 🟨
- Edge Function written: `supabase/functions/claude/index.ts` (holds the key as a
  Supabase secret; calls the Anthropic API; returns `{ text }`).
- Backend reasoning resolves in order: direct `CLAUDE_API_KEY` → **Edge Function**
  (`{SUPABASE_URL}/functions/v1/claude`) → offline-grounded. Answers stay grounded
  in stored analysis; the model only rephrases the facts. Graceful fallback if the
  function isn't deployed (auto-disables after one failed call).
- **User action to activate** (Supabase CLI):
  ```
  supabase functions deploy claude
  supabase secrets set CLAUDE_API_KEY=sk-ant-...
  # optional: supabase secrets set CLAUDE_MODEL=claude-3-5-sonnet-latest
  ```
  Then `/health` shows `reasoning: edge` and Ask Subli uses real Claude.

### Remaining
- **Google OAuth** — needs Google client id/secret + provider enabled in Supabase
  (also intended for an Edge Function / Supabase Auth provider config).
- **Realtime** — frontend polls job status (works); Supabase Realtime is an upgrade.
- **OCR** returned 0 on the sample (no on-screen text) — correct, not a bug.

### Current model in use
- Detection/tracking: **yolov8n** · Captioning: **Salesforce/blip-image-captioning-base**
  · OCR: **EasyOCR (en)** · Embeddings: **all-MiniLM-L6-v2** · Reasoning: offline
  grounded (Claude pending key) · DB/Auth: **Supabase** (pending schema).
