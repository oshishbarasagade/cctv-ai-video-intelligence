import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { UploadCloud, ArrowLeft, Film, Play, RotateCw, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress, Spinner, Badge } from "@/components/ui/misc";
import { cn, formatBytes, formatTime, relativeTime } from "@/lib/utils";
import type { Project as TProject, Job } from "@/types";

const MODES = [
  { id: "quick", label: "Quick", hint: "Fast, coarse" },
  { id: "balanced", label: "Balanced", hint: "Recommended" },
  { id: "deep", label: "Deep", hint: "Thorough" },
];

const STAGES = ["metadata", "sampling", "detection", "ocr", "captioning", "events", "subtitles"];

export function Project() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState("balanced");
  const [dragOver, setDragOver] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get<TProject>(`/projects/${projectId}`)).data,
  });

  // Poll job status while processing (swaps to Supabase Realtime later).
  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => (await api.get<Job>(`/videos/jobs/${jobId}`)).data,
    enabled: !!jobId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "completed" || s === "failed" ? false : 800;
    },
  });

  async function startUpload(file: File) {
    setError("");
    setUploading(true);
    setUploadPct(0);
    setJobId(null);
    const form = new FormData();
    form.append("project_id", projectId!);
    form.append("mode", mode);
    form.append("file", file);
    try {
      const { data } = await api.post("/videos/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) =>
          e.total && setUploadPct(Math.round((e.loaded / e.total) * 100)),
      });
      setVideoId(data.video_id);
      setJobId(data.job_id);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const done = job.data?.status === "completed";
  const failed = job.data?.status === "failed";
  const currentStage = job.data?.stage;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Button>

        <PageHeader
          title={project.data?.name || "Project"}
          subtitle={project.data?.description || "Upload a video to analyze."}
        />

        {(project.data?.videos?.length ?? 0) > 0 && (
          <ProjectSearch projectId={projectId!} onOpen={(vid) => navigate(`/analysis/${vid}`)} />
        )}

        {/* upload / processing */}
        <div className="mt-6">
          {!jobId && (
            <>
              <div className="mb-3 flex gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={cn(
                      "flex-1 rounded-lg border p-3 text-left transition-colors",
                      mode === m.id ? "border-ink bg-ink text-white" : "border-line hover:bg-bg"
                    )}
                  >
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className={cn("text-xs", mode === m.id ? "text-white/70" : "text-muted")}>
                      {m.hint}
                    </p>
                  </button>
                ))}
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) startUpload(f);
                }}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors",
                  dragOver ? "border-ink bg-bg" : "border-line"
                )}
              >
                <UploadCloud className="h-8 w-8 text-muted" />
                <p className="mt-3 font-medium">Drag & drop a video here</p>
                <p className="text-sm text-muted">.mp4 .mov .avi .mkv .webm — up to 500 MB</p>
                <Button className="mt-4" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
                  {uploading ? <><Spinner /> Uploading… {uploadPct}%</> : "Browse files"}
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && startUpload(e.target.files[0])}
                />
                {uploading && <div className="mt-4 w-full max-w-sm"><Progress value={uploadPct} /></div>}
                {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              </div>
            </>
          )}

          {jobId && (
            <div className="rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {done ? "Analysis complete" : failed ? "Analysis failed" : "Processing…"}
                </h3>
                <Badge variant={done ? "ok" : failed ? "danger" : "outline"}>
                  {job.data?.status || "queued"}
                </Badge>
              </div>

              <div className="mt-4"><Progress value={job.data?.progress ?? 0} /></div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STAGES.map((s) => {
                  const idx = STAGES.indexOf(s);
                  const curIdx = currentStage ? STAGES.indexOf(currentStage) : -1;
                  const state = done || (curIdx > idx) ? "done" : currentStage === s ? "active" : "pending";
                  return (
                    <div key={s} className="flex items-center gap-2 text-sm">
                      <span className={cn(
                        "h-2 w-2 rounded-full",
                        state === "done" ? "bg-ok" : state === "active" ? "bg-accent animate-pulse" : "bg-line"
                      )} />
                      <span className={cn("capitalize", state === "pending" ? "text-muted" : "")}>{s}</span>
                    </div>
                  );
                })}
              </div>

              {failed && (
                <div className="mt-4">
                  <p className="text-sm text-danger">{job.data?.error_message || "Something went wrong."}</p>
                  <Button className="mt-3" variant="outline" onClick={async () => {
                    await api.post(`/videos/jobs/${jobId}/retry`);
                    job.refetch();
                  }}>
                    <RotateCw className="h-4 w-4" /> Retry analysis
                  </Button>
                </div>
              )}

              {done && (
                <Button className="mt-5" onClick={() => navigate(`/analysis/${videoId}`)}>
                  <Play className="h-4 w-4" /> Open Analysis Workspace
                </Button>
              )}
            </div>
          )}
        </div>

        {/* existing videos */}
        {project.data?.videos && project.data.videos.length > 0 && (
          <>
            <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">Videos</h2>
            <div className="space-y-2">
              {project.data.videos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => navigate(`/analysis/${v.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-3 text-left hover:shadow-card"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-bg">
                    <Film className="h-5 w-5 text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.original_name}</p>
                    <p className="text-xs text-muted">
                      {v.duration_sec ? formatTime(v.duration_sec) : "—"} · {formatBytes(v.size_bytes)} · {relativeTime(v.created_at)}
                    </p>
                  </div>
                  <Play className="h-4 w-4 text-muted" />
                </button>
              ))}
            </div>
          </>
        )}

        <EvidenceSection projectId={projectId!} onOpen={(vid) => navigate(`/analysis/${vid}`)} />
      </div>
    </AppShell>
  );
}

function ProjectSearch({ projectId, onOpen }: { projectId: string; onOpen: (vid: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/search`, { params: { q } });
      setResults(data.results);
    } finally { setBusy(false); }
  }
  const KIND: Record<string, string> = { event: "Event", object: "Object", ocr: "Text" };
  return (
    <div className="mt-6 rounded-xl border border-line bg-surface p-4">
      <div className="flex gap-2">
        <Input placeholder="Search this project — events, objects, text… (e.g. person, vehicle, EXIT)"
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <Button size="icon" onClick={run}>{busy ? <Spinner /> : <Search className="h-4 w-4" />}</Button>
      </div>
      {results !== null && (
        results.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No analyzed data available for “{q}”.</p>
        ) : (
          <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
            {results.map((r, i) => (
              <li key={i}>
                <button onClick={() => onOpen(r.video_id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-line p-2.5 text-left hover:bg-bg">
                  <Badge variant="outline">{KIND[r.kind] || r.kind}</Badge>
                  <span className="font-mono text-xs text-accent">{formatTime(r.ts)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{r.text}</span>
                  <span className="truncate text-xs text-muted">{r.video}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function EvidenceSection({ projectId, onOpen }: { projectId: string; onOpen: (vid: string) => void }) {
  const qc = useQueryClient();
  const ev = useQuery({
    queryKey: ["evidence", projectId],
    queryFn: async () => (await api.get(`/evidence/${projectId}`)).data.evidence as any[],
  });
  const patch = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => api.patch(`/evidence/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence", projectId] }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/evidence/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence", projectId] }),
  });

  function exportJson() {
    const blob = new Blob([JSON.stringify(ev.data ?? [], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `subli-evidence-${projectId}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!ev.data || ev.data.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Evidence Board · {ev.data.length}</h2>
        <Button variant="outline" size="sm" onClick={exportJson}>Export JSON</Button>
      </div>
      <div className="space-y-2">
        {ev.data.map((e, i) => (
          <div key={e.id} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted">#{String(i + 1).padStart(3, "0")}</span>
              {e.ts != null && <span className="font-mono text-xs text-accent">{formatTime(e.ts)}</span>}
              <input
                defaultValue={e.title || e.description || ""}
                onBlur={(ev2) => { if (ev2.target.value !== (e.title || "")) patch.mutate({ id: e.id, data: { title: ev2.target.value } }); }}
                placeholder="Title"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
              />
              {e.video_id && <Button variant="ghost" size="sm" onClick={() => onOpen(e.video_id)}>Open</Button>}
              <Button variant="ghost" size="icon" onClick={() => del.mutate(e.id)}><Trash2 className="h-4 w-4 text-muted" /></Button>
            </div>
            <input
              defaultValue={e.note || ""}
              onBlur={(ev2) => { if (ev2.target.value !== (e.note || "")) patch.mutate({ id: e.id, data: { note: ev2.target.value } }); }}
              placeholder="Add a note…"
              className="mt-2 w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs outline-none"
            />
            <input
              defaultValue={(e.tags || []).join(", ")}
              onBlur={(ev2) => {
                const tags = ev2.target.value.split(",").map((t) => t.trim()).filter(Boolean);
                patch.mutate({ id: e.id, data: { tags } });
              }}
              placeholder="tags, comma, separated"
              className="mt-1.5 w-full bg-transparent text-xs text-muted outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
