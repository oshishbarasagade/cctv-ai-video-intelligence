"""Subli 2.0 — AI Video Intelligence Platform (backend).

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs

Offline-first: with no SUPABASE_*/CLAUDE_API_KEY it runs on SQLite + local
storage + heuristic CV + a grounded reasoning stub. Real services light up when
their env vars are provided.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config
from .db import init_db
from .routers import (analysis, auth, chat, dashboard, demo, evidence, live,
                      projects, reports, search, videos)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("subli")

# Ensure SQLite tables exist (offline mode only; Supabase uses its own schema).
if config.OFFLINE_MODE:
    init_db()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if config.OFFLINE_MODE:
        init_db()
    logger.info("Subli 2.0 started. offline_mode=%s claude=%s",
                config.OFFLINE_MODE, config.CLAUDE_ENABLED)
    yield


app = FastAPI(title="Subli 2.0 API", version="2.0.0",
              description="AI Video Intelligence Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- consistent error envelope: {status, message, code} (spec §46) ----------
@app.exception_handler(StarletteHTTPException)
async def _http_exc(_r: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code,
                        content={"status": "error", "message": exc.detail,
                                 "code": exc.status_code})


@app.exception_handler(RequestValidationError)
async def _validation_exc(_r: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422,
                        content={"status": "error",
                                 "message": "Invalid request.",
                                 "code": 422, "details": exc.errors()})


@app.exception_handler(Exception)
async def _unhandled(_r: Request, exc: Exception):  # pragma: no cover
    logger.exception("Unhandled error")
    return JSONResponse(status_code=500,
                        content={"status": "error",
                                 "message": "Internal server error", "code": 500})


@app.get("/health")
def health():
    from . import store
    from .ai.reasoning import service
    reasoning = ("direct" if service.claude else
                 "edge" if (service.edge_url and not service._edge_disabled) else
                 "offline-grounded")
    return {"status": "ok", "version": "2.0.0",
            "offline_mode": config.OFFLINE_MODE,
            "backend": store.BACKEND,
            "reasoning": reasoning}


for r in (auth.router, dashboard.router, projects.router, videos.router,
          analysis.router, search.router, chat.router, evidence.router,
          reports.router, live.router, demo.router):
    app.include_router(r)
