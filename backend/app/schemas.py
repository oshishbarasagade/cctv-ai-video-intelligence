"""Pydantic request/response models."""
from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, EmailStr, Field


# --- auth ---
class SignupRequest(BaseModel):
    full_name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


# --- onboarding / profile ---
class OnboardingRequest(BaseModel):
    full_name: Optional[str] = None
    use_case: Optional[str] = None       # security|research|accessibility|...
    experience: Optional[str] = None     # beginner|intermediate|advanced
    completed: bool = True


# --- projects ---
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1)
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# --- analysis / chat ---
class AskRequest(BaseModel):
    video_id: str
    question: str = Field(min_length=1)


class WhatChangedRequest(BaseModel):
    video_id: str
    ts_a: float
    ts_b: float


class SearchRequest(BaseModel):
    video_id: str
    query: str = Field(min_length=1)
    limit: int = 10


class EvidenceCreate(BaseModel):
    project_id: str
    video_id: Optional[str] = None
    ts: Optional[float] = None
    frame_path: Optional[str] = None
    event_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[List[str]] = None
    confidence: Optional[float] = None


class EvidenceUpdate(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None
    sort: Optional[int] = None


class ErrorResponse(BaseModel):
    status: str = "error"
    message: str
    code: int
