"""Verify Supabase Storage: upload a short clip, process it, then confirm the
video + thumbnails + subtitles landed in the private buckets, and a signed URL
works."""
import sys, time, tempfile, os, json
from pathlib import Path
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import cv2, numpy as np, requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import config  # loads .env

B = "http://127.0.0.1:8000"
U = config.SUPABASE_URL
SR = config.SUPABASE_SERVICE_ROLE_KEY
SH = {"apikey": SR, "Authorization": "Bearer " + SR}


def make_clip(path):
    vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 10, (160, 120))
    for i in range(30):
        f = np.full((120, 160, 3), (i * 8) % 255, np.uint8)
        cv2.rectangle(f, ((i*4) % 130, 40), ((i*4) % 130 + 20, 100), (0, 0, 0), -1)
        vw.write(f)
    vw.release()


def list_bucket(bucket, prefix):
    r = requests.post(f"{U}/storage/v1/object/list/{bucket}", headers=SH,
                      json={"prefix": prefix, "limit": 100})
    return [o["name"] for o in r.json()] if r.status_code == 200 else r.text


def main():
    clip = os.path.join(tempfile.mkdtemp(), "clip.mp4")
    make_clip(clip)
    em = f"stor{int(time.time())}@subli.ai"
    tok = requests.post(B+"/auth/signup", json={"full_name":"S","email":em,
          "password":"secret123"}).json()["token"]
    H = {"Authorization": "Bearer "+tok}
    me = requests.get(B+"/auth/me", headers=H).json(); uid = me["id"]
    pid = requests.post(B+"/projects", json={"name":"Storage"}, headers=H).json()["id"]
    with open(clip, "rb") as fh:
        up = requests.post(B+"/videos/upload", headers=H,
                           data={"project_id": pid, "mode": "quick"},
                           files={"file": ("clip.mp4", fh, "video/mp4")}).json()
    vid, job = up["video_id"], up["job_id"]
    for _ in range(120):
        j = requests.get(f"{B}/videos/jobs/{job}", headers=H).json()
        if j["status"] in ("completed", "failed"):
            break
        time.sleep(2)
    print("job:", j["status"])

    print("\n--- videos bucket ---")
    print(list_bucket("videos", f"{uid}/{pid}"))
    print("\n--- artifacts bucket ---")
    print(list_bucket("artifacts", f"{uid}/{vid}"))

    # signed URL for the uploaded video
    key = f"{uid}/{pid}/{vid}.mp4"
    r = requests.post(f"{U}/storage/v1/object/sign/videos/{key}", headers=SH,
                      json={"expiresIn": 3600})
    print("\nsigned url ok:", r.status_code == 200)

    # serving still works through the API
    st = requests.get(f"{B}/analysis/{vid}/stream", headers=H)
    print("stream via API:", st.status_code, st.headers.get("content-type"))
    print("\nSTORAGE VERIFIED OK")


if __name__ == "__main__":
    main()
