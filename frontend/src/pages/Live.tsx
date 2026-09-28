import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, StopCircle, Play, AlertTriangle, Plus, Trash2, Maximize2,
  Aperture, ScanEye, Eye, EyeOff, RotateCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
type CamState = "off" | "requesting" | "active" | "denied" | "error";

interface Det { type: string; confidence: number; bbox: number[]; } // px in frame
interface NDet { type: string; confidence: number; x: number; y: number; w: number; h: number; } // normalized 0..1
interface Track {
  id: number; label: string; type: string; conf: number;
  x: number; y: number; w: number; h: number; firstSeen: number; lastSeen: number;
}
type ZoneType = "restricted" | "entrance" | "parking" | "reception" | "loading";
interface Zone {
  id: string; name: string; type: ZoneType; enabled: boolean;
  x: number; y: number; w: number; h: number; // normalized
}
interface LiveEvent {
  id: string; ts: number; kind: "entered" | "left"; label: string;
  zone: string; conf: number; type: string;
}

const ZONE_META: Record<ZoneType, { label: string; color: string }> = {
  restricted: { label: "Restricted Area", color: "#DC2626" },
  entrance: { label: "Entrance", color: "#2563EB" },
  parking: { label: "Parking", color: "#16A34A" },
  reception: { label: "Reception", color: "#F59E0B" },
  loading: { label: "Loading Area", color: "#7C3AED" },
};
const OBJ_COLOR: Record<string, string> = {
  person: "#22c55e", car: "#3b82f6", truck: "#3b82f6", bus: "#3b82f6",
  motorcycle: "#a855f7", bicycle: "#a855f7", bag: "#f59e0b", phone: "#f59e0b",
  chair: "#6b7280", animal: "#f59e0b",
};
const VEHICLES = new Set(["car", "truck", "bus", "motorcycle", "bicycle"]);

function iou(a: { x: number; y: number; w: number; h: number }, b: NDet) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h, bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}
const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString();

