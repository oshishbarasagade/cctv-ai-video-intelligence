"""End-to-end REAL test: upload a real video to the running backend (Supabase
mode) and confirm real analysis rows land in Postgres."""
import sys, time, json, urllib.request
from pathlib import Path
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import config  # loads .env

B = "http://127.0.0.1:8000"
SR = config.SUPABASE_SERVICE_ROLE_KEY
REST = f"{config.SUPABASE_URL}/rest/v1"
SH = {"apikey": SR, "Authorization": "Bearer " + SR}

sample = Path("data/sample_real.mp4")

def rest_count(table, video_id):
    r = requests.get(f"{REST}/{table}?video_id=eq.{video_id}&select=id",
                     headers={**SH, "Prefer": "count=exact", "Range": "0-0"})
    return r.headers.get("content-range", "?").split("/")[-1]

def main():
    em = f"e2e{int(time.time())}@subli.ai"
    tok = requests.post(B+"/auth/signup", json={"full_name":"E2E","email":em,
          "password":"secret123"}).json()["token"]
    H = {"Authorization": "Bearer "+tok}
    pid = requests.post(B+"/projects", json={"name":"E2E Real"}, headers=H).json()["id"]
    print("project:", pid[:8])

    with open(sample, "rb") as fh:
        up = requests.post(B+"/videos/upload", headers=H,
                           data={"project_id": pid, "mode": "quick"},
                           files={"file": ("sample_real.mp4", fh, "video/mp4")}).json()
    vid, job = up["video_id"], up["job_id"]
    print("video:", vid[:8], "| job:", job[:8])

    last = None
    for _ in range(600):
        j = requests.get(f"{B}/videos/jobs/{job}", headers=H).json()
        s = f"{j['status']}:{j.get('stage')}:{j.get('progress')}%"
        if s != last:
            print("  ", s); last = s
        if j["status"] in ("completed", "failed"):
            break
        time.sleep(2)

    print("FINAL job:", j["status"], j.get("error_message") or "")
    print("\n--- REAL ROWS IN POSTGRES (video", vid[:8], ") ---")
    for t in ["frames","objects","subjects","captions","events","embeddings","environment_states"]:
        print(f"  {t:20}", rest_count(t, vid))

    ov = requests.get(f"{B}/analysis/{vid}/overview", headers=H).json()
    print("\noverview counts:", json.dumps(ov["counts"]))
    obj = requests.get(f"{B}/analysis/{vid}/objects", headers=H).json()
    print("object types:", json.dumps(obj["counts"]))
    caps = requests.get(f"{B}/analysis/{vid}/captions", headers=H).json()["captions"]
    if caps:
        print("sample caption:", caps[len(caps)//2]["text"], "| model:", caps[0]["model"])

if __name__ == "__main__":
    main()
