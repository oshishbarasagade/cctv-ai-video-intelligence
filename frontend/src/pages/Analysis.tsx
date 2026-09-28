import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Play, Pause, Zap, Box, Users, Type, ScanEye, Search,
  Flag, MessageSquare, Sparkles, Download, GitCompareArrows, FileText,
} from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Spinner, EmptyState } from "@/components/ui/misc";
import { cn, formatTime } from "@/lib/utils";
import type {
  Answer, Caption, DetectedObject, Event, OcrResult,
  SearchResult, Subject, Video,
} from "@/types";

type Tab = "overview" | "objects" | "people" | "ocr" | "events" | "search";

export function Analysis() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string>();
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>("events");
  const [showBoxes, setShowBoxes] = useState(true);

  // --- data ---
  const overview = useQuery({ queryKey: ["ov", videoId], queryFn: async () => (await api.get(`/analysis/${videoId}/overview`)).data });
  const events = useQuery({ queryKey: ["ev", videoId], queryFn: async () => (await api.get<{ events: Event[] }>(`/analysis/${videoId}/events`)).data.events });
  const objects = useQuery({ queryKey: ["ob", videoId], queryFn: async () => (await api.get<{ objects: DetectedObject[]; counts: Record<string, number> }>(`/analysis/${videoId}/objects`)).data });
  const people = useQuery({ queryKey: ["pe", videoId], queryFn: async () => (await api.get<{ people: Subject[] }>(`/analysis/${videoId}/people`)).data.people });
  const ocr = useQuery({ queryKey: ["oc", videoId], queryFn: async () => (await api.get<{ ocr: OcrResult[] }>(`/analysis/${videoId}/ocr`)).data.ocr });
  const captions = useQuery({ queryKey: ["ca", videoId], queryFn: async () => (await api.get<{ captions: Caption[] }>(`/analysis/${videoId}/captions`)).data.captions });

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
      ["ov", "ev", "ob", "pe", "oc", "ca"].forEach((k) =>
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
  async function generateReport() {
    setReportBusy(true);
    try {
      const gen = await api.post(`/reports/${videoId}/generate`);
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
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowLeft") v.currentTime -= 5;
      else if (e.key === "ArrowRight") v.currentTime += 5;
      else if (e.key.toLowerCase() === "j") v.currentTime -= 10;
      else if (e.key.toLowerCase() === "l") v.currentTime += 10;
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
          <Button variant="outline" size="sm" onClick={generateReport} disabled={reportBusy}>
            {reportBusy ? <Spinner /> : <FileText className="h-4 w-4" />} Report
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
              events: events.data?.length ?? 0,
              objects: objects.data?.objects.length ?? 0,
              people: people.data?.length ?? 0,
              ocr: ocr.data?.length ?? 0,
            }}
          />
          <div className="p-3">
            <PanelList
              tab={tab}
              events={events.data ?? []}
              objects={objects.data}
              people={people.data ?? []}
              ocr={ocr.data ?? []}
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
    </div>
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

function LeftRail({ tab, setTab, counts }: {
  tab: Tab; setTab: (t: Tab) => void; counts: Record<string, number>;
}) {
  const items: { id: Tab; label: string; icon: any; n?: number }[] = [
    { id: "events", label: "Events", icon: Zap, n: counts.events },
    { id: "objects", label: "Objects", icon: Box, n: counts.objects },
    { id: "people", label: "People", icon: Users, n: counts.people },
    { id: "ocr", label: "Text (OCR)", icon: Type, n: counts.ocr },
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

function PanelList({ tab, events, objects, people, ocr, onSeek, videoId }: {
  tab: Tab;
  events: Event[];
  objects?: { objects: DetectedObject[]; counts: Record<string, number> };
  people: Subject[];
  ocr: OcrResult[];
  onSeek: (t: number) => void;
  videoId: string;
}) {
  if (tab === "search") return <SearchPanel videoId={videoId} onSeek={onSeek} />;

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
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  const currentCaption = useMemo(
    () => [...captions].reverse().find((c) => c.ts <= current)?.text,
    [captions, current]
  );

  async function ask(question?: string) {
    const text = question ?? q;
    if (!text.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      const { data } = await api.post("/chat/ask", { video_id: videoId, question: text });
      setAnswer(data);
    } finally { setBusy(false); }
  }
  async function findStory() {
    setBusy(true); setAnswer(null);
    try { setAnswer((await api.post(`/chat/find-story?video_id=${videoId}`)).data); }
    finally { setBusy(false); }
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

  return (
    <div className="space-y-4 p-4">
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
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" /> Ask Subli
        </h3>
        <div className="flex gap-2">
          <Input placeholder="What happened?" value={q}
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
        </div>

        {answer && (
          <div className="animate-fade-in mt-3 rounded-lg border border-line p-3">
            <p className="whitespace-pre-wrap text-sm">{answer.answer}</p>
            {answer.citations && answer.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {answer.citations.map((c, i) => (
                  <button key={i} onClick={() => onSeek(c.ts)}
                    className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent hover:bg-accent/20">
                    {formatTime(c.ts)}
                  </button>
                ))}
              </div>
            )}
            {answer.changes && (
              <div className="mt-2 space-y-1">
                {answer.changes.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <GitCompareArrows className="h-3 w-3 text-muted" />
                    <span className="capitalize">{c.field}:</span>
                    <span className="text-muted">{String(c.before)} → {String(c.after)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
