import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Video, Wifi, WifiOff } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

interface Camera {
  id: string;
  name: string;
  location?: string;
  status: string;
}

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
    mutationFn: async () =>
      api.post("/live/cameras", { name, location, status: "offline" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cameras"] });
      setOpen(false);
      setName("");
      setLocation("");
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <PageHeader
          title="Command Center"
          subtitle="Monitor every camera source in one place."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Add camera
            </Button>
          }
        />

        {cameras.data && cameras.data.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cameras.data.map((c) => {
              const live = c.status === "live";
              return (
                <div key={c.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="relative flex aspect-video items-center justify-center bg-ink/95">
                    <Video className="h-8 w-8 text-white/30" />
                    <div className="absolute left-2 top-2">
                      <Badge variant={live ? "danger" : "outline"}>
                        {live ? (
                          <>
                            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
                            LIVE
                          </>
                        ) : (
                          "OFFLINE"
                        )}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted">{c.location || "—"}</p>
                    </div>
                    {live ? (
                      <Wifi className="h-4 w-4 text-ok" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-muted" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              icon={<Video className="h-8 w-8" />}
              title="No cameras yet"
              hint="Add a camera source to monitor it here. RTSP/IP ingestion is handled server-side."
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" /> Add your first camera
                </Button>
              }
            />
          </div>
        )}

        <p className={cn("mt-4 text-xs text-muted")}>
          Note: live RTSP/IP camera ingestion runs on the backend (FFmpeg/WebRTC);
          credentials never reach the browser.
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
