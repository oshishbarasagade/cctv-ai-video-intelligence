"""Subli 2.0 backend configuration.

Runs fully OFFLINE by default: SQLite database, local file storage, mock auth,
heuristic CV, and a local reasoning stub. When real credentials are supplied
(SUPABASE_*, CLAUDE_API_KEY) the same interfaces switch to the real services.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
DATA_DIR = BASE_DIR / "data"
DB_PATH = Path(os.getenv("SUBLI_DB", str(DATA_DIR / "subli.db")))
VIDEO_DIR = DATA_DIR / "videos"
ARTIFACT_DIR = DATA_DIR / "artifacts"                      # thumbnails, srt, pdf

MODEL_DIR = BASE_DIR / ".models"                # keep large weights off C:
for _d in (DATA_DIR, VIDEO_DIR, ARTIFACT_DIR, MODEL_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# Redirect all model caches to MODEL_DIR (must be set before heavy libs import).
os.environ.setdefault("HF_HOME", str(MODEL_DIR / "hf"))
os.environ.setdefault("TORCH_HOME", str(MODEL_DIR / "torch"))
os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", str(MODEL_DIR / "st"))
os.environ.setdefault("YOLO_CONFIG_DIR", str(MODEL_DIR / "yolo"))
EASYOCR_DIR = str(MODEL_DIR / "easyocr")

# --- CORS ---
_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
CORS_ORIGINS = [o.strip() for o in _origins.split(",") if o.strip()]

# --- Auth (offline mock; JWT secret only used to sign local tokens) ---
AUTH_SECRET = os.getenv("AUTH_SECRET", "dev-only-secret-change-me")

# --- Upload limits / validation ---
ALLOWED_VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "500")) * 1024 * 1024

# --- CV pipeline ---
SAMPLING_MODES = {"quick": 2.0, "balanced": 1.0, "deep": 0.5}   # seconds/frame
MAX_FRAMES = int(os.getenv("MAX_FRAMES", "300"))
FORCE_FALLBACK = os.getenv("FORCE_FALLBACK", "0") == "1"
CAPTION_MODEL = os.getenv("CAPTION_MODEL", "Salesforce/blip-image-captioning-base")

# --- External services (empty => offline stubs) ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY", "")

OFFLINE_MODE = not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
CLAUDE_ENABLED = bool(CLAUDE_API_KEY)

# Claude via a Supabase Edge Function (keeps the API key as a Supabase secret).
# Defaults to the project's function URL when Supabase is configured.
CLAUDE_EDGE_URL = os.getenv(
    "CLAUDE_EDGE_URL",
    f"{SUPABASE_URL}/functions/v1/claude" if SUPABASE_URL else "",
)
# Model to request (this account has the Claude 4.5 family).
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
