# Setup

## Prerequisites
- Python 3.11+
- Node 20+

## 1. Backend (offline)
```bash
cd backend
python -m venv env
env\Scripts\activate         # Windows  (source env/bin/activate elsewhere)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
`http://127.0.0.1:8000/docs`

## 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
`http://localhost:5173` (proxies `/api` → backend).

## 3. Enable real services (optional)
Copy `backend/.env.example` → `backend/.env` and fill in:

| Var | Enables |
|-----|---------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Postgres/Auth/Storage (leave blank = SQLite) |
| `CLAUDE_API_KEY` | Ask Subli / reports via Claude |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth (configured in Supabase Auth) |

Real models:
```bash
pip install transformers torch ultralytics easyocr sentence-transformers anthropic
```
Set `FORCE_FALLBACK=0`.

### Supabase
```bash
supabase db push        # applies supabase/migrations/*.sql
```
Enable Google in Supabase → Authentication → Providers, set the redirect to
`<app>/auth/callback`.

## Tests
```bash
cd backend && pytest -q
cd frontend && npm run build
```
