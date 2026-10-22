import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitCompareArrows, ArrowLeftRight } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Spinner, EmptyState } from "@/components/ui/misc";
import { formatTime } from "@/lib/utils";

export function Compare() {
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects")).data.projects as any[],
  });

  // gather all videos across projects
  const videosQ = useQuery({
    queryKey: ["all-videos", projects.data?.length],
    enabled: !!projects.data,
    queryFn: async () => {
      const all: { id: string; name: string }[] = [];
      for (const p of projects.data!) {
        const full = (await api.get(`/projects/${p.id}`)).data;
        for (const v of full.videos || []) all.push({ id: v.id, name: v.original_name || v.id });
      }
      return all;
    },
  });

  const videos = videosQ.data ?? [];
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const cmp = useQuery({
    queryKey: ["compare", a, b],
    enabled: !!a && !!b && a !== b,
    queryFn: async () => (await api.get(`/analysis/compare`, { params: { a, b } })).data,
  });

  const rows = useMemo(() => {
    if (!cmp.data) return [];
    const d = cmp.data.diffs;
    return [
      ["Duration", formatTime(cmp.data.a.duration || 0), formatTime(cmp.data.b.duration || 0)],
      ["People", d.people.a, d.people.b],
      ["Events", d.events.a, d.events.b],
      ["Objects", d.objects.a, d.objects.b],
      ["Text (OCR)", d.ocr.a, d.ocr.b],
    ];
  }, [cmp.data]);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <PageHeader title="Video Comparison" subtitle="Compare two analyzed videos side by side." />

        {videosQ.isLoading ? (
          <div className="mt-6 flex justify-center"><Spinner className="h-5 w-5 text-muted" /></div>
        ) : videos.length < 2 ? (
          <div className="mt-6"><EmptyState title="Need at least two analyzed videos" hint="Analyze more videos to compare them." /></div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <select value={a} onChange={(e) => setA(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <option value="">Select video A…</option>
                {videos.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <ArrowLeftRight className="h-4 w-4 text-muted" />
              <select value={b} onChange={(e) => setB(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <option value="">Select video B…</option>
                {videos.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>

            {a && b && a === b && <p className="mt-3 text-sm text-danger">Pick two different videos.</p>}

            {cmp.isFetching && <div className="mt-6 flex justify-center"><Spinner className="h-5 w-5 text-muted" /></div>}

            {cmp.data && (
              <div className="mt-6 space-y-5">
                <div className="overflow-hidden rounded-xl border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-bg text-muted">
                      <tr><th className="p-3 text-left font-medium">Metric</th>
                        <th className="p-3 text-left font-medium">{cmp.data.a.name}</th>
                        <th className="p-3 text-left font-medium">{cmp.data.b.name}</th></tr>
                    </thead>
                    <tbody>
                      {rows.map(([k, va, vb], i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="p-3 text-muted">{k}</td>
                          <td className="p-3 font-medium tabular-nums">{va as any}</td>
                          <td className="p-3 font-medium tabular-nums">{vb as any}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><GitCompareArrows className="h-4 w-4" /> Object differences</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {cmp.data.object_diff.map((o: any) => (
                      <div key={o.type} className="flex items-center justify-between rounded-lg border border-line p-2.5 text-sm">
                        <span className="capitalize">{o.type}</span>
                        <span className="font-mono tabular-nums text-muted">{o.a} → {o.b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
