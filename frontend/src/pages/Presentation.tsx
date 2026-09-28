import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ScanEye, Box, Users, Zap, Clock, MessageSquare, Flag,
  FileText, ArrowRight, ArrowLeft, X, Video as VideoIcon, Play,
} from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { cn, formatTime } from "@/lib/utils";
import type { Caption, DetectedObject, Event, Subject, Video } from "@/types";

// Presentation Mode (spec §58): a stepped, full-screen walkthrough of the real
// analysis pipeline — built for a live university demonstration.
export function Presentation() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const overview = useQuery({ queryKey: ["p-ov", videoId], queryFn: async () => (await api.get(`/analysis/${videoId}/overview`)).data });
  const objects = useQuery({ queryKey: ["p-ob", videoId], queryFn: async () => (await api.get<{ objects: DetectedObject[]; counts: Record<string, number> }>(`/analysis/${videoId}/objects`)).data });
  const events = useQuery({ queryKey: ["p-ev", videoId], queryFn: async () => (await api.get<{ events: Event[] }>(`/analysis/${videoId}/events`)).data.events });
  const people = useQuery({ queryKey: ["p-pe", videoId], queryFn: async () => (await api.get<{ people: Subject[] }>(`/analysis/${videoId}/people`)).data.people });
  const captions = useQuery({ queryKey: ["p-ca", videoId], queryFn: async () => (await api.get<{ captions: Caption[] }>(`/analysis/${videoId}/captions`)).data.captions });

  const video: Video | undefined = overview.data?.video;

  const slides = useMemo(() => buildSlides({
    video,
    counts: overview.data?.counts,
    objects: objects.data,
    events: events.data ?? [],
    people: people.data ?? [],
    captions: captions.data ?? [],
    videoId: videoId!,
  }), [overview.data, objects.data, events.data, people.data, captions.data, videoId, video]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") setStep((s) => Math.min(s + 1, slides.length - 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
      else if (e.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, navigate]);

  if (overview.isLoading) {
    return <div className="flex h-screen items-center justify-center"><Spinner className="h-6 w-6 text-muted" /></div>;
  }

  const slide = slides[step];

  return (
    <div className="fixed inset-0 flex flex-col bg-bg">
      {/* progress bar */}
      <div className="flex h-1 w-full">
        {slides.map((_, i) => (
          <div key={i} className={cn("h-full flex-1", i <= step ? "bg-ink" : "bg-line")} />
        ))}
      </div>

      <div className="flex items-center justify-between px-6 py-3">
        <span className="text-xs font-medium text-muted">
          SUBLI · PRESENTATION · {step + 1}/{slides.length}
        </span>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div key={step} className="animate-fade-in flex flex-1 items-center justify-center overflow-y-auto px-6 pb-6">
        <div className="w-full max-w-4xl">{slide.content}</div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-6 py-4">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <span className="text-sm font-medium">{slide.title}</span>
        {step < slides.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => navigate(`/analysis/${videoId}`)}>
            Open workspace <Play className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 text-center">
      <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-bg text-ink">{icon}</div>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}

function Title({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-bold tracking-tight">{title}</h2>
      {sub && <p className="mx-auto mt-2 max-w-xl text-muted">{sub}</p>}
    </div>
  );
}

function buildSlides(d: {
  video?: Video; counts?: any; objects?: { objects: DetectedObject[]; counts: Record<string, number> };
  events: Event[]; people: Subject[]; captions: Caption[]; videoId: string;
}) {
  const c = d.counts || {};
  const objCounts = d.objects?.counts || {};
  const midCap = d.captions[Math.floor(d.captions.length / 2)];
  const capModel = d.captions[0]?.model || "";

  return [
    {
      title: "Subli",
      content: (
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-white">
            <VideoIcon className="h-8 w-8" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight">See what your videos say.</h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted">
            An AI video intelligence platform. This is a live walkthrough of a real
            analysis — every number comes from the actual model output.
          </p>
          <p className="mt-6 text-sm text-muted">Use → / ← keys or the buttons. Esc to exit.</p>
        </div>
      ),
    },
    {
      title: "The footage",
      content: (
        <>
          <Title eyebrow="Input" title="A silent video" sub={d.video?.original_name} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat icon={<Clock className="h-4 w-4" />} value={formatTime(d.video?.duration_sec || 0)} label="Duration" />
            <Stat icon={<VideoIcon className="h-4 w-4" />} value={`${d.video?.width || "?"}×${d.video?.height || "?"}`} label="Resolution" />
            <Stat icon={<Box className="h-4 w-4" />} value={c.frames ?? 0} label="Keyframes" />
            <Stat icon={<Zap className="h-4 w-4" />} value={c.events ?? 0} label="Events" />
          </div>
        </>
      ),
    },
    {
      title: "AI vision",
      content: (
        <>
          <Title eyebrow="Computer vision" title="The model sees objects" sub="YOLOv8 detections drawn on a real keyframe." />
          <FrameWithBoxes videoId={d.videoId} objects={d.objects?.objects ?? []} video={d.video} events={d.events} />
        </>
      ),
    },
    {
      title: "Objects",
      content: (
        <>
          <Title eyebrow="Detection" title={`${c.objects ?? 0} objects detected`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(objCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([t, n]) => (
              <Stat key={t} icon={<Box className="h-4 w-4" />} value={n as number} label={t} />
            ))}
          </div>
        </>
      ),
    },
    {
      title: "People",
      content: (
        <>
          <Title eyebrow="Anonymous tracking" title={`${d.people.length} people tracked`} sub="Anonymous identities only — no facial recognition." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {d.people.slice(0, 8).map((p) => (
              <Stat key={p.id} icon={<Users className="h-4 w-4" />} value={p.label.replace("Person #", "#")} label={`from ${formatTime(p.first_seen || 0)}`} />
            ))}
          </div>
        </>
      ),
    },
    {
      title: "Understanding",
      content: (
        <>
          <Title eyebrow="Vision-language" title="It describes the scene" sub={`Captioning model: ${capModel}`} />
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <ScanEye className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-4 text-2xl font-medium">“{midCap?.text || "—"}”</p>
            <p className="mt-2 text-sm text-muted">at {formatTime(midCap?.ts || 0)}</p>
          </div>
        </>
      ),
    },
    {
      title: "Events",
      content: (
        <>
          <Title eyebrow="Temporal reasoning" title="Events over time" sub="Derived from the detection timeline." />
          <div className="space-y-2">
            {d.events.slice(0, 7).map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
                <span className="font-mono text-sm text-accent">{formatTime(e.start_time)}</span>
                <span className="text-sm">{e.description}</span>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      title: "Ask Subli",
      content: (
        <>
          <Title eyebrow="Grounded AI" title="Question the footage" sub="Answers cite real timestamps and never invent evidence." />
          <div className="grid gap-3 sm:grid-cols-2">
            {["What happened?", "When did the first person appear?", "Show all vehicle events.", "What changed over time?"].map((q) => (
              <div key={q} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
                <MessageSquare className="h-4 w-4 text-muted" /> {q}
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      title: "Evidence & report",
      content: (
        <>
          <Title eyebrow="Output" title="Collect evidence, export a report" />
          <div className="grid grid-cols-2 gap-4">
            <Stat icon={<Flag className="h-4 w-4" />} value="Evidence" label="Pin key moments" />
            <Stat icon={<FileText className="h-4 w-4" />} value="PDF" label="One-click report" />
          </div>
          <div className="mt-6 rounded-xl border border-line bg-surface p-5 text-center text-sm text-muted">
            VIDEO → UNDERSTANDING → MEMORY → EVENTS → REASONING → SEARCH → EVIDENCE → REPORT
          </div>
        </>
      ),
    },
  ];
}

function FrameWithBoxes({ videoId, objects, video, events }: {
  videoId: string; objects: DetectedObject[]; video?: Video; events: Event[];
}) {
  // Pick a busy moment: the timestamp with the most detections.
  const ts = useMemo(() => {
    if (!objects.length) return events[0]?.start_time ?? 0;
    const byTs: Record<string, number> = {};
    objects.forEach((o) => { byTs[o.ts] = (byTs[o.ts] || 0) + 1; });
    return Number(Object.entries(byTs).sort((a, b) => b[1] - a[1])[0][0]);
  }, [objects, events]);
  const vw = video?.width || 640, vh = video?.height || 480;
  const boxes = objects.filter((o) => o.bbox && Math.abs(o.ts - ts) <= 0.6);

  return (
    <div className="relative mx-auto max-w-2xl overflow-hidden rounded-xl border border-line bg-ink">
      <img src={mediaUrl(`/analysis/${videoId}/frame?ts=${ts}`)} alt="keyframe"
           className="block w-full" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none">
        {boxes.map((o) => {
          const [x, y, w, h] = o.bbox!;
          return (
            <g key={o.id}>
              <rect x={x} y={y} width={w} height={h} fill="none" stroke="#22c55e" strokeWidth={Math.max(vw, vh) / 250} />
              <text x={x + 4} y={y - 6} fontSize={vh * 0.035} fill="#22c55e" fontFamily="monospace">{o.type}</text>
            </g>
          );
        })}
      </svg>
      <p className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
        {boxes.length} detections at {formatTime(ts)}
      </p>
    </div>
  );
}
