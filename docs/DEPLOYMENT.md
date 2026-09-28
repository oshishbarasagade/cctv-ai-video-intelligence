# Deployment

## Docker (both services)
```bash
docker compose up --build
# frontend http://localhost:3000  ·  backend http://localhost:8000
```
- `backend/Dockerfile` — FastAPI + OpenCV (uvicorn `app.main:app`).
- `frontend/Dockerfile` — Vite build served by nginx; `/api` proxied to backend.
- `backend/data` is volume-mounted so SQLite + artifacts persist.

To disable offline mode, pass `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`CLAUDE_API_KEY` as environment variables to the `backend` service.

## Cloud options

| Component | Options |
|-----------|---------|
| Frontend | Vercel / Netlify / any static host (build `frontend`, serve `dist`) |
| Backend | Render / Railway / Fly.io / GCP Cloud Run (container) |
| DB/Auth/Storage | Supabase (managed) |
| Models | GPU instance or Hugging Face Inference for BLIP/YOLO |

Point the frontend at the backend with `VITE_API_BASE=https://api.example.com`
at build time.

## CI
`.github/workflows/deploy.yml` runs on push/PR: backend tests (offline),
frontend typecheck + build, then Docker image builds. CI fails on any error.

## Production checklist
- Set a strong `AUTH_SECRET` (or use Supabase Auth).
- Restrict `CORS_ORIGINS` to your frontend origin.
- Serve over HTTPS; add rate limiting and secure headers at the edge.
- Enable Supabase RLS and review Storage policies.
