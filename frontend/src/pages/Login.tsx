import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Video, Sparkles } from "lucide-react";
import { useAuth } from "@/store/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";

export function Login() {
  const { login, signup, completeOnboarding } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const tryDemo = async () => {
    setError("");
    setDemoBusy(true);
    try {
      // Spin up a throwaway account and seed a ready analysis (spec §57).
      await signup("Demo User", `demo_${Date.now()}@subli.ai`, "demo123456");
      await completeOnboarding({ full_name: "Demo User", use_case: "video" });
      const { data } = await api.post("/demo/seed");
      navigate(`/analysis/${data.video_id}`);
    } catch (err) {
      setError((err as Error).message);
      setDemoBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user =
        mode === "login"
          ? await login(email, password)
          : await signup(name, email, password);
      navigate(user.onboarding_completed ? "/dashboard" : "/onboarding");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-white">
            <Video className="h-4 w-4" />
          </div>
          <span className="text-xl font-bold tracking-tight">Subli</span>
        </Link>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <h1 className="text-xl font-semibold">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login"
              ? "Sign in to continue to Subli."
              : "Start analyzing video in seconds."}
          </p>

          <div className="mt-4 rounded-lg bg-bg px-3 py-2 text-xs text-muted">
            Secure sign-in powered by Supabase. New here? Use “Create one” below.
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === "signup" && (
              <Input
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Spinner />}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="outline" className="w-full" onClick={tryDemo} disabled={demoBusy}>
            {demoBusy ? <><Spinner /> Preparing demo…</> : <><Sparkles className="h-4 w-4" /> Try a live demo</>}
          </Button>

          <p className="mt-4 text-center text-sm text-muted">
            {mode === "login" ? "No account? " : "Already have an account? "}
            <button
              className="font-medium text-ink hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
