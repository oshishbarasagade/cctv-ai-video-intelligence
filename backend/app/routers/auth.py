"""Auth routes (offline mock, Supabase-shaped).

Endpoints mirror what the frontend will call against Supabase Auth later:
signup, login, me, onboarding. Passwords are hashed; a signed bearer token is
returned. Never returns the password hash.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException

from .. import config, security, store
from ..deps import current_user_id
from ..schemas import AuthResponse, LoginRequest, OnboardingRequest, SignupRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _public(profile: dict) -> dict:
    return {k: v for k, v in profile.items() if k != "password_hash"}


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest):
    if not config.OFFLINE_MODE:
        # Real Supabase Auth: creates the user; a DB trigger creates the profile.
        from .. import supa
        try:
            session = supa.sign_up(body.email, body.password, body.full_name)
        except Exception as exc:
            raise HTTPException(status_code=409, detail=f"Sign-up failed: {exc}")
        return AuthResponse(token=session["token"], user=session["user"])

    if store.get_profile_by_email(body.email):
        raise HTTPException(status_code=409, detail="Email already registered.")
    uid = store.create_profile({
        "full_name": body.full_name,
        "email": body.email,
        "password_hash": security.hash_password(body.password),
        "onboarding_completed": 0,
    })
    profile = store.get_profile(uid)
    return AuthResponse(token=security.issue_token(uid), user=_public(profile))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest):
    if not config.OFFLINE_MODE:
        from .. import supa
        try:
            session = supa.sign_in(body.email, body.password)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        return AuthResponse(token=session["token"], user=session["user"])

    profile = store.get_profile_by_email(body.email)
    if not profile or not security.verify_password(body.password,
                                                    profile.get("password_hash")):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return AuthResponse(token=security.issue_token(profile["id"]),
                        user=_public(profile))


@router.get("/me")
def me(uid: str = Depends(current_user_id)):
    profile = store.get_profile(uid)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return _public(profile)


@router.post("/onboarding")
def onboarding(body: OnboardingRequest, uid: str = Depends(current_user_id)):
    patch = {"onboarding_completed": 1 if body.completed else 0}
    if body.full_name:
        patch["full_name"] = body.full_name
    if body.use_case:
        patch["use_case"] = body.use_case
    if body.experience:
        patch["experience"] = body.experience
    store.update_profile(uid, patch)
    return _public(store.get_profile(uid))
