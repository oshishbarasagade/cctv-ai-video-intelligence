import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Play, Pause, Zap, Box, Users, Type, ScanEye, Search,
  Flag, MessageSquare, Sparkles, Download, GitCompareArrows, FileText,
  Share2, Gauge, X, Clock3,
} from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Spinner, EmptyState } from "@/components/ui/misc";
import { cn, formatTime } from "@/lib/utils";
import type {
  Caption, DetectedObject, Event, OcrResult,
  SearchResult, Subject, Video,
} from "@/types";

type Tab = "highlights" | "events" | "objects" | "people" | "ocr" | "memory" | "dwell" | "search";

export function Analysis() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string>();
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>("highlights");
  const [showBoxes, setShowBoxes] = useState(true);
  const [showPaths, setShowPaths] = useState(false);
  const [showHeat, setShowHeat] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showInvestigate, setShowInvestigate] = useState(false);

  // --- data ---
  const overview = useQuery({ queryKey: ["ov", videoId], queryFn: async () => (await api.get(`/analysis/${videoId}/overview`)).data });
  const events = useQuery({ queryKey: ["ev", videoId], queryFn: async () => (await api.get<{ events: Event[] }>(`/analysis/${videoId}/events`)).data.events });
  const objects = useQuery({ queryKey: ["ob", videoId], queryFn: async () => (await api.get<{ objects: DetectedObject[]; counts: Record<string, number> }>(`/analysis/${videoId}/objects`)).data });
  const people = useQuery({ queryKey: ["pe", videoId], queryFn: async () => (await api.get<{ people: Subject[] }>(`/analysis/${videoId}/people`)).data.people });
  const ocr = useQuery({ queryKey: ["oc", videoId], queryFn: async () => (await api.get<{ ocr: OcrResult[] }>(`/analysis/${videoId}/ocr`)).data.ocr });
  const captions = useQuery({ queryKey: ["ca", videoId], queryFn: async () => (await api.get<{ captions: Caption[] }>(`/analysis/${videoId}/captions`)).data.captions });
  const highlights = useQuery({ queryKey: ["hl", videoId], queryFn: async () => (await api.get(`/analysis/${videoId}/highlights`)).data.highlights as any[] });
  const memoryQ = useQuery({ queryKey: ["mem", videoId], queryFn: async () => (await api.get(`/analysis/${videoId}/memory`)).data.memory as any[] });
  const trajectories = useQuery({ queryKey: ["traj", videoId], queryFn: async () => (await api.get(`/analysis/${videoId}/trajectories`)).data.trajectories as any[] });
  const heatmap = useQuery({ queryKey: ["heat", videoId], queryFn: async () => (await api.get(`/analysis/${videoId}/heatmap`)).data as { grid: number; cells: number[][]; max: number } });
  const dwell = useQuery({ queryKey: ["dw", videoId], queryFn: async () => (await api.get(`/analysis/${videoId}/dwell`)).data.dwell as any[] });

  // Live processing status — polls while the job runs (spec §52: realtime feel).
  const status = useQuery({
    queryKey: ["status", videoId],
    queryFn: async () => (await api.get(`/analysis/${videoId}/status`)).data as
      { status: string; stage?: string; progress?: number },
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "completed" || s === "failed" || s === "unknown" ? false : 1500;
    },
  });
  const processing = ["queued", "running"].includes(status.data?.status ?? "");

  // While processing, refresh all analysis panels so results stream in live;
  // when it finishes, do one final refresh.
  useEffect(() => {
    if (!processing) {
      qc.invalidateQueries({ queryKey: ["ov", videoId] });
      qc.invalidateQueries({ queryKey: ["ev", videoId] });
      qc.invalidateQueries({ queryKey: ["ob", videoId] });
      qc.invalidateQueries({ queryKey: ["pe", videoId] });
      qc.invalidateQueries({ queryKey: ["oc", videoId] });
      qc.invalidateQueries({ queryKey: ["ca", videoId] });
      return;
    }
    const id = setInterval(() => {
      ["ov", "ev", "ob", "pe", "oc", "ca", "hl", "mem"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k, videoId] }));
    }, 2500);
    return () => clearInterval(id);
  }, [processing, videoId, qc]);

  const video: Video | undefined = overview.data?.video;
  const dur = duration || video?.duration_sec || 0;

  // --- load raw video as an authorized blob ---
  useEffect(() => {
    let url: string | undefined;
    api.get(`/analysis/${videoId}/stream`, { responseType: "blob" })
      .then((r) => { url = URL.createObjectURL(r.data); setVideoSrc(url); })
      .catch(() => setVideoSrc(undefined));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [videoId]);

  function seek(ts: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = ts;
    v.play();
  }
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  }

  function exportJson() {
    const data = {
      video: overview.data?.video,
      counts: overview.data?.counts,
      events: events.data ?? [],
      objects: objects.data?.objects ?? [],
      object_counts: objects.data?.counts ?? {},
      people: people.data ?? [],
      ocr: ocr.data ?? [],
      captions: captions.data ?? [],
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subli-analysis-${videoId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [reportBusy, setReportBusy] = useState(false);
  async function generateReport(sections?: string[]) {
    setReportBusy(true);
    try {
      const gen = await api.post(`/reports/${videoId}/generate`, sections ? { sections } : {});
      const blob = await api.get(gen.data.download_url, { responseType: "blob" });
      const url = URL.createObjectURL(blob.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = gen.data.filename || "subli-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setReportBusy(false);
    }
  }

  // keyboard shortcuts (spec §60)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const v = videoRef.current;
      if (!v) return;
      const k = e.key.toLowerCase();
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowLeft") v.currentTime -= 5;
      else if (e.key === "ArrowRight") v.currentTime += 5;
      else if (k === "j") v.currentTime -= 10;
      else if (k === "l") v.currentTime += 10;
      else if (k === "k") v.pause();
      else if (k === "b") setShowBoxes((b) => !b);
      else if (k === "p") setShowPaths((b) => !b);
      else if (k === "g") setShowGraph(true);
      else if (k === "h") setTab("highlights");
      else if (k === "m") setTab("memory");
      else if (e.key === "/") { e.preventDefault(); setTab("search"); }
      else if (["e", "a", "f", "s"].includes(k)) {
        // handled where the control lives (RightPanel / subtitles)
        window.dispatchEvent(new CustomEvent("subli-shortcut", { detail: k }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (overview.isLoading) {
    return <div className="flex h-screen items-center justify-center"><Spinner className="h-6 w-6 text-muted" /></div>;
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-sm font-semibold leading-tight">{video?.original_name}</p>
            {processing ? (
              <p className="flex items-center gap-1.5 text-xs text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Analyzing… {status.data?.stage} {status.data?.progress ?? 0}%
              </p>
            ) : (
              <p className="text-xs text-muted">
                {formatTime(dur)} · {overview.data?.counts.events} events · {overview.data?.counts.objects} objects
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={mediaUrl(`/analysis/${videoId}/subtitles.srt`)} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><Download className="h-4 w-4" /> Subtitles</Button>
          </a>
          <Button variant="outline" size="sm" onClick={() => setShowReport(true)} disabled={reportBusy}>
            {reportBusy ? <Spinner /> : <FileText className="h-4 w-4" />} Report
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInvestigate(true)} title="Investigation">
            <Flag className="h-4 w-4" /> Investigate
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowGraph(true)} title="Event graph">
            <Share2 className="h-4 w-4" /> Graph
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowQuality(true)} title="Analysis quality">
            <Gauge className="h-4 w-4" /> Quality
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} title="Export analysis as JSON">
            <Download className="h-4 w-4" /> JSON
          </Button>
          <Button size="sm" onClick={() => navigate(`/present/${videoId}`)} title="Presentation mode">
            <Sparkles className="h-4 w-4" /> Present
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_1fr_340px]">
        {/* left rail */}
        <aside className="hidden overflow-y-auto border-r border-line bg-surface lg:block">
          <LeftRail
            tab={tab} setTab={setTab}
            counts={{
              highlights: highlights.data?.length ?? 0,
              events: events.data?.length ?? 0,
              objects: objects.data?.objects.length ?? 0,
              people: people.data?.length ?? 0,
              ocr: ocr.data?.length ?? 0,
              memory: memoryQ.data?.length ?? 0,
              dwell: dwell.data?.length ?? 0,
            }}
          />
          <div className="p-3">
            <PanelList
              tab={tab}
              events={events.data ?? []}
              objects={objects.data}
              people={people.data ?? []}
              ocr={ocr.data ?? []}
              highlights={highlights.data ?? []}
              memory={memoryQ.data ?? []}
              dwell={dwell.data ?? []}
              onSeek={seek}
              videoId={videoId!}
            />
          </div>
        </aside>

        {/* center: player + timeline */}
        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-1 items-center justify-center bg-ink/95 p-4">
            {videoSrc ? (
              <div className="relative inline-flex max-h-full max-w-full">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="block max-h-full max-w-full rounded-lg"
                  onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
                {showBoxes && video?.width && video?.height && (
                  <BoxOverlay
                    objects={objects.data?.objects ?? []}
                    current={current}
                    vw={video.width}
                    vh={video.height}
                  />
                )}
                {showPaths && (
                  <PathOverlay trajectories={trajectories.data ?? []} current={current} />
                )}
                {showHeat && heatmap.data && <HeatmapOverlay data={heatmap.data} />}
              </div>
            ) : (
              <div className="text-white/60"><Spinner className="h-6 w-6" /></div>
            )}
          </div>

          {/* controls */}
          <div className="border-t border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-3">
              <Button size="icon" onClick={togglePlay}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <span className="font-mono text-xs tabular-nums text-muted">
                {formatTime(current)} / {formatTime(dur)}
              </span>
              <Button
                variant={showBoxes ? "default" : "outline"}
                size="sm"
                className="ml-auto"
                onClick={() => setShowBoxes((b) => !b)}
                title="Toggle AI detection boxes"
              >
                <ScanEye className="h-4 w-4" /> Boxes
              </Button>
              <Button
                variant={showPaths ? "default" : "outline"}
                size="sm"
                onClick={() => setShowPaths((b) => !b)}
                title="Toggle movement paths"
              >
                <Share2 className="h-4 w-4" /> Paths
              </Button>
              <Button
                variant={showHeat ? "default" : "outline"}
                size="sm"
                onClick={() => setShowHeat((b) => !b)}
                title="Toggle activity heatmap"
              >
                <Gauge className="h-4 w-4" /> Heatmap
              </Button>
              <select
                className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
                onChange={(e) => { if (videoRef.current) videoRef.current.playbackRate = Number(e.target.value); }}
                defaultValue="1"
              >
                {[0.5, 1, 1.5, 2].map((s) => <option key={s} value={s}>{s}×</option>)}
              </select>
            </div>

            {/* timeline with event markers */}
            <Timeline
              duration={dur}
              current={current}
              events={events.data ?? []}
              onSeek={seek}
            />
          </div>
        </section>

        {/* right: AI insights */}
        <aside className="hidden overflow-y-auto border-l border-line bg-surface lg:block">
          <RightPanel
            videoId={videoId!}
            captions={captions.data ?? []}
            current={current}
            onSeek={seek}
          />
        </aside>
      </div>

      {showGraph && (
        <EventGraph videoId={videoId!} duration={dur}
          onSeek={(t) => { seek(t); setShowGraph(false); }}
          onClose={() => setShowGraph(false)} />
      )}
      {showQuality && (
        <QualityPanel videoId={videoId!} onClose={() => setShowQuality(false)} />
      )}
      {showReport && (
        <ReportBuilder busy={reportBusy}
          onGenerate={(secs) => { generateReport(secs); setShowReport(false); }}
          onClose={() => setShowReport(false)} />
      )}
      {showInvestigate && (
        <Investigation videoId={videoId!}
          highlights={highlights.data ?? []} events={events.data ?? []}
          onSeek={(t) => { seek(t); }} onClose={() => setShowInvestigate(false)} />
      )}
    </div>
  );
}

function Investigation({ videoId, highlights, events, onSeek, onClose }: {
  videoId: string; highlights: any[]; events: Event[];
  onSeek: (t: number) => void; onClose: () => void;
}) {
  const moments = [
    ...highlights.map((h) => ({ ts: h.ts, label: h.title, description: h.description })),
    ...events.map((e) => ({ ts: e.start_time, label: e.type.replace(/_/g, " "), description: e.description || "" })),
  ].sort((a, b) => a.ts - b.ts);
  const [sel, setSel] = useState<number[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (i: number) => setSel((s) => s.includes(i) ? s.filter((x) => x !== i) : [...s, i]);

  async function analyze() {
    setBusy(true); setAnswer(null);
    try {
      const items = sel.map((i) => moments[i]);
      const { data } = await api.post("/chat/investigate", { video_id: videoId, items });
      setAnswer(data.answer);
    } finally { setBusy(false); }
  }

  return (
    <Overlay title="Investigation Workspace" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Select the moments relevant to your investigation, then analyze only those.</p>
      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {moments.length === 0 ? <EmptyState title="No analyzed data available." /> :
          moments.map((m, i) => (
            <label key={i} className="flex items-center gap-2.5 rounded-lg border border-line p-2.5 text-sm">
              <input type="checkbox" checked={sel.includes(i)} onChange={() => toggle(i)} />
              <button className="font-mono text-xs text-accent" onClick={(e) => { e.preventDefault(); onSeek(m.ts); }}>{formatTime(m.ts)}</button>
              <span className="min-w-0 flex-1 truncate">{m.description || m.label}</span>
            </label>
          ))}
      </div>
      <Button className="mt-4 w-full" disabled={busy || sel.length === 0} onClick={analyze}>
        {busy ? <Spinner /> : <Sparkles className="h-4 w-4" />} Analyze {sel.length} selected
      </Button>
      {answer && (
        <div className="animate-fade-in mt-3 rounded-lg border border-line bg-bg p-3 text-sm whitespace-pre-wrap">{answer}</div>
      )}
    </Overlay>
  );
}

function ReportBuilder({ onGenerate, onClose, busy }: {
  onGenerate: (sections: string[]) => void; onClose: () => void; busy: boolean;
}) {
  const ALL = [
    { id: "summary", label: "Executive Summary" },
    { id: "timeline", label: "Event Timeline" },
    { id: "objects", label: "Detected Objects" },
    { id: "ocr", label: "Detected Text (OCR)" },
  ];
  const [sel, setSel] = useState<string[]>(ALL.map((s) => s.id));
  const toggle = (id: string) =>
    setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  return (
    <Overlay title="Build report" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Choose the sections to include in the PDF.</p>
      <div className="space-y-2">
        {ALL.map((s) => (
          <label key={s.id} className="flex items-center gap-2.5 rounded-lg border border-line p-2.5 text-sm">
            <input type="checkbox" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} />
            {s.label}
          </label>
        ))}
      </div>
      <Button className="mt-4 w-full" disabled={busy || sel.length === 0}
        onClick={() => onGenerate(sel)}>
        {busy ? <Spinner /> : <FileText className="h-4 w-4" />} Generate PDF
      </Button>
    </Overlay>
  );
}

// --------------------------------------------------------------------------
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-fade-in relative z-10 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function EventGraph({ videoId, duration, onSeek, onClose }: {
  videoId: string; duration: number; onSeek: (t: number) => void; onClose: () => void;
}) {
  const g = useQuery({
    queryKey: ["graph", videoId],
    queryFn: async () => (await api.get(`/analysis/${videoId}/graph`)).data as
      { nodes: Event[]; edges: any[] },
  });
  const nodes = g.data?.nodes ?? [];
  const edges = g.data?.edges ?? [];
  const W = 860, H = Math.max(240, nodes.length ? 300 : 160);
  const pos = (n: Event, i: number) => ({
    x: 40 + (duration ? (n.start_time / duration) : (i / Math.max(nodes.length - 1, 1))) * (W - 80),
    y: 60 + (i % 2 === 0 ? 0 : 120) + 40,
  });
  const byId: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n, i) => (byId[n.id] = pos(n, i)));

  return (
    <Overlay title="AI Event Graph" onClose={onClose}>
      {g.isLoading ? <Spinner className="text-muted" /> :
       nodes.length === 0 ? <EmptyState title="No analyzed data available." /> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 Z" fill="#9ca3af" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = byId[e.from_event], b = byId[e.to_event];
            if (!a || !b) return null;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#9ca3af" strokeWidth={1.5} markerEnd="url(#arrow)" />;
          })}
          {nodes.map((n, i) => {
            const p = pos(n, i);
            return (
              <g key={n.id} className="cursor-pointer" onClick={() => onSeek(n.start_time)}>
                <circle cx={p.x} cy={p.y} r={8} fill="#111" />
                <text x={p.x} y={p.y - 14} fontSize={11} textAnchor="middle" fill="#111" fontWeight="600">
                  {n.type.replace(/_/g, " ").toLowerCase()}
                </text>
                <text x={p.x} y={p.y + 22} fontSize={10} textAnchor="middle" fill="#6B7280" fontFamily="monospace">
                  {formatTime(n.start_time)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <p className="mt-3 text-xs text-muted">Nodes are real detected events; arrows show temporal "leads-to" relations. Click a node to seek.</p>
    </Overlay>
  );
}

function QualityPanel({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["quality", videoId],
    queryFn: async () => (await api.get(`/analysis/${videoId}/quality`)).data as
      { metrics: Record<string, any>; models: Record<string, string>; warnings: string[] },
  });
  return (
    <Overlay title="Analysis Quality" onClose={onClose}>
      {q.isLoading ? <Spinner className="text-muted" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(q.data!.metrics).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line p-3">
                <p className="text-xs capitalize text-muted">{k.replace(/_/g, " ")}</p>
                <p className="text-lg font-bold tabular-nums">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Models used</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(q.data!.models).map(([k, v]) => (
                <Badge key={k} variant="outline">{k}: {v}</Badge>
              ))}
            </div>
          </div>
          {q.data!.warnings.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-warn">Warnings</p>
              {q.data!.warnings.map((w, i) => (
                <p key={i} className="rounded-lg border border-warn/40 bg-warn/5 p-2 text-xs text-warn">{w}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </Overlay>
  );
}

// --------------------------------------------------------------------------
// Live AI detection overlay: draws real YOLO boxes for the current moment.
const BOX_COLORS: Record<string, string> = {
  person: "#22c55e", car: "#3b82f6", truck: "#3b82f6", bus: "#3b82f6",
  motorcycle: "#a855f7", bicycle: "#a855f7", bag: "#f59e0b", phone: "#f59e0b",
};

function BoxOverlay({ objects, current, vw, vh }: {
  objects: DetectedObject[]; current: number; vw: number; vh: number;
}) {
  // Show detections within a small time window around the current frame.
  const win = 0.6;
  const boxes = objects.filter(
    (o) => o.bbox && Math.abs(o.ts - current) <= win
  );
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="none"
    >
      {boxes.map((o) => {
        const [x, y, w, h] = o.bbox!;
        const color = BOX_COLORS[o.type] || "#e5e7eb";
        return (
          <g key={o.id}>
            <rect x={x} y={y} width={w} height={h} fill="none"
                  stroke={color} strokeWidth={Math.max(vw, vh) / 300} />
            <rect x={x} y={Math.max(0, y - vh * 0.045)} width={Math.max(w, vw * 0.14)}
                  height={vh * 0.045} fill={color} />
            <text x={x + vw * 0.006} y={y - vh * 0.012}
                  fontSize={vh * 0.032} fill="#fff" fontFamily="monospace">
              {o.type} {o.confidence ? Math.round(o.confidence * 100) + "%" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Reconstructed movement paths, revealed up to the current playback time.
function PathOverlay({ trajectories, current }: { trajectories: any[]; current: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1000 1000" preserveAspectRatio="none">
      {trajectories.map((t, i) => {
        const pts = t.points.filter((p: any) => p.ts <= current + 0.05);
        if (pts.length < 2) return null;
        const color = BOX_COLORS[t.type] || "#3b82f6";
        const d = pts.map((p: any, j: number) =>
          `${j === 0 ? "M" : "L"} ${p.x * 1000} ${p.y * 1000}`).join(" ");
        const head = pts[pts.length - 1];
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={color} strokeWidth={3}
              strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
            <circle cx={head.x * 1000} cy={head.y * 1000} r={6} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

// Activity-density heatmap from real object centroids.
function HeatmapOverlay({ data }: { data: { grid: number; cells: number[][]; max: number } }) {
  const { grid, cells, max } = data;
  if (!max) return null;
  const cell = 1000 / grid;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1000 1000" preserveAspectRatio="none">
      {cells.flatMap((row, gy) => row.map((v, gx) => {
        if (!v) return null;
        const a = Math.min(0.72, (v / max) * 0.72);
        return <rect key={`${gx}-${gy}`} x={gx * cell} y={gy * cell} width={cell} height={cell}
          fill={`rgba(220,38,38,${a})`} />;
      }))}
    </svg>
  );
}

function LeftRail({ tab, setTab, counts }: {
  tab: Tab; setTab: (t: Tab) => void; counts: Record<string, number>;
}) {
  const items: { id: Tab; label: string; icon: any; n?: number }[] = [
    { id: "highlights", label: "Highlights", icon: Sparkles, n: counts.highlights },
    { id: "events", label: "Events", icon: Zap, n: counts.events },
    { id: "objects", label: "Objects", icon: Box, n: counts.objects },
    { id: "people", label: "People", icon: Users, n: counts.people },
    { id: "ocr", label: "Text (OCR)", icon: Type, n: counts.ocr },
    { id: "memory", label: "Memory", icon: GitCompareArrows, n: counts.memory },
    { id: "dwell", label: "Dwell", icon: Clock3, n: counts.dwell },
    { id: "search", label: "Search", icon: Search },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line p-2">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium",
            tab === it.id ? "bg-ink text-white" : "text-muted hover:bg-line/60"
          )}
        >
          <it.icon className="h-3.5 w-3.5" />
          {it.label}
          {typeof it.n === "number" && (
            <span className={cn("rounded px-1", tab === it.id ? "bg-white/20" : "bg-line")}>{it.n}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function PanelList({ tab, events, objects, people, ocr, onSeek, videoId, highlights, memory, dwell }: {
  tab: Tab;
  events: Event[];
  objects?: { objects: DetectedObject[]; counts: Record<string, number> };
  people: Subject[];
  ocr: OcrResult[];
  highlights: any[];
  memory: any[];
  dwell: any[];
  onSeek: (t: number) => void;
  videoId: string;
}) {
  if (tab === "search") return <SearchPanel videoId={videoId} onSeek={onSeek} />;

  if (tab === "dwell")
    return dwell.length ? (
      <ul className="space-y-1.5">
        {dwell.map((d, i) => (
          <li key={i}>
            <button onClick={() => onSeek(d.first_seen)} className="w-full rounded-lg border border-line p-2.5 text-left hover:bg-bg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{d.label}</span>
                {d.loitering && <Badge variant="warn">loitering</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {d.dwell}s present · {formatTime(d.first_seen)}–{formatTime(d.last_seen)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    ) : <EmptyState title="No dwell data" hint="Tracked objects with movement appear here." />;

  if (tab === "highlights")
    return highlights.length ? (
      <ul className="space-y-1.5">
        {highlights.map((h, i) => (
          <li key={i}>
            <button onClick={() => onSeek(h.ts)} className="w-full rounded-lg border border-line p-2.5 text-left hover:bg-bg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-accent">{formatTime(h.ts)}</span>
                <span className="rounded-full bg-ink/[0.06] px-1.5 text-xs tabular-nums text-muted">{Math.round(h.score * 100)}</span>
              </div>
              <p className="mt-1 text-sm font-medium">{h.title}</p>
              <p className="text-xs text-muted">{h.description}</p>
            </button>
          </li>
        ))}
      </ul>
    ) : <EmptyState title="No highlights yet" hint="Highlights appear once analysis produces events." />;

  if (tab === "memory")
    return memory.length ? (
      <ul className="space-y-1.5">
        {memory.map((m, i) => (
          <li key={i}>
            <button onClick={() => onSeek(m.ts)} className="w-full rounded-lg border border-line p-2.5 text-left hover:bg-bg">
              <span className="font-mono text-xs text-accent">{formatTime(m.ts)}</span>
              <div className="mt-1 space-y-0.5">
                {m.changes.map((c: any, j: number) => (
                  <p key={j} className="text-xs capitalize">{c.field}: <span className="text-muted">{String(c.from)} → {String(c.to)}</span></p>
                ))}
              </div>
            </button>
          </li>
        ))}
      </ul>
    ) : <EmptyState title="No memory changes" hint="Temporal state changes appear here." />;

  if (tab === "events")
    return events.length ? (
      <ul className="space-y-1.5">
        {events.map((e) => (
          <li key={e.id}>
            <button onClick={() => onSeek(e.start_time)} className="w-full rounded-lg border border-line p-2.5 text-left hover:bg-bg">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-accent">{formatTime(e.start_time)}</span>
                <Badge variant="outline">{e.type.replace(/_/g, " ").toLowerCase()}</Badge>
              </div>
              <p className="mt-1 text-sm">{e.description}</p>
            </button>
          </li>
        ))}
      </ul>
    ) : <EmptyState title="No events detected" />;

  if (tab === "objects") {
    const counts = objects?.counts ?? {};
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...entries.map(([, n]) => n));
    return entries.length ? (
      <div className="space-y-1.5">
        {entries.map(([type, n]) => (
          <div key={type} className="relative overflow-hidden rounded-lg border border-line p-2.5">
            <div className="absolute inset-y-0 left-0 bg-ink/[0.06]"
                 style={{ width: `${(n / max) * 100}%` }} />
            <div className="relative flex items-center justify-between">
              <span className="text-sm capitalize">{type}</span>
              <Badge>{n}</Badge>
            </div>
          </div>
        ))}
      </div>
    ) : <EmptyState title="No objects detected" />;
  }

  if (tab === "people")
    return people.length ? (
      <ul className="space-y-1.5">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-lg border border-line p-2.5">
            <span className="text-sm font-medium">{p.label}</span>
            <button className="text-xs text-accent hover:underline" onClick={() => onSeek(p.first_seen ?? 0)}>
              {formatTime(p.first_seen ?? 0)}
            </button>
          </li>
        ))}
      </ul>
    ) : <EmptyState title="No people tracked" hint="Anonymous tracking only." />;

  if (tab === "ocr")
    return ocr.length ? (
      <ul className="space-y-1.5">
        {ocr.map((o) => (
          <li key={o.id}>
            <button onClick={() => onSeek(o.ts)} className="w-full rounded-lg border border-line p-2.5 text-left hover:bg-bg">
              <span className="font-mono text-xs text-accent">{formatTime(o.ts)}</span>
              <p className="mt-1 text-sm">"{o.text}"</p>
            </button>
          </li>
        ))}
      </ul>
    ) : <EmptyState title="No text detected" hint="Install an OCR engine to enable." />;

  return null;
}

function SearchPanel({ videoId, onSeek }: { videoId: string; onSeek: (t: number) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/search", { video_id: videoId, query: q, limit: 12 });
      setResults(data.results);
    } finally { setBusy(false); }
  }
  return (
    <div>
      <div className="flex gap-2">
        <Input placeholder='e.g. "person near entrance"' value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()} />
        <Button size="icon" onClick={run}>{busy ? <Spinner /> : <Search className="h-4 w-4" />}</Button>
      </div>
      <ul className="mt-3 space-y-1.5">
        {results.map((r, i) => (
          <li key={i}>
            <button onClick={() => onSeek(r.ts)} className="w-full rounded-lg border border-line p-2.5 text-left hover:bg-bg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-accent">{formatTime(r.ts)}</span>
                <span className="text-xs text-muted">{Math.round(r.relevance * 100)}%</span>
              </div>
              <p className="mt-1 text-sm">{r.content}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Timeline({ duration, current, events, onSeek }: {
  duration: number; current: number; events: Event[]; onSeek: (t: number) => void;
}) {
  const pct = duration ? (current / duration) * 100 : 0;
  return (
    <div className="mt-3">
      <div
        className="relative h-8 cursor-pointer rounded-md bg-line/60"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - rect.left) / rect.width) * duration);
        }}
      >
        <div className="absolute inset-y-0 left-0 rounded-l-md bg-ink/10" style={{ width: `${pct}%` }} />
        {events.map((ev) => (
          <div
            key={ev.id}
            title={`${formatTime(ev.start_time)} — ${ev.description}`}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent hover:scale-125"
            style={{ left: `${duration ? (ev.start_time / duration) * 100 : 0}%` }}
            onClick={(e) => { e.stopPropagation(); onSeek(ev.start_time); }}
          />
        ))}
        <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

function RightPanel({ videoId, captions, current, onSeek }: {
  videoId: string; captions: Caption[]; current: number; onSeek: (t: number) => void;
}) {
  const [q, setQ] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string; citations?: { ts: number }[] }[]>([]);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  const currentCaption = useMemo(
    () => [...captions].reverse().find((c) => c.ts <= current)?.text,
    [captions, current]
  );

  const [explain, setExplain] = useState<string | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);
  async function explainMoment() {
    setExplainBusy(true);
    setExplain(null);
    try {
      const { data } = await api.get(`/analysis/${videoId}/explain`, { params: { ts: current } });
      setExplain(data.explanation);
    } finally {
      setExplainBusy(false);
    }
  }

  const [similar, setSimilar] = useState<any[] | null>(null);
  const [similarBusy, setSimilarBusy] = useState(false);
  async function findSimilar() {
    setSimilarBusy(true);
    setSimilar(null);
    try {
      const { data } = await api.get(`/analysis/${videoId}/similar`, { params: { ts: current } });
      setSimilar(data.results);
    } finally {
      setSimilarBusy(false);
    }
  }

  async function ask(question?: string, ts?: number) {
    const text = question ?? q;
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setQ("");
    setBusy(true);
    try {
      const { data } = await api.post("/chat/ask", { video_id: videoId, question: text, ts });
      setMessages((m) => [...m, { role: "assistant", text: data.answer, citations: data.citations }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong." }]);
    } finally { setBusy(false); }
  }
  function askAtTime() {
    const t = timeStr.trim();
    if (!t) return;
    const parts = t.split(":").map(Number);
    const ts = parts.length === 2 ? parts[0] * 60 + parts[1] : Number(t);
    if (isNaN(ts)) return;
    setTimeStr("");
    ask(`What happened at ${t}?`, ts);
  }
  async function findStory() {
    setMessages((m) => [...m, { role: "user", text: "Find the story" }]);
    setBusy(true);
    try {
      const d = (await api.post(`/chat/find-story?video_id=${videoId}`)).data;
      setMessages((m) => [...m, { role: "assistant", text: d.answer, citations: d.citations }]);
    } finally { setBusy(false); }
  }
  async function addEvidence() {
    // needs project_id — fetch via overview? Simplify: derive from video's project via analysis overview is video only.
    const ov = (await api.get(`/analysis/${videoId}/overview`)).data;
    await api.post("/evidence", {
      project_id: ov.video.project_id,
      video_id: videoId,
      ts: current,
      description: currentCaption || "Marked frame",
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const summary = useQuery({
    queryKey: ["sum", videoId],
    queryFn: async () => (await api.get(`/analysis/${videoId}/summary`)).data as
      { summary: string; suggested_questions: string[] },
  });

  // keyboard shortcuts routed from the player (E/A/F/S)
  useEffect(() => {
    const onShortcut = ((e: CustomEvent<string>) => {
      const k = e.detail;
      if (k === "e") addEvidence();
      else if (k === "a") inputRef.current?.focus();
      else if (k === "f") findStory();
      else if (k === "s") window.open(mediaUrl(`/analysis/${videoId}/subtitles.srt`), "_blank");
    }) as EventListener;
    window.addEventListener("subli-shortcut", onShortcut);
    return () => window.removeEventListener("subli-shortcut", onShortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, current, currentCaption]);

  return (
    <div className="space-y-4 p-4">
      {summary.data?.summary && (
        <div>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4" /> AI Summary
          </h3>
          <p className="rounded-lg border border-line bg-bg p-3 text-sm">{summary.data.summary}</p>
          {summary.data.suggested_questions?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {summary.data.suggested_questions.map((sq) => (
                <button key={sq} onClick={() => ask(sq)}
                  className="rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:bg-bg">
                  {sq}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
          <ScanEye className="h-4 w-4" /> Current moment
        </h3>
        <div className="rounded-lg border border-line bg-bg p-3 text-sm">
          <span className="font-mono text-xs text-accent">{formatTime(current)}</span>
          <p className="mt-1">{currentCaption || "—"}</p>
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={addEvidence}>
            <Flag className="h-3.5 w-3.5" /> {added ? "Added!" : "Add evidence"}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={explainMoment} disabled={explainBusy}>
            {explainBusy ? <Spinner /> : <ScanEye className="h-3.5 w-3.5" />} Explain
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={findSimilar} disabled={similarBusy}>
            {similarBusy ? <Spinner /> : <Search className="h-3.5 w-3.5" />} Similar
          </Button>
        </div>
        {explain && (
          <div className="animate-fade-in mt-2 rounded-lg border border-line bg-bg p-3 text-sm">{explain}</div>
        )}
        {similar && (
          <div className="animate-fade-in mt-2 space-y-1">
            {similar.length === 0 ? <p className="text-xs text-muted">No similar frames.</p> :
              similar.slice(0, 5).map((s, i) => (
                <button key={i} onClick={() => onSeek(s.ts)}
                  className="flex w-full items-center gap-2 rounded-lg border border-line p-2 text-left text-xs hover:bg-bg">
                  <span className="font-mono text-accent">{formatTime(s.ts)}</span>
                  <span className="min-w-0 flex-1 truncate">{s.content}</span>
                  <span className="text-muted">{Math.round(s.relevance * 100)}%</span>
                </button>
              ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" /> Ask Subli
        </h3>

        {/* ask about a specific time */}
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-bg p-2">
          <Clock3 className="h-4 w-4 text-muted" />
          <input value={timeStr} onChange={(e) => setTimeStr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askAtTime()}
            placeholder="mm:ss" className="w-16 bg-transparent font-mono text-sm outline-none" />
          <Button size="sm" variant="outline" onClick={askAtTime}>What happened?</Button>
          <Button size="sm" variant="ghost" className="ml-auto text-xs"
            onClick={() => setTimeStr(formatTime(current))}>use current</Button>
        </div>

        {/* conversation thread */}
        {messages.length > 0 && (
          <div className="mb-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-line p-2">
            {messages.map((msg, i) => (
              <div key={i} className={cn("rounded-lg px-2.5 py-1.5 text-sm",
                msg.role === "user" ? "bg-ink text-white" : "bg-bg")}>
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {msg.citations.map((c, j) => (
                      <button key={j} onClick={() => onSeek(c.ts)}
                        className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent hover:bg-accent/20">
                        {formatTime(c.ts)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 px-2.5 text-xs text-muted"><Spinner /> thinking…</div>}
          </div>
        )}

        <div className="flex gap-2">
          <Input ref={inputRef} placeholder="Ask anything… or a time like 0:45" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()} />
          <Button size="icon" onClick={() => ask()}>
            {busy ? <Spinner /> : <MessageSquare className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button variant="subtle" size="sm" onClick={() => ask("What happened?")}>Summary</Button>
          <Button variant="subtle" size="sm" onClick={() => ask("Show all vehicle events.")}>Vehicles</Button>
          <Button variant="subtle" size="sm" onClick={findStory}>
            <Sparkles className="h-3.5 w-3.5" /> Find the Story
          </Button>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMessages([])}>Clear</Button>
          )}
        </div>
      </div>
    </div>
  );
}
