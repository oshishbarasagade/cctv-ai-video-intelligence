import { Link } from "react-router-dom";
import {
  Video,
  Search,
  MessageSquare,
  GitBranch,
  Clock,
  ScanEye,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: ScanEye, title: "Visual understanding", desc: "Objects, people, and text detected frame by frame." },
  { icon: Clock, title: "Temporal memory", desc: "A running state of the scene — what changed, and when." },
  { icon: GitBranch, title: "Event graph", desc: "How events relate and lead into one another over time." },
  { icon: Search, title: "Semantic search", desc: '"person near entrance" jumps straight to the moment.' },
  { icon: MessageSquare, title: "Ask Subli", desc: "Question the footage; answers cite real timestamps." },
  { icon: Video, title: "Smart subtitles", desc: "Context-aware captions for silent video." },
];

export function Landing() {
  return (
    <div className="min-h-screen">
      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-white">
            <Video className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold tracking-tight">Subli</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link to="/login">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-6 pb-8 pt-12 text-center md:pt-20">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          AI Video Intelligence Platform
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
          See what your videos say.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          AI-powered visual intelligence for understanding, searching, and
          analyzing silent video and CCTV footage.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/login">
            <Button size="lg">
              Analyze a video <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline">Try demo</Button>
          </Link>
        </div>
      </section>

      {/* product mock */}
      <section className="mx-auto max-w-5xl px-6">
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="ml-3 text-xs text-muted">subli · Campus Entrance Analysis</span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-[1.6fr_1fr]">
            <div className="flex aspect-video items-center justify-center rounded-lg bg-ink/95 text-white">
              <div className="text-center">
                <ScanEye className="mx-auto h-10 w-10 opacity-70" />
                <p className="mt-2 text-sm opacity-70">AI vision · 3 objects · 2 people</p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                ["00:12", "Person enters the entrance area"],
                ["00:31", "Vehicle detected"],
                ["00:47", "Door opens"],
                ["01:05", "Multiple people present"],
              ].map(([t, d]) => (
                <div key={t} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                  <span className="font-mono text-xs text-accent">{t}</span>
                  <span className="text-sm">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-line bg-surface p-5">
              <f.icon className="h-5 w-5" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-sm text-muted">
        Subli · AI Video Intelligence Platform
      </footer>
    </div>
  );
}
