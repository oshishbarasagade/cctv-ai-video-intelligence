import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutGrid, Radio, MonitorPlay, Plus, Search, Command as CmdIcon,
} from "lucide-react";

interface Cmd {
  label: string;
  icon: any;
  run: () => void;
  keywords?: string;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands: Cmd[] = [
    { label: "Go to Dashboard", icon: LayoutGrid, run: () => navigate("/dashboard") },
    { label: "New project", icon: Plus, run: () => navigate("/dashboard"), keywords: "create analysis" },
    { label: "Open Subli Live", icon: Radio, run: () => navigate("/live"), keywords: "webcam camera" },
    { label: "Open Command Center", icon: MonitorPlay, run: () => navigate("/command-center"), keywords: "cameras" },
  ];

  const filtered = commands.filter(
    (c) =>
      !q ||
      c.label.toLowerCase().includes(q.toLowerCase()) ||
      c.keywords?.includes(q.toLowerCase())
  );

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="animate-fade-in relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">ESC</kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto p-2">
          {filtered.map((c) => (
            <li key={c.label}>
              <button
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg"
                onClick={() => {
                  c.run();
                  setOpen(false);
                  setQ("");
                }}
              >
                <c.icon className="h-4 w-4 text-muted" />
                {c.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">No commands found.</li>
          )}
        </ul>
        <div className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-xs text-muted">
          <CmdIcon className="h-3 w-3" /> Command Palette · ⌘K
        </div>
      </div>
    </div>
  );
}
