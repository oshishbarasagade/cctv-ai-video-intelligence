import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Video, Search, MessageSquare, GitBranch, Clock, ScanEye, ArrowRight,
  Boxes, Users, Type, Sparkles, Flag, FileText, Radio, Check, ShieldCheck,
  Play, Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Scroll-reveal hook: adds `is-visible` when the element enters view. */
/* ------------------------------------------------------------------ */
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/* Wrapper that fades + slides its children in on scroll. */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* Count-up number that runs once when scrolled into view. */
function CountUp({ to, suffix = "", duration = 1400 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(Math.round(to * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);
  return (
    <span ref={ref}>
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Data                                                               */
/* ------------------------------------------------------------------ */
const capabilities = [
  { icon: ScanEye, title: "Visual understanding", desc: "YOLOv8 detects objects, people and vehicles; BLIP describes every scene in natural language." },
  { icon: Clock, title: "Temporal memory", desc: "A running state of the scene — what changed, who appeared, and exactly when." },
  { icon: GitBranch, title: "Event graph", desc: "How detected events relate and lead into one another across the timeline." },
  { icon: Search, title: "Semantic search", desc: '"person near entrance" jumps straight to the moment — real vector embeddings.' },
  { icon: MessageSquare, title: "Ask Subli", desc: "Question the footage. Claude answers from real data, citing exact timestamps." },
  { icon: Video, title: "Smart subtitles", desc: "Context-aware .srt / .vtt captions that give silent surveillance a voice." },
];

const steps = [
  { n: "01", title: "Upload", desc: "Drop any CCTV or silent video. Keyframes and metadata are extracted automatically." },
  { n: "02", title: "Analyze", desc: "YOLO + BLIP + OCR run on every frame; events, tracks and memory are built." },
  { n: "03", title: "Understand", desc: "Search, ask, explain and export — all grounded in real detections." },
];

const chips = [
  { icon: Boxes, label: "Object detection" },
  { icon: Users, label: "Anonymous tracking" },
  { icon: Type, label: "OCR text" },
  { icon: Sparkles, label: "AI highlights" },
  { icon: Flag, label: "Evidence board" },
  { icon: FileText, label: "PDF reports" },
  { icon: Radio, label: "Live camera" },
  { icon: GitBranch, label: "Trajectory paths" },
];

const marquee = ["YOLOv8", "BLIP", "Claude", "Supabase", "FastAPI", "React", "pgvector", "EasyOCR", "MiniLM"];

const feed: [string, string, string][] = [
  ["00:12", "Person enters the entrance area", "#34d399"],
  ["00:31", "Vehicle detected in parking", "#fb7185"],
  ["00:47", "Multiple people present (5)", "#f43f5e"],
  ["01:05", 'Text detected: "EXIT"', "#fbbf24"],
];

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */
export function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0a0608] text-white antialiased [font-feature-settings:'cv02','cv03','cv11']">
      {/* ================= NAV ================= */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0608]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2">
            <img src="/brand-logo.png" alt="Subli" className="h-8 w-8 drop-shadow-[0_0_12px_rgba(225,29,72,0.6)]" />
            <span className="text-lg font-bold tracking-tight">Subli</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm text-white/60 md:flex">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#trust" className="transition hover:text-white">Privacy</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 transition hover:text-white"
            >
              Sign in
            </Link>
            <Link
              to="/login"
              className="rounded-lg bg-[#E11D48] px-3.5 py-1.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(225,29,72,0.45)] transition hover:bg-[#be123c]"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="relative isolate overflow-hidden px-6 pb-16 pt-20 md:pb-24 md:pt-28">
        {/* aurora background */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-12%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-[#E11D48]/25 blur-[120px] animate-aurora" />
          <div className="absolute left-[12%] top-[18%] h-[26rem] w-[26rem] rounded-full bg-[#fb7185]/20 blur-[110px] animate-aurora" style={{ animationDelay: "-6s" }} />
          <div className="absolute right-[10%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-[#9f1239]/30 blur-[120px] animate-aurora" style={{ animationDelay: "-11s" }} />
          {/* grid */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(ellipse 70% 55% at 50% 30%, #000 60%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 30%, #000 60%, transparent 100%)",
            }}
          />
        </div>

        <div className="mx-auto max-w-4xl text-center">
          <div className="animate-fade-in mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/70 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            AI Video Intelligence Platform
          </div>

          <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight md:text-7xl">
            See what your{" "}
            <span className="text-shimmer bg-gradient-to-r from-[#fda4af] via-[#f43f5e] to-[#E11D48]">
              videos say.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">
            Turn silent CCTV footage into structured, searchable, time-aware
            intelligence — powered by real computer vision and grounded AI.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#f43f5e] px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_30px_rgba(225,29,72,0.45)] transition hover:shadow-[0_8px_44px_rgba(225,29,72,0.7)]"
            >
              Analyze a video
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10"
            >
              <Play className="h-4 w-4" /> Try the demo
            </Link>
          </div>
          <p className="mt-5 text-xs text-white/40">
            No credit card · Powered by YOLOv8 · BLIP · Claude · Supabase
          </p>
        </div>

        {/* ---------- product preview ---------- */}
        <Reveal delay={120} className="mx-auto mt-16 max-w-5xl">
          <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
            {/* glow under card */}
            <div aria-hidden className="pointer-events-none absolute -inset-x-16 -bottom-10 top-1/2 -z-10 rounded-full bg-[#E11D48]/20 blur-3xl" />
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0709]">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="ml-3 text-xs text-white/40">subli · Warehouse Entrance · live analysis</span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#E11D48]/15 px-2 py-0.5 text-xs font-medium text-[#fb7185]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#fb7185]" /> LIVE
                </span>
              </div>

              <div className="grid gap-4 p-4 md:grid-cols-[1.7fr_1fr] md:p-5">
                {/* fake CCTV frame */}
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <div className="aspect-video w-full bg-[radial-gradient(circle_at_30%_20%,#241216,#070406)]" />
                  {/* scanning line */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-16 animate-scan bg-gradient-to-b from-[#fb7185]/0 via-[#fb7185]/25 to-[#fb7185]/0" />
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 180" preserveAspectRatio="none">
                    {/* trajectory path draws itself */}
                    <path
                      d="M60 150 Q120 120 170 130 T248 110"
                      fill="none"
                      stroke="#fb7185"
                      strokeWidth="2"
                      strokeDasharray="260"
                      strokeDashoffset="260"
                      style={{ animation: "draw 2.4s ease-out 0.6s forwards" }}
                      opacity="0.9"
                    />
                    <circle cx="248" cy="110" r="3.5" fill="#fb7185">
                      <animate attributeName="opacity" values="0;1" dur="0.4s" begin="2.8s" fill="freeze" />
                    </circle>
                    {/* person box */}
                    <g className="animate-box" style={{ transformOrigin: "231px 110px" }}>
                      <rect x="214" y="70" width="34" height="78" fill="none" stroke="#34d399" strokeWidth="2" />
                      <rect x="214" y="61" width="62" height="9" fill="#34d399" />
                      <text x="217" y="68" fontSize="7" fill="#04120c" fontFamily="monospace">Person #1 · 94%</text>
                    </g>
                    {/* bag box */}
                    <g className="animate-box" style={{ transformOrigin: "135px 116px", animationDelay: "0.25s" }}>
                      <rect x="120" y="104" width="30" height="24" fill="none" stroke="#fbbf24" strokeWidth="2" />
                      <rect x="120" y="96" width="40" height="8" fill="#fbbf24" />
                      <text x="123" y="102.5" fontSize="6.5" fill="#1a1203" fontFamily="monospace">bag · 72%</text>
                    </g>
                  </svg>
                  <div className="absolute left-3 top-3 flex gap-2">
                    <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur">2024-10-01 14:35</span>
                    <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur">YOLOv8 · 18 FPS</span>
                  </div>
                  <div className="absolute bottom-3 left-3 text-xs text-white/60">
                    <span className="font-mono text-white">4 people</span> · 1 bag · 1 path tracked
                  </div>
                </div>

                {/* event feed */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-white/40">AI EVENT TIMELINE</p>
                  {feed.map(([t, d, c], i) => (
                    <div
                      key={t}
                      className="animate-fade-in flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                      style={{ animationDelay: `${0.5 + i * 0.25}s`, animationFillMode: "both" }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                      <span className="font-mono text-xs" style={{ color: c }}>{t}</span>
                      <span className="truncate text-sm text-white/80">{d}</span>
                    </div>
                  ))}
                  <div
                    className="animate-fade-in rounded-lg border border-white/10 bg-gradient-to-br from-[#E11D48]/12 to-transparent p-3"
                    style={{ animationDelay: "1.6s", animationFillMode: "both" }}
                  >
                    <p className="flex items-center gap-1.5 text-xs font-medium text-white/80">
                      <MessageSquare className="h-3.5 w-3.5 text-[#fb7185]" /> Ask Subli
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      "A person entered at 00:12 and moved toward the entrance by 00:19."{" "}
                      <span className="text-[#fb7185]">[00:12] [00:19]</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= MARQUEE ================= */}
      <section className="border-y border-white/10 bg-white/[0.02] py-5">
        <div className="relative mx-auto flex max-w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]">
          <div className="flex shrink-0 animate-marquee items-center gap-12 pr-12">
            {[...marquee, ...marquee].map((m, i) => (
              <span key={i} className="whitespace-nowrap text-sm font-semibold tracking-wide text-white/35">
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ================= STATS ================= */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {[
            { v: 381, s: "", label: "detections / clip" },
            { v: 9, s: "", label: "pipeline stages" },
            { v: 384, s: "-d", label: "search embeddings" },
            { v: 100, s: "%", label: "answers cite a source" },
          ].map((st, i) => (
            <Reveal key={st.label} delay={i * 90}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                <div className="bg-gradient-to-r from-[#fb7185] to-[#E11D48] bg-clip-text text-3xl font-extrabold text-transparent md:text-4xl">
                  <CountUp to={st.v} suffix={st.s} />
                </div>
                <p className="mt-1 text-xs text-white/50">{st.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= CHIPS ================= */}
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {chips.map((d, i) => (
            <Reveal key={d.label} delay={i * 60}>
              <div className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-[#E11D48]/40 hover:bg-[#E11D48]/[0.06]">
                <d.icon className="h-4 w-4 text-[#fb7185] transition group-hover:scale-110" />
                <span className="text-sm font-medium text-white/80">{d.label}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#fb7185]">Capabilities</p>
          <h2 className="mt-3 text-center text-4xl font-bold tracking-tight">Built deeply, not broadly</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-white/55">
            Every differentiator below is grounded in real analysis data — no smoke, no mirrors.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 100}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#E11D48]/30">
                {/* hover glow */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#E11D48]/0 blur-2xl transition-all duration-500 group-hover:bg-[#E11D48]/25"
                />
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-[#E11D48]/20 to-transparent text-[#fb7185]">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm text-white/55">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how" className="relative border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#fb7185]">How it works</p>
            <h2 className="mt-3 text-center text-4xl font-bold tracking-tight">Footage to understanding in three steps</h2>
          </Reveal>
          <div className="relative mt-14 grid gap-6 md:grid-cols-3">
            {/* connecting line */}
            <div aria-hidden className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-[#E11D48]/30 to-transparent md:block" />
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 130} className="relative">
                <div className="rounded-2xl border border-white/10 bg-[#0c0709] p-7">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-[#E11D48]/35 to-[#f43f5e]/20 font-mono text-sm font-bold text-white">
                    {s.n}
                  </div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-white/55">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= TRUST ================= */}
      <section id="trust" className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-8 md:p-10">
            <div aria-hidden className="pointer-events-none absolute right-6 top-6 opacity-20">
              <ShieldCheck className="h-24 w-24 text-emerald-300 animate-glow" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Private by design</p>
            <h2 className="mt-3 max-w-lg text-3xl font-bold tracking-tight">Trust comes standard, not as an add-on</h2>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              {[
                "Anonymous tracking only — no facial recognition or identity inference.",
                "Every AI claim cites a real, clickable source timestamp.",
                "Private storage with signed URLs; raw video deletable after analysis.",
              ].map((t) => (
                <div key={t} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-sm text-white/75">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#E11D48]/30 via-[#0c0709] to-[#9f1239]/25 px-8 py-16 text-center">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-[#E11D48]/30 blur-3xl animate-glow" />
            <Zap className="mx-auto h-8 w-8 text-[#fb7185] animate-float" />
            <h2 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
              Start seeing what your videos say.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-white/60">
              Upload a clip and watch real detections, events and answers appear in seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/login"
                className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#0a0608] transition hover:bg-white/90"
              >
                Analyze a video
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <Play className="h-4 w-4" /> Try the demo
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-sm text-white/45">
          <div className="flex items-center gap-2">
            <img src="/brand-logo.png" alt="Subli" className="h-6 w-6" />
            Subli · AI Video Intelligence Platform
          </div>
          <span className="text-white/35">YOLOv8 · BLIP · Claude · Supabase</span>
        </div>
      </footer>
    </div>
  );
}