export function Live() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const workRef = useRef<HTMLCanvasElement>(null);   // offscreen for inference/snapshot
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const inFlight = useRef(false);
  const tracksRef = useRef<Track[]>([]);
  const nextId = useRef(1);
  const zoneStateRef = useRef<Record<string, boolean>>({}); // `${trackId}:${zoneId}` -> inside
  const frameDims = useRef({ w: 512, h: 288 });
  const fpsRef = useRef<{ t: number; n: number }>({ t: performance.now(), n: 0 });

  const [camState, setCamState] = useState<CamState>("off");
  const [errorMsg, setErrorMsg] = useState("");
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
  const [detectionOn, setDetectionOn] = useState(true);
  const [trackingOn, setTrackingOn] = useState(true);
  const [conf, setConf] = useState(0.5);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [dets, setDets] = useState<NDet[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [alerts, setAlerts] = useState<LiveEvent[]>([]);
  const [stats, setStats] = useState({ fps: 0, inferenceMs: 0, res: "—" });
  const [alertRules, setAlertRules] = useState({ person: true, vehicle: true, object: false });

  // zone drawing
  const [drawing, setDrawing] = useState(false);
  const [newZone, setNewZone] = useState<{ name: string; type: ZoneType } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Zone | null>(null);

  // ----- camera lifecycle -------------------------------------------------
  const stopCamera = useCallback(() => {
    if (loopRef.current) { clearTimeout(loopRef.current); loopRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamState("off");
    setDets([]); setTracks([]); tracksRef.current = [];
    setStats({ fps: 0, inferenceMs: 0, res: "—" });
  }, []);

  const startCamera = useCallback(async () => {
    setErrorMsg("");
    setCamState("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support camera access.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamState("active");
    } catch (e: any) {
      const name = e?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCamState("denied");
        setErrorMsg("Camera permission is required to start live analysis.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCamState("error");
        setErrorMsg("No camera found on this device.");
      } else if (name === "NotReadableError") {
        setCamState("error");
        setErrorMsg("Camera is already in use by another application.");
      } else {
        setCamState("error");
        setErrorMsg(e?.message || "Could not start the camera.");
      }
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ----- inference loop (real backend YOLO) -------------------------------
  useEffect(() => {
    if (camState !== "active" || !detectionOn) return;
    let cancelled = false;

    const tick = async () => {
      const video = videoRef.current, work = workRef.current;
      if (!video || !work || cancelled) return;
      if (!inFlight.current && video.videoWidth) {
        inFlight.current = true;
        try {
          const scaleW = 512;
          const vw = video.videoWidth, vh = video.videoHeight;
          const sh = Math.round((scaleW * vh) / vw);
          work.width = scaleW; work.height = sh;
          frameDims.current = { w: scaleW, h: sh };
          const ctx = work.getContext("2d")!;
          ctx.drawImage(video, 0, 0, scaleW, sh);
          const blob: Blob | null = await new Promise((res) =>
            work.toBlob((b) => res(b), "image/jpeg", 0.6));
          if (blob) {
            const form = new FormData();
            form.append("file", blob, "frame.jpg");
            form.append("conf", String(conf));
            const { data } = await api.post("/live/detect", form, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            if (!cancelled) handleDetections(data);
          }
        } catch {
          /* transient frame error — keep looping */
        } finally {
          inFlight.current = false;
        }
      }
      if (!cancelled) loopRef.current = window.setTimeout(tick, 180); // ~5–6 fps
    };
    tick();
    return () => { cancelled = true; if (loopRef.current) clearTimeout(loopRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camState, detectionOn, conf, trackingOn, zones, alertRules]);

  // ----- detection handling: normalize, track, zone events ----------------
  function handleDetections(data: any) {
    setModelAvailable(data.available);
    setStats((s) => ({
      ...s,
      inferenceMs: data.inference_ms || 0,
      res: videoRef.current ? `${videoRef.current.videoWidth}×${videoRef.current.videoHeight}` : "—",
    }));
    // fps
    const f = fpsRef.current; f.n++;
    const now = performance.now();
    if (now - f.t >= 1000) { setStats((s) => ({ ...s, fps: f.n })); f.n = 0; f.t = now; }

    if (!data.available) { setDets([]); setTracks([]); return; }

    const W = data.width || frameDims.current.w, H = data.height || frameDims.current.h;
    const nd: NDet[] = (data.detections as Det[]).map((d) => ({
      type: d.type, confidence: d.confidence,
      x: d.bbox[0] / W, y: d.bbox[1] / H, w: d.bbox[2] / W, h: d.bbox[3] / H,
    }));
    setDets(nd);

    if (!trackingOn) { setTracks([]); tracksRef.current = []; return; }
    updateTracks(nd);
  }

  function updateTracks(nd: NDet[]) {
    const ts = Date.now();
    const prev = tracksRef.current;
    const used = new Set<number>();
    const updated: Track[] = [];

    for (const d of nd) {
      // match to an existing track of the same type by best IOU
      let best = -1, bestScore = 0.25;
      prev.forEach((t, i) => {
        if (used.has(i) || t.type !== d.type) return;
        const s = iou(t, d);
        if (s > bestScore) { bestScore = s; best = i; }
      });
      if (best >= 0) {
        used.add(best);
        const t = prev[best];
        updated.push({ ...t, x: d.x, y: d.y, w: d.w, h: d.h, conf: d.confidence, lastSeen: ts });
      } else {
        const id = nextId.current++;
        const label = d.type === "person" ? `Person #${id}` : d.type;
        updated.push({ id, label, type: d.type, conf: d.confidence,
          x: d.x, y: d.y, w: d.w, h: d.h, firstSeen: ts, lastSeen: ts });
      }
    }
    // keep recently-seen tracks that weren't matched (grace period), then drop stale
    prev.forEach((t, i) => {
      if (!used.has(i) && ts - t.lastSeen < 1200) updated.push(t);
    });
    tracksRef.current = updated;
    setTracks(updated);
    checkZones(updated, ts);
  }

  function checkZones(curr: Track[], ts: number) {
    const enabled = zones.filter((z) => z.enabled);
    if (!enabled.length) return;
    const seen = new Set<string>();
    const newEvents: LiveEvent[] = [];

    for (const t of curr) {
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      const ruleOK = t.type === "person" ? alertRules.person
        : VEHICLES.has(t.type) ? alertRules.vehicle : alertRules.object;
      for (const z of enabled) {
        const key = `${t.id}:${z.id}`;
        seen.add(key);
        const inside = cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
        const was = zoneStateRef.current[key] || false;
        if (inside && !was && ruleOK) {
          newEvents.push({ id: crypto.randomUUID(), ts, kind: "entered",
            label: t.label, zone: z.name, conf: t.conf, type: t.type });
        } else if (!inside && was && ruleOK) {
          newEvents.push({ id: crypto.randomUUID(), ts, kind: "left",
            label: t.label, zone: z.name, conf: t.conf, type: t.type });
        }
        zoneStateRef.current[key] = inside;
      }
    }
    // cleanup state for tracks no longer present
    Object.keys(zoneStateRef.current).forEach((k) => { if (!seen.has(k)) delete zoneStateRef.current[k]; });

    if (newEvents.length) {
      setEvents((e) => [...newEvents.reverse(), ...e].slice(0, 60));
      const entries = newEvents.filter((e) => e.kind === "entered");
      if (entries.length) {
        setAlerts((a) => [...entries, ...a].slice(0, 30));
        entries.forEach((ev) =>
          api.post("/live/alerts/log", { zone_name: ev.zone, object_type: ev.type,
            ts: ev.ts / 1000 }).catch(() => {}));
      }
    }
  }

  // ----- zones ------------------------------------------------------------
  function relPoint(e: React.MouseEvent) {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  function onDown(e: React.MouseEvent) {
    if (!drawing || !newZone) return;
    dragStart.current = relPoint(e);
  }
  function onMove(e: React.MouseEvent) {
    if (!drawing || !dragStart.current || !newZone) return;
    const p = relPoint(e), s = dragStart.current;
    setDraft({
      id: "draft", name: newZone.name, type: newZone.type, enabled: true,
      x: Math.min(s.x, p.x), y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y),
    });
  }
  function onUp() { dragStart.current = null; }
  function saveZone() {
    if (draft && draft.w > 0.02 && draft.h > 0.02) {
      setZones((z) => [...z, { ...draft, id: crypto.randomUUID() }]);
    }
    setDrawing(false); setNewZone(null); setDraft(null);
  }
  function startAddZone() {
    const name = prompt("Zone name (e.g. Restricted Area):", "Restricted Area");
    if (!name) return;
    setNewZone({ name, type: "restricted" });
    setDrawing(true);
  }

  // ----- snapshot ---------------------------------------------------------
  async function snapshot(saveEvidence: boolean) {
    const video = videoRef.current; if (!video) return;
    const c = document.createElement("canvas");
    c.width = video.videoWidth; c.height = video.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    // draw current boxes
    tracksRef.current.forEach((t) => {
      ctx.strokeStyle = OBJ_COLOR[t.type] || "#e5e7eb"; ctx.lineWidth = 3;
      ctx.strokeRect(t.x * c.width, t.y * c.height, t.w * c.width, t.h * c.height);
      ctx.fillStyle = OBJ_COLOR[t.type] || "#e5e7eb";
      ctx.font = "16px monospace";
      ctx.fillText(`${t.label} ${Math.round(t.conf * 100)}%`, t.x * c.width, t.y * c.height - 6);
    });
    const url = c.toDataURL("image/jpeg", 0.85);
    if (!saveEvidence) {
      const a = document.createElement("a");
      a.href = url; a.download = `subli-live-${Date.now()}.jpg`; a.click();
      return;
    }
    try {
      // ensure a "Subli Live" project exists, then save an evidence row
      const projs = (await api.get("/projects")).data.projects as any[];
      let live = projs.find((p) => p.name === "Subli Live");
      if (!live) live = (await api.post("/projects", { name: "Subli Live",
        description: "Snapshots and events from live camera analysis." })).data;
      await api.post("/evidence", { project_id: live.id,
        description: `Live snapshot — ${tracksRef.current.length} objects, `
          + `${tracksRef.current.filter((t) => t.type === "person").length} people`,
        confidence: tracksRef.current[0]?.conf });
      alert("Saved to Evidence (project: Subli Live).");
    } catch {
      alert("Could not save evidence.");
    }
  }

  function toggleFullscreen() {
    const el = wrapRef.current; if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  // ----- derived stats ----------------------------------------------------
  const people = tracks.filter((t) => t.type === "person");
  const vehicles = dets.filter((d) => VEHICLES.has(d.type)).length;
  const activeZones = zones.filter((z) => z.enabled).length;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              Subli Live
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                camState === "active" ? "bg-danger/10 text-danger" : "bg-line text-muted")}>
                <span className={cn("h-1.5 w-1.5 rounded-full",
                  camState === "active" ? "animate-pulse bg-danger" : "bg-muted")} />
                {camState === "active" ? "LIVE" : "OFFLINE"}
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted">Real-time video intelligence — YOLO inference on every frame.</p>
          </div>
          <div className="flex gap-2">
            {camState === "active" ? (
              <Button variant="danger" onClick={stopCamera}><StopCircle className="h-4 w-4" /> Stop</Button>
            ) : (
              <Button onClick={startCamera} disabled={camState === "requesting"}>
                <Play className="h-4 w-4" /> {camState === "requesting" ? "Requesting…" : "Start Camera"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* ---- main: camera + overlay ---- */}
          <div className="space-y-3">
            <div ref={wrapRef}
              className="relative mx-auto flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-ink">
              <video ref={videoRef} muted playsInline
                className={cn("h-full w-full object-contain", camState !== "active" && "hidden")} />
              <canvas ref={workRef} className="hidden" />

              {/* overlay: detections + zones */}
              {camState === "active" && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 1000 562" preserveAspectRatio="none">
                  {/* zones */}
                  {zones.filter((z) => z.enabled).map((z) => (
                    <g key={z.id}>
                      <rect x={z.x * 1000} y={z.y * 562} width={z.w * 1000} height={z.h * 562}
                        fill={ZONE_META[z.type].color} fillOpacity={0.12}
                        stroke={ZONE_META[z.type].color} strokeWidth={2} strokeDasharray="6 4" />
                      <text x={z.x * 1000 + 6} y={z.y * 562 + 18} fontSize={16}
                        fill={ZONE_META[z.type].color} fontWeight="600">{z.name}</text>
                    </g>
                  ))}
                  {/* draft zone */}
                  {draft && (
                    <rect x={draft.x * 1000} y={draft.y * 562} width={draft.w * 1000} height={draft.h * 562}
                      fill="#000" fillOpacity={0.1} stroke="#111" strokeWidth={2} strokeDasharray="4 4" />
                  )}
                  {/* detections / tracks */}
                  {(trackingOn ? tracks : dets.map((d, i) => ({ ...d, id: i, label: d.type, conf: d.confidence }))).map((t: any) => {
                    const c = OBJ_COLOR[t.type] || "#e5e7eb";
                    return (
                      <g key={t.id}>
                        <rect x={t.x * 1000} y={t.y * 562} width={t.w * 1000} height={t.h * 562}
                          fill="none" stroke={c} strokeWidth={2.5} />
                        <rect x={t.x * 1000} y={t.y * 562 - 20} width={Math.max(t.w * 1000, 120)} height={20} fill={c} />
                        <text x={t.x * 1000 + 5} y={t.y * 562 - 6} fontSize={14} fill="#fff" fontFamily="monospace">
                          {t.label} {Math.round(t.conf * 100)}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* zone drawing capture layer */}
              {drawing && (
                <div className="absolute inset-0 cursor-crosshair"
                  onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} />
              )}

              {/* placeholder / states */}
              {camState !== "active" && (
                <div className="flex flex-col items-center gap-3 text-center text-white/70">
                  {camState === "requesting" ? (
                    <><RotateCw className="h-8 w-8 animate-spin" /><p>Requesting camera permission…</p></>
                  ) : camState === "denied" ? (
                    <><EyeOff className="h-8 w-8" /><p className="max-w-xs text-sm">{errorMsg}</p>
                      <Button variant="outline" size="sm" onClick={startCamera}><RotateCw className="h-4 w-4" /> Retry</Button></>
                  ) : camState === "error" ? (
                    <><AlertTriangle className="h-8 w-8" /><p className="max-w-xs text-sm">{errorMsg}</p>
                      <Button variant="outline" size="sm" onClick={startCamera}><RotateCw className="h-4 w-4" /> Retry</Button></>
                  ) : (
                    <><Camera className="h-10 w-10" /><p className="text-sm">Camera is off</p>
                      <Button size="sm" onClick={startCamera}><Play className="h-4 w-4" /> Start Camera</Button></>
                  )}
                </div>
              )}

              {/* drawing banner */}
              {drawing && (
                <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs shadow-pop">
                  Drawing “{newZone?.name}” — drag on the video
                  <Button size="sm" variant="ghost" onClick={() => { setDrawing(false); setNewZone(null); setDraft(null); }}>Cancel</Button>
                  <Button size="sm" onClick={saveZone} disabled={!draft}>Save</Button>
                </div>
              )}
            </div>

            {/* camera status bar */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {camState === "active" && (
                <>
                  <Badge variant="danger">● LIVE</Badge>
                  <Badge variant="outline">{stats.fps} FPS</Badge>
                  <Badge variant="outline">{stats.inferenceMs} ms inference</Badge>
                  <Badge variant="outline">{stats.res}</Badge>
                  <Badge variant="outline">
                    Model: {modelAvailable === false ? "unavailable" : "YOLOv8"}
                  </Badge>
                </>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDetectionOn((v) => !v)} disabled={camState !== "active"}>
                  {detectionOn ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} Detection
                </Button>
                <Button variant="outline" size="sm" onClick={() => setTrackingOn((v) => !v)} disabled={camState !== "active"}>
                  <ScanEye className="h-4 w-4" /> Tracking
                </Button>
                <select value={conf} onChange={(e) => setConf(Number(e.target.value))}
                  className="rounded-md border border-line bg-surface px-2 text-xs" disabled={camState !== "active"}>
                  {[0.5, 0.6, 0.7, 0.8].map((c) => <option key={c} value={c}>{Math.round(c * 100)}% conf</option>)}
                </select>
                <Button variant="outline" size="sm" onClick={() => snapshot(false)} disabled={camState !== "active"}>
                  <Aperture className="h-4 w-4" /> Snapshot
                </Button>
                <Button variant="outline" size="sm" onClick={toggleFullscreen} disabled={camState !== "active"}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {modelAvailable === false && (
              <div className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-warn">
                Vision model unavailable on the server — no detections are being produced.
                Install the ML stack (ultralytics) to enable live inference.
              </div>
            )}

            <p className="text-xs text-muted">
              Privacy: frames are analyzed by your own backend model; no facial recognition or
              identity inference is performed — only anonymous tracking IDs.
            </p>

            {/* zone management */}
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Zone Management</h3>
                <Button size="sm" onClick={startAddZone} disabled={camState !== "active"}>
                  <Plus className="h-4 w-4" /> Add Zone
                </Button>
              </div>
              {zones.length === 0 ? (
                <p className="text-xs text-muted">No zones yet. Start the camera and add a zone to detect entries.</p>
              ) : (
                <div className="space-y-2">
                  {zones.map((z) => (
                    <div key={z.id} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                      <span className="h-3 w-3 rounded-full" style={{ background: ZONE_META[z.type].color }} />
                      <input value={z.name}
                        onChange={(e) => setZones((zs) => zs.map((x) => x.id === z.id ? { ...x, name: e.target.value } : x))}
                        className="flex-1 bg-transparent text-sm outline-none" />
                      <select value={z.type}
                        onChange={(e) => setZones((zs) => zs.map((x) => x.id === z.id ? { ...x, type: e.target.value as ZoneType } : x))}
                        className="rounded border border-line bg-surface px-1.5 py-1 text-xs">
                        {Object.entries(ZONE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <Button variant="ghost" size="icon" onClick={() => setZones((zs) => zs.map((x) => x.id === z.id ? { ...x, enabled: !x.enabled } : x))}>
                        {z.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setZones((zs) => zs.filter((x) => x.id !== z.id))}>
                        <Trash2 className="h-4 w-4 text-muted" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---- right sidebar ---- */}
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold">Live Insights</h3>
              <div className="grid grid-cols-2 gap-2">
                {[["People", people.length], ["Vehicles", vehicles],
                  ["Objects", dets.length], ["Alerts", alerts.length],
                  ["Active Zones", activeZones], ["FPS", stats.fps]].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-bg p-3">
                    <p className="text-xs text-muted">{l}</p>
                    <p className="text-xl font-bold tabular-nums">{v as number}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* people / tracks */}
            {people.length > 0 && (
              <div className="rounded-xl border border-line bg-surface p-4">
                <h3 className="mb-2 text-sm font-semibold">Active tracks</h3>
                <div className="space-y-1.5">
                  {people.slice(0, 8).map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted">{Math.round((Date.now() - t.firstSeen) / 1000)}s</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* alerts */}
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="h-4 w-4" /> Alerts</h3>
                {alerts.length > 0 && <button className="text-xs text-muted hover:underline" onClick={() => setAlerts([])}>Clear all</button>}
              </div>
              <div className="mb-3 space-y-1">
                {(["person", "vehicle", "object"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs capitalize text-muted">
                    <input type="checkbox" checked={(alertRules as any)[k]}
                      onChange={(e) => setAlertRules((r) => ({ ...r, [k]: e.target.checked }))} />
                    {k} enters zone
                  </label>
                ))}
              </div>
              {alerts.length === 0 ? (
                <p className="text-xs text-muted">No alerts.</p>
              ) : (
                <ul className="space-y-1.5">
                  {alerts.slice(0, 8).map((a) => (
                    <li key={a.id} className="animate-fade-in rounded-lg border border-danger/30 bg-danger/5 p-2 text-xs">
                      <p className="font-medium text-danger">⚠ {a.label} entered {a.zone}</p>
                      <p className="text-muted">{fmtClock(a.ts)} · {Math.round(a.conf * 100)}%</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* live events */}
            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold">Live Events</h3>
              {events.length === 0 ? (
                <p className="text-xs text-muted">Zone entry/exit events will appear here.</p>
              ) : (
                <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                  {events.slice(0, 30).map((e) => (
                    <li key={e.id} className="text-xs">
                      <span className="font-mono text-muted">{fmtClock(e.ts)}</span>
                      <p><span className="font-medium">{e.label}</span>{" "}
                        {e.kind === "entered" ? "→ entered" : "← left"} {e.zone}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button variant="outline" className="w-full" onClick={() => snapshot(true)} disabled={camState !== "active"}>
              <Aperture className="h-4 w-4" /> Snapshot → Save as Evidence
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
