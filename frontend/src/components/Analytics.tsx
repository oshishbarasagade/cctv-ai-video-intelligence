import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, AreaChart, Area,
} from "recharts";
import { api } from "@/lib/api";

interface Analytics {
  event_distribution: { name: string; value: number }[];
  object_distribution: { name: string; value: number }[];
  activity: { bucket: number; events: number }[];
}

// Brand-neutral, colorblind-safe categorical palette.
const COLORS = ["#111111", "#2563EB", "#16A34A", "#F59E0B", "#DC2626", "#6B7280", "#7C3AED"];

export function Analytics() {
  const q = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => (await api.get<Analytics>("/dashboard/analytics")).data,
  });

  const hasData =
    q.data && (q.data.event_distribution.length || q.data.object_distribution.length);
  if (!hasData) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-muted">Analytics</h2>
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Activity over time">
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={q.data!.activity}>
              <defs>
                <linearGradient id="act" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="bucket" hide />
              <YAxis hide allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="events" stroke="#2563EB" fill="url(#act)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Event distribution">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={q.data!.event_distribution} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#111111" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Object distribution">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={q.data!.object_distribution}
                dataKey="value"
                nameKey="name"
                innerRadius={38}
                outerRadius={62}
                paddingAngle={2}
              >
                {q.data!.object_distribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-2 text-xs font-medium text-muted">{title}</p>
      {children}
    </div>
  );
}
