import { useEffect, useRef, useState } from "react";
import { Camera, Square, AlertTriangle, Play, StopCircle } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
} // normalized 0..1

interface Alert {
  ts: number;
  text: string;
}

export function Live() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevRef = useRef<ImageData | null>(null);
  const rafRef = useRef<number>(0);
  const lastAlertRef = useRef<number>(0);

  const [streaming, setStreaming] = useState(false);
  const [fps, setFps] = useState(0);
  const [objectCount, setObjectCount] = useState(0);
  const [zone, setZone] = useState<Zone | null>({ x: 0.55, y: 0.15, w: 0.35, h: 0.6 });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [drawing, setDrawing] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
        loop();
      }
    } catch {
      alert("Camera permission denied or unavailable.");
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    const v = videoRef.current;
    if (v?.srcObject) (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    setStreaming(false);
    setFps(0);
    setObjectCount(0);
    prevRef.current = null;
  }

  useEffect(() => () => stop(), []);

  let frames = 0;
  let lastFpsT = performance.now();

  function loop() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const W = 160,
      H = 120;
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, W, H);
    const cur = ctx.getImageData(0, 0, W, H);

    // frame differencing -> changed-pixel bounding box (lightweight detection)
    let minX = W, minY = H, maxX = 0, maxY = 0, changed = 0;
    const prev = prevRef.current;
    if (prev) {
      for (let i = 0; i < cur.data.length; i += 4) {
        const d =
          Math.abs(cur.data[i] - prev.data[i]) +
          Math.abs(cur.data[i + 1] - prev.data[i + 1]) +
          Math.abs(cur.data[i + 2] - prev.data[i + 2]);
        if (d > 60) {
          const px = (i / 4) % W;
          const py = Math.floor(i / 4 / W);
          changed++;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }
    prevRef.current = cur;

    const motion = changed / (W * H);
    setObjectCount(motion > 0.01 ? 1 + Math.floor(motion * 10) : 0);

    // zone intrusion check
    if (motion > 0.02 && zone) {
      const cx = (minX + maxX) / 2 / W;
      const cy = (minY + maxY) / 2 / H;
      const inside =
        cx >= zone.x && cx <= zone.x + zone.w && cy >= zone.y && cy <= zone.y + zone.h;
      const now = performance.now();
      if (inside && now - lastAlertRef.current > 2500) {
        lastAlertRef.current = now;
        fireAlert();
      }
    }

    frames++;
    const t = performance.now();
    if (t - lastFpsT > 1000) {
      setFps(frames);
      frames = 0;
      lastFpsT = t;
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  function fireAlert() {
    const a = { ts: Date.now() / 1000, text: "Motion detected in Restricted Zone" };
    setAlerts((prev) => [a, ...prev].slice(0, 20));
    api
      .post("/live/alerts/log", {
        zone_name: "Restricted Zone",
        object_type: "motion",
        ts: a.ts,
      })
      .catch(() => {});
  }

  // draw zone by dragging on the overlay
  function onDown(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect();
    dragStart.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    setDrawing(true);
  }
  function onMove(e: React.MouseEvent) {
    if (!drawing || !dragStart.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x2 = (e.clientX - r.left) / r.width;
    const y2 = (e.clientY - r.top) / r.height;
    const s = dragStart.current;
    setZone({
      x: Math.min(s.x, x2),
      y: Math.min(s.y, y2),
      w: Math.abs(x2 - s.x),
      h: Math.abs(y2 - s.y),
    });
  }
  function onUp() {
    setDrawing(false);
    dragStart.current = null;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <PageHeader
          title="Subli Live"
          subtitle="Real-time webcam intelligence with zone alerts. Detection runs in your browser — no video leaves your device."
          action={
            streaming ? (
              <Button variant="danger" onClick={stop}>
                <StopCircle className="h-4 w-4" /> Stop
              </Button>
            ) : (
              <Button onClick={start}>
                <Play className="h-4 w-4" /> Start camera
              </Button>
            )
          }
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="relative overflow-hidden rounded-xl border border-line bg-ink">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
            {/* zone overlay */}
            <div
              className="absolute inset-0 cursor-crosshair"
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
            >
              {zone && (
                <div
                  className="absolute border-2 border-danger bg-danger/10"
                  style={{
                    left: `${zone.x * 100}%`,
                    top: `${zone.y * 100}%`,
                    width: `${zone.w * 100}%`,
                    height: `${zone.h * 100}%`,
                  }}
                >
                  <span className="absolute -top-6 left-0 rounded bg-danger px-1.5 py-0.5 text-xs text-white">
                    Restricted Zone
                  </span>
                </div>
              )}
            </div>
            {streaming && (
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <Badge variant="danger">
                  <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
                  LIVE
                </Badge>
                <Badge variant="outline">{fps} FPS</Badge>
              </div>
            )}
            {!streaming && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
                <Camera className="h-10 w-10" />
                <p className="mt-2 text-sm">Camera off</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Detected motion</span>
                <Badge>{objectCount}</Badge>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <Square className="h-3.5 w-3.5" /> Drag on the video to redraw the zone.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" /> Alerts
              </h3>
              {alerts.length === 0 ? (
                <p className="text-xs text-muted">No alerts yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {alerts.map((a, i) => (
                    <li
                      key={i}
                      className={cn(
                        "rounded-lg border border-danger/30 bg-danger/5 p-2 text-xs",
                        i === 0 && "animate-fade-in"
                      )}
                    >
                      <span className="font-mono text-danger">
                        {new Date(a.ts * 1000).toLocaleTimeString()}
                      </span>
                      <p className="mt-0.5">{a.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {!streaming && (
          <div className="mt-6">
            <EmptyState
              icon={<Camera className="h-8 w-8" />}
              title="Camera is off"
              hint="Start the camera to detect motion and trigger zone alerts in real time."
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
