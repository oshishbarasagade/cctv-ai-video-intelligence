"""End-to-end offline tests for Subli 2.0.

Everything runs with no credentials: SQLite, local storage, heuristic CV,
hashing embeddings, grounded reasoning. Starlette's TestClient runs the upload
BackgroundTask synchronously, so processing is complete when upload returns.
"""
import os
import tempfile

# Force offline (SQLite) + heuristics + isolated temp DB before importing the app,
# regardless of any real Supabase/model config in .env.
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["FORCE_FALLBACK"] = "1"
os.environ["SUBLI_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# --- helpers ---------------------------------------------------------------
def _auth_headers(email):
    client.post("/auth/signup", json={
        "full_name": "Test User", "email": email, "password": "secret123"})
    r = client.post("/auth/login", json={"email": email, "password": "secret123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def sample_video(tmp_path_factory):
    """Synthetic clip: brightness changes + a moving rectangle (motion/blobs)."""
    path = tmp_path_factory.mktemp("media") / "clip.mp4"
    w, h, fps, secs = 160, 120, 10, 4
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    assert writer.isOpened()
    for i in range(fps * secs):
        bg = 30 if i < fps else (130 if i < 2 * fps else 220)
        frame = np.full((h, w, 3), bg, dtype=np.uint8)
        x = (i * 6) % (w - 30)                        # moving tall rectangle
        cv2.rectangle(frame, (x, 40), (x + 20, 100), (0, 0, 0), -1)
        writer.write(frame)
    writer.release()
    return path


# --- tests -----------------------------------------------------------------
def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["offline_mode"] is True


def test_auth_flow_and_isolation():
    h = _auth_headers("a@test.com")
    me = client.get("/auth/me", headers=h)
    assert me.status_code == 200 and me.json()["email"] == "a@test.com"
    assert "password_hash" not in me.json()
    # no token -> 401 with standard envelope
    r = client.get("/auth/me")
    assert r.status_code == 401 and r.json()["status"] == "error"


def test_duplicate_signup_rejected():
    _auth_headers("dup@test.com")
    r = client.post("/auth/signup", json={
        "full_name": "X", "email": "dup@test.com", "password": "secret123"})
    assert r.status_code == 409


def test_project_crud_and_rls():
    h1 = _auth_headers("owner@test.com")
    h2 = _auth_headers("other@test.com")
    pid = client.post("/projects", json={"name": "Campus"}, headers=h1).json()["id"]
    # owner sees it
    assert client.get(f"/projects/{pid}", headers=h1).status_code == 200
    # other user must NOT (RLS/isolation, spec §44)
    assert client.get(f"/projects/{pid}", headers=h2).status_code == 404


def test_full_pipeline(sample_video):
    h = _auth_headers("pipe@test.com")
    pid = client.post("/projects", json={"name": "Analysis"}, headers=h).json()["id"]

    with open(sample_video, "rb") as fh:
        r = client.post("/videos/upload", headers=h,
                        data={"project_id": pid, "mode": "balanced"},
                        files={"file": ("clip.mp4", fh, "video/mp4")})
    assert r.status_code == 200, r.text
    video_id, job_id = r.json()["video_id"], r.json()["job_id"]

    # Background task already ran -> job completed.
    job = client.get(f"/videos/jobs/{job_id}", headers=h).json()
    assert job["status"] == "completed", job
    assert job["progress"] == 100

    ov = client.get(f"/analysis/{video_id}/overview", headers=h).json()
    assert ov["counts"]["frames"] >= 1
    assert ov["video"]["duration_sec"] == pytest.approx(4.0, abs=0.8)

    events = client.get(f"/analysis/{video_id}/events", headers=h).json()["events"]
    assert len(events) >= 1
    caps = client.get(f"/analysis/{video_id}/captions", headers=h).json()["captions"]
    assert len(caps) >= 2

    # subtitles downloadable
    srt = client.get(f"/analysis/{video_id}/subtitles.srt", headers=h)
    assert srt.status_code == 200 and "-->" in srt.text


def test_search_and_ask(sample_video):
    h = _auth_headers("ask@test.com")
    pid = client.post("/projects", json={"name": "Q"}, headers=h).json()["id"]
    with open(sample_video, "rb") as fh:
        video_id = client.post("/videos/upload", headers=h,
                               data={"project_id": pid},
                               files={"file": ("clip.mp4", fh, "video/mp4")}
                               ).json()["video_id"]

    # semantic search returns ranked results with timestamps
    s = client.post("/search", headers=h,
                    json={"video_id": video_id, "query": "movement in the area"})
    assert s.status_code == 200
    assert len(s.json()["results"]) >= 1

    # Ask Subli — grounded answer
    a = client.post("/chat/ask", headers=h,
                    json={"video_id": video_id, "question": "What happened?"})
    assert a.status_code == 200
    assert isinstance(a.json()["answer"], str) and a.json()["answer"]

    # unanswerable -> honest "couldn't determine"
    a2 = client.post("/chat/ask", headers=h,
                     json={"video_id": video_id,
                           "question": "What is the license plate number?"})
    assert a2.status_code == 200


def test_what_changed_and_story(sample_video):
    h = _auth_headers("story@test.com")
    pid = client.post("/projects", json={"name": "S"}, headers=h).json()["id"]
    with open(sample_video, "rb") as fh:
        video_id = client.post("/videos/upload", headers=h,
                               data={"project_id": pid},
                               files={"file": ("clip.mp4", fh, "video/mp4")}
                               ).json()["video_id"]

    story = client.post(f"/chat/find-story?video_id={video_id}", headers=h)
    assert story.status_code == 200
    assert "answer" in story.json()

    wc = client.post("/chat/what-changed", headers=h,
                     json={"video_id": video_id, "ts_a": 0.5, "ts_b": 3.5})
    assert wc.status_code == 200
    assert "changes" in wc.json()


def test_evidence_flow(sample_video):
    h = _auth_headers("ev@test.com")
    pid = client.post("/projects", json={"name": "E"}, headers=h).json()["id"]
    with open(sample_video, "rb") as fh:
        video_id = client.post("/videos/upload", headers=h,
                               data={"project_id": pid},
                               files={"file": ("clip.mp4", fh, "video/mp4")}
                               ).json()["video_id"]
    add = client.post("/evidence", headers=h, json={
        "project_id": pid, "video_id": video_id, "ts": 1.0,
        "description": "Person appears"})
    assert add.status_code == 200
    eid = add.json()["id"]
    lst = client.get(f"/evidence/{pid}", headers=h).json()["evidence"]
    assert any(e["id"] == eid for e in lst)
    assert client.delete(f"/evidence/{eid}", headers=h).status_code == 200


def test_dashboard_metrics():
    h = _auth_headers("dash@test.com")
    m = client.get("/dashboard/metrics", headers=h).json()
    assert set(m) == {"videos", "events", "people", "objects", "projects"}
