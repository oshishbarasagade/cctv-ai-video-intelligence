import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Video, Wifi, WifiOff, Play, StopCircle, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

interface Camera { id: string; name: string; location?: string; status: string; }

const OBJ_COLOR: Record<string, string> = {
  person: "#22c55e", car: "#3b82f6", truck: "#3b82f6", bus: "#3b82f6",
  motorcycle: "#a855f7", bicycle: "#a855f7", bag: "#f59e0b", phone: "#f59e0b",
};
const VEHICLES = new Set(["car", "truck", "bus", "motorcycle", "bicycle"]);

interface NDet { type: string; confidence: number; x: number; y: number; w: number; h: number; }

export function CommandCenter() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  const cameras = useQuery({
    queryKey: ["cameras"],
    queryFn: async () => (await api.get<{ cameras: Camera[] }>("/live/cameras")).data.cameras,
  });
  const addCamera = useMutation({
    mutationFn: async () => api.post("/live/cameras", { name, location, status: "offline" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cameras"] }); setOpen(false); setName(""); setLocation(""); },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <PageHeader
          title="Command Center"
          subtitle="Connect a camera to run live AI detection on its feed."
          action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add camera</Button>}
        />

        {cameras.data && cameras.data.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cameras.data.map((c) => <CameraTile key={c.id} cam={c} />)}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState icon={<Video className="h-8 w-8" />} title="No cameras yet"
              hint="Add a camera, then press Connect to run real-time detection from your webcam."
              action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add your first camera</Button>} />
          </div>
        )}

        <p className="mt-4 text-xs text-muted">
          Live detection runs on your own backend YOLO model. Webcam frames are
          analyzed in real time; IP/RTSP ingestion (FFmpeg) is a server-side add-on.
        </p>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add camera">
        <div className="space-y-3">
          <Input placeholder="Camera name (e.g. CAM 01)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input placeholder="Location (e.g. Entrance)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Button className="w-full" disabled={!name.trim() || addCamera.isPending} onClick={() => addCamera.mutate()}>
            {addCamera.isPending ? "Adding…" : "Add camera"}
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}

function CameraTile({ cam }: { cam: Camera }) {
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const workRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const inFlight = useRef(false);
  const fps = useRef({ t: performance.now(), n: 0 });

  const [live, setLive] = useState(false);
  const [dets, setDets] = useState<NDet[]>([]);
  const [stats, setStats] = useState({ objects: 0, people: 0, vehicles: 0, fps: 0, ms: 0 });
  const [error, setError] = useState("");

  function stop() {
    if (loopRef.current) { clearTimeout(loopRef.current); loopRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false); setDets([]); setStats({ objects: 0, people: 0, vehicles: 0, fps: 0, ms: 0 });
  }
  useEffect(() => () => stop(), []);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setLive(true);
      loop();
    } catch (e: any) {
      setError(e?.name === "NotAllowedError" ? "Camera permission denied."
        : e?.name === "NotReadableError" ? "Camera is busy (used by another tile/app)." : "Could not start camera.");
      setLive(false);
    }
  }

  async function loop() {
    const v = videoRef.current, w = workRef.current;
    if (!v || !w) return;
    if (!inFlight.current && v.videoWidth) {
      inFlight.current = true;
      try {
        const W = 480, H = Math.round((W * v.videoHeight) / v.videoWidth);
        w.width = W; w.height = H;
        w.getContext("2d")!.drawImage(v, 0, 0, W, H);
        const blob: Blob | null = await new Promise((r) => w.toBlob((b) => r(b), "image/jpeg", 0.6));
        if (blob) {
          const form = new FormData();
          form.append("file", blob, "f.jpg"); form.append("conf", "0.5");
          const { data } = await api.post("/live/detect", form, { headers: { "Content-Type": "multipart/form-data" } });
          if (data.available) {
            const nd: NDet[] = data.detections.map((d: any) => ({
              type: d.type, confidence: d.confidence,
              x: d.bbox[0] / data.width, y: d.bbox[1] / data.height,
              w: d.bbox[2] / data.width, h: d.bbox[3] / data.height,
            }));
            setDets(nd);
            const people = nd.filter((d) => d.type === "person").length;
            const vehicles = nd.filter((d) => VEHICLES.has(d.type)).length;
            fps.current.n++; const now = performance.now();
            let f = stats.fps;
            if (now - fps.current.t >= 1000) { f = fps.current.n; fps.current.n = 0; fps.current.t = now; }
            setStats({ objects: nd.length, people, vehicles, fps: f, ms: data.inference_ms });
          }
        }
      } catch { /* keep looping */ } finally { inFlight.current = false; }
    }
    loopRef.current = window.setTimeout(loop, 200);
  }

  const del = useMutation({
    mutationFn: async () => api.delete(`/live/cameras/${cam.id}`).catch(() => {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cameras"] }),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="relative flex aspect-video items-center justify-center bg-ink">
        <video ref={videoRef} muted playsInline className={cn("h-full w-full object-cover", !live && "hidden")} />
        <canvas ref={workRef} className="hidden" />
        {live && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {dets.map((d, i) => {
              const c = OBJ_COLOR[d.type] || "#e5e7eb";
              return (
                <g key={i}>
                  <rect x={d.x * 1000} y={d.y * 1000} width={d.w * 1000} height={d.h * 1000} fill="none" stroke={c} strokeWidth={4} />
                  <text x={d.x * 1000 + 4} y={d.y * 1000 - 6} fontSize={28} fill={c} fontFamily="monospace">{d.type}</text>
                </g>
              );
            })}
          </svg>
        )}
        <div className="absolute left-2 top-2">
          <Badge variant={live ? "danger" : "outline"}>
            {live ? <><span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> LIVE</> : "OFFLINE"}
          </Badge>
        </div>
        {live && (
          <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
            {stats.fps} FPS · {stats.ms}ms
          </div>
        )}
        {!live && <Video className="h-8 w-8 text-white/30" />}
        {live && (
          <div className="absolute bottom-2 left-2 flex gap-1.5">
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{stats.people} people</span>
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{stats.vehicles} vehicles</span>
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{stats.objects} objects</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{cam.name}</p>
          <p className="truncate text-xs text-muted">{cam.location || "—"}</p>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <div className="flex items-center gap-1">
          {live ? (
            <Button size="sm" variant="danger" onClick={stop}><StopCircle className="h-4 w-4" /> Stop</Button>
          ) : (
            <Button size="sm" onClick={start}><Play className="h-4 w-4" /> Connect</Button>
          )}
          {!live && (
            <Button size="icon" variant="ghost" onClick={() => del.mutate()} title="Delete camera">
              <Trash2 className="h-4 w-4 text-muted" />
            </Button>
          )}
          {live ? <Wifi className="h-4 w-4 text-ok" /> : <WifiOff className="h-4 w-4 text-muted" />}
        </div>
      </div>
    </div>
  );
}
