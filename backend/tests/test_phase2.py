"""Tests for the later phases: demo seed, reports, live (zones/alerts/cameras),
analytics."""
import os
import tempfile

os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["FORCE_FALLBACK"] = "1"
os.environ.setdefault("SUBLI_DB", os.path.join(tempfile.mkdtemp(), "test2.db"))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _auth(email):
    client.post("/auth/signup", json={
        "full_name": "P2", "email": email, "password": "secret123"})
    tok = client.post("/auth/login", json={"email": email, "password": "secret123"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_demo_seed_and_report():
    h = _auth("demo2@test.com")
    seed = client.post("/demo/seed", headers=h)
    assert seed.status_code == 200, seed.text
    video_id = seed.json()["video_id"]

    # demo produced real analysis
    ov = client.get(f"/analysis/{video_id}/overview", headers=h).json()
    assert ov["counts"]["events"] >= 1
    assert ov["counts"]["objects"] >= 1

    # report generates and downloads
    gen = client.post(f"/reports/{video_id}/generate", headers=h)
    assert gen.status_code == 200, gen.text
    dl = client.get(gen.json()["download_url"], headers=h)
    assert dl.status_code == 200
    assert len(dl.content) > 100


def test_zones_and_alerts():
    h = _auth("live2@test.com")
    z = client.post("/live/zones", headers=h,
                    json={"name": "Restricted Zone", "polygon": [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]]})
    assert z.status_code == 200
    zid = z.json()["id"]
    assert any(x["id"] == zid for x in client.get("/live/zones", headers=h).json()["zones"])

    fired = client.post("/live/alerts/log", headers=h,
                        json={"zone_id": zid, "zone_name": "Restricted Zone",
                              "object_type": "person", "ts": 3.2})
    assert fired.status_code == 200
    assert len(client.get("/live/alerts", headers=h).json()["alerts"]) >= 1

    assert client.delete(f"/live/zones/{zid}", headers=h).status_code == 200


def test_cameras_and_analytics():
    h = _auth("cam2@test.com")
    client.post("/demo/seed", headers=h)
    cam = client.post("/live/cameras", headers=h,
                      json={"name": "CAM 01", "location": "Entrance", "status": "live"})
    assert cam.status_code == 200
    assert len(client.get("/live/cameras", headers=h).json()["cameras"]) >= 1

    a = client.get("/dashboard/analytics", headers=h).json()
    assert "event_distribution" in a and "object_distribution" in a
    assert len(a["activity"]) == 12
    assert sum(x["value"] for x in a["event_distribution"]) >= 1
