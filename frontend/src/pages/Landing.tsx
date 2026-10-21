import { Link } from "react-router-dom";
import {
  Video, Search, MessageSquare, GitBranch, Clock, ScanEye, ArrowRight,
  Boxes, Users, Type, Sparkles, Flag, FileText, Radio, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const capabilities = [
  { icon: ScanEye, title: "Visual understanding", desc: "YOLOv8 detects objects, people, and vehicles; BLIP describes every scene." },
  { icon: Clock, title: "Temporal memory", desc: "A running state of the scene — what changed, who appeared, and exactly when." },
  { icon: GitBranch, title: "Event graph", desc: "How detected events relate and lead into one another over time." },
  { icon: Search, title: "Semantic search", desc: '"person near entrance" jumps straight to the moment — real embeddings.' },
  { icon: MessageSquare, title: "Ask Subli", desc: "Question the footage. Claude answers from real data, citing timestamps." },
  { icon: Video, title: "Smart subtitles", desc: "Context-aware .srt / .vtt captions for silent surveillance video." },
];

const steps = [
  { n: "01", title: "Upload", desc: "Drop any CCTV or silent video. We extract keyframes and metadata." },
  { n: "02", title: "Analyze", desc: "YOLO + BLIP + OCR run on every frame; events and memory are built." },
  { n: "03", title: "Understand", desc: "Search, ask, explain, and export — all grounded in real detections." },
];

const detail = [
  { icon: Boxes, label: "Object detection" },
  { icon: Users, label: "Anonymous tracking" },
  { icon: Type, label: "OCR text" },
  { icon: Sparkles, label: "AI highlights" },
  { icon: Flag, label: "Evidence board" },
  { icon: FileText, label: "PDF reports" },
  { icon: Radio, label: "Live camera" },
  { icon: GitBranch, label: "Trajectory paths" },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-bg">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-white">
              <Video className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight">Subli</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/login"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-16 text-center md:pt-24">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          AI Video Intelligence Platform
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-[1.03] tracking-tight md:text-7xl">
          See what your<br className="hidden md:block" /> videos say.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          Turn silent CCTV footage into structured, searchable, time-aware
          intelligence — powered by real computer vision and grounded AI.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/login">
            <Button size="lg">Analyze a video <ArrowRight className="h-4 w-4" /></Button>
          </Link>
          <Link to="/login"><Button size="lg" variant="outline">Try the demo</Button></Link>
        </div>
        <p className="mt-5 text-xs text-muted">
          No credit card · Powered by YOLOv8 · BLIP · Claude · Supabase
        </p>
      </section>

      {/* product preview */}
      <section className="mx-auto max-w-5xl px-6">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="ml-3 text-xs text-muted">subli · Warehouse Entrance · live analysis</span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> LIVE
            </span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-[1.7fr_1fr]">
            {/* fake CCTV frame with detection boxes */}
            <div className="relative overflow-hidden rounded-xl bg-ink">
              <div className="aspect-video w-full bg-[radial-gradient(circle_at_30%_20%,#2b2b2b,#0b0b0b)]" />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 180" preserveAspectRatio="none">
                {/* person box */}
                <g>
                  <rect x="214" y="70" width="34" height="78" fill="none" stroke="#22c55e" strokeWidth="2" />
                  <rect x="214" y="61" width="60" height="9" fill="#22c55e" />
                  <text x="217" y="68" fontSize="7" fill="#fff" fontFamily="monospace">Person #1 · 94%</text>
                </g>
                {/* bag box */}
                <g>
                  <rect x="120" y="104" width="30" height="24" fill="none" stroke="#f59e0b" strokeWidth="2" />
                  <rect x="120" y="96" width="38" height="8" fill="#f59e0b" />
                  <text x="123" y="102.5" fontSize="6.5" fill="#fff" fontFamily="monospace">bag · 72%</text>
                </g>
                {/* path */}
                <path d="M60 150 Q120 120 170 130 T248 110" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="3 3" opacity="0.8" />
                <circle cx="248" cy="110" r="3.5" fill="#3b82f6" />
              </svg>
              <div className="absolute left-3 top-3 flex gap-2">
                <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">2024-10-01 14:35</span>
                <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">YOLOv8 · 18 FPS</span>
              </div>
              <div className="absolute bottom-3 left-3 text-xs text-white/70">
                <span className="font-mono text-white">4 people</span> · 1 bag · 1 path tracked
              </div>
            </div>
            {/* event feed */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted">AI EVENT TIMELINE</p>
              {[
                ["00:12", "Person enters the entrance area", "#2563EB"],
                ["00:31", "Vehicle detected in parking", "#16A34A"],
                ["00:47", "Multiple people present (5)", "#2563EB"],
                ["01:05", "Text detected: \"EXIT\"", "#F59E0B"],
              ].map(([t, d, c]) => (
                <div key={t} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c as string }} />
                  <span className="font-mono text-xs text-accent">{t}</span>
                  <span className="truncate text-sm">{d}</span>
                </div>
              ))}
              <div className="rounded-lg border border-line bg-bg p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium"><MessageSquare className="h-3.5 w-3.5" /> Ask Subli</p>
                <p className="mt-1 text-xs text-muted">"A person entered at 00:12 and moved toward the entrance by 00:19." <span className="text-accent">[00:12] [00:19]</span></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* capability chips */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {detail.map((d) => (
            <div key={d.label} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3">
              <d.icon className="h-4 w-4 text-ink" />
              <span className="text-sm font-medium">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-accent">How it works</p>
          <h2 className="mt-2 text-center text-3xl font-bold tracking-tight">From footage to understanding in three steps</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="rounded-xl border border-line bg-bg p-6">
                <span className="font-mono text-sm text-muted">{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* capabilities grid */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">Built deeply, not broadly</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-muted">Eight core differentiators, every one grounded in real analysis data.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((f) => (
            <div key={f.title} className="group rounded-xl border border-line bg-surface p-6 transition-shadow hover:shadow-card">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* privacy / trust */}
      <section className="mx-auto max-w-5xl px-6 pb-10">
        <div className="grid gap-4 rounded-2xl border border-line bg-surface p-8 sm:grid-cols-3">
          {[
            "Anonymous tracking only — no facial recognition",
            "Every AI claim cites a real source timestamp",
            "Private storage; raw video deletable after analysis",
          ].map((t) => (
            <div key={t} className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              <span className="text-sm">{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="overflow-hidden rounded-2xl bg-ink px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Start seeing what your videos say.</h2>
          <p className="mx-auto mt-3 max-w-md text-white/70">Upload a clip and watch real detections, events, and answers appear in seconds.</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login">
              <Button size="lg" className="bg-white text-ink hover:bg-white/90">
                Analyze a video <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="ghost" className="text-white hover:bg-white/10">Try the demo</Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4" /> Subli · AI Video Intelligence Platform
          </div>
          <span>YOLOv8 · BLIP · Claude · Supabase</span>
        </div>
      </footer>
    </div>
  );
}
