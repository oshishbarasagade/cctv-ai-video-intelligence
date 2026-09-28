import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Video, Zap, Users, Box, FolderOpen, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Spinner, Badge } from "@/components/ui/misc";
import { Analytics } from "@/components/Analytics";
import { relativeTime } from "@/lib/utils";
import type { DashboardMetrics, Project } from "@/types";

const metricCards = [
  { key: "videos", label: "Videos", icon: Video },
  { key: "events", label: "Events", icon: Zap },
  { key: "people", label: "People", icon: Users },
  { key: "objects", label: "Objects", icon: Box },
] as const;

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const metrics = useQuery({
    queryKey: ["metrics"],
    queryFn: async () => (await api.get<DashboardMetrics>("/dashboard/metrics")).data,
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await api.get<{ projects: Project[] }>("/projects")).data.projects,
  });

  const createProject = useMutation({
    mutationFn: async () =>
      (await api.post<Project>("/projects", { name, description: desc })).data,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      navigate(`/projects/${p.id}`);
    },
  });

  const removeProject = useMutation({
    mutationFn: async (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
    },
  });

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <PageHeader
          title={`${greeting}, ${user?.full_name?.split(" ")[0] || "there"}`}
          subtitle="Analyze your videos and discover what happened."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New Analysis
            </Button>
          }
        />

        {/* metrics */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {metricCards.map((m) => (
            <div key={m.key} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between text-muted">
                <span className="text-sm">{m.label}</span>
                <m.icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {metrics.isLoading ? "—" : (metrics.data?.[m.key] ?? 0)}
              </p>
            </div>
          ))}
        </div>

        {/* projects */}
        <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">Recent projects</h2>
        {projects.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5 text-muted" />
          </div>
        ) : !projects.data?.length ? (
          <EmptyState
            icon={<FolderOpen className="h-8 w-8" />}
            title="No analyses yet"
            hint="Create a project and upload a video to get started."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Analyze your first video
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.data.map((p) => (
              <div
                key={p.id}
                className="group cursor-pointer rounded-xl border border-line bg-surface p-4 transition-shadow hover:shadow-card"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    {p.description && (
                      <p className="mt-0.5 truncate text-sm text-muted">{p.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${p.name}"?`)) removeProject.mutate(p.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Badge variant="outline">{p.video_count ?? 0} videos</Badge>
                  <Badge variant="outline">{p.event_count ?? 0} events</Badge>
                  <span className="ml-auto">{relativeTime(p.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <Analytics />
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New project">
        <div className="space-y-3">
          <Input
            placeholder="Project name (e.g. Campus Entrance Analysis)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <Textarea
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <Button
            className="w-full"
            disabled={!name.trim() || createProject.isPending}
            onClick={() => createProject.mutate()}
          >
            {createProject.isPending ? "Creating…" : "Create project"}
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}
