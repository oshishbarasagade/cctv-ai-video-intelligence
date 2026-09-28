# Subli — AI Video Intelligence Platform

**See what your videos say.**

Subli analyzes silent video / CCTV footage and converts raw visual information
into structured, searchable, time-aware intelligence: what is visible, what
changes, what events happen, and how they relate over time.

> Built as a full-stack product (not a prototype). Runs **fully offline** with no
> credentials, then lights up real services (Supabase, Claude, YOLO, OCR) when
> you provide them.

---

## What it does

| Capability | Description |
|-----------|-------------|
| **Visual understanding** | Object detection, anonymous person tracking, OCR, scene captioning — frame by frame |
| **Temporal memory** | A running environment state (people / vehicles / activity) over time |
| **Event engine** | Discrete events (PERSON_ENTERED, VEHICLE_ARRIVED, SCENE_CHANGED, …) from detections |
| **Event graph** | How events relate and lead into one another |
| **Semantic search** | "person near entrance" jumps straight to the moment (embeddings + vector search) |
| **Ask Subli** | Question the footage; answers are grounded in stored analysis and cite timestamps |
| **Find the Story / What Changed?** | Chronological narrative; before/after diff between two moments |
| **Smart subtitles** | Context-aware `.srt` / `.vtt` |
| **Evidence board + PDF reports** | Collect key moments; export a professional report |
| **Live intelligence** | Webcam detection, smart zones, real-time alerts, Command Center |

## Why it exists

Most CCTV footage is silent and unwatched. Subli makes it understandable and
searchable — for security, research, and accessibility — using computer vision
and grounded AI reasoning, **without** face recognition or identity inference.

## Tech stack

**Frontend** React · TypeScript · Vite · Tailwind · shadcn-style UI · React
Router · TanStack Query · Zustand · Recharts · lucide-react
**Backend** Python · FastAPI · OpenCV · (optional: PyTorch, BLIP, YOLO, OCR,
sentence-transformers) · Claude API
**Data/Infra** Supabase (Postgres + Auth + Storage + Realtime + pgvector) —
offline mirror on SQLite · Docker · GitHub Actions

## Offline-first design

Every external dependency has a working offline fallback, so the whole product
runs and is testable with zero setup:

| Feature | Real | Offline default |
|---------|------|-----------------|
| Auth/DB | Supabase | SQLite + signed-token auth |
| Storage | Supabase Storage (signed URLs) | local private folders |
| Captioning | Hugging Face BLIP | heuristic scene describer |
| Object detection | YOLOv8 | foreground-blob heuristic |
| OCR | EasyOCR / Tesseract | skipped (never fabricated) |
| Embeddings | sentence-transformers | deterministic hashing vectors |
| Reasoning | Claude API | grounded template answers |
| Reports | ReportLab PDF | plain-text fallback |

## Quick start (offline, no credentials)

**Backend** — http://127.0.0.1:8000 (docs at `/docs`)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend** — http://localhost:5173
```bash
cd frontend
npm install
npm run dev
```

Open the app → **Try a live demo** (instant seeded analysis) or sign up, create a
project, and upload a video.

### Docker
```bash
docker compose up --build
# frontend http://localhost:3000 · backend http://localhost:8000
```

## Tests
```bash
cd backend && pytest -q          # 12 offline end-to-end tests
cd frontend && npm run build     # typecheck + build
```

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design & data flow
- [AI_PIPELINE.md](docs/AI_PIPELINE.md) — the CV + reasoning pipeline
- [DATABASE.md](docs/DATABASE.md) — schema, RLS, migrations
- [API.md](docs/API.md) — endpoint reference
- [SECURITY.md](docs/SECURITY.md) — auth, isolation, privacy
- [SETUP.md](docs/SETUP.md) — local dev & enabling real services
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) — Docker & cloud
- [DEMO.md](docs/DEMO.md) — the demonstration flow
- [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md) · [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Privacy & AI trust

- Anonymous tracking only — **no** facial recognition or identity inference.
- Raw video is stored privately and can be deleted after processing.
- Every AI result preserves timestamp, source, model, and confidence.
- Ask Subli only uses stored analysis; if evidence doesn't exist, it says so.

## Known limitations

- Offline heuristics are coarse vs. real models — install YOLO/BLIP/OCR for
  production-grade detection.
- The offline worker runs in-process (FastAPI BackgroundTasks); use a queue for
  scale.
- Live RTSP camera ingestion is architected server-side but not wired in the
  offline build.
