import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, FlaskConical, Accessibility, Video, GraduationCap, MoreHorizontal, Check } from "lucide-react";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const useCases = [
  { id: "security", label: "Security", icon: Shield },
  { id: "research", label: "Research", icon: FlaskConical },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
  { id: "video", label: "Video Analysis", icon: Video },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "other", label: "Other", icon: MoreHorizontal },
];
const levels = ["Beginner", "Intermediate", "Advanced"];

export function Onboarding() {
  const { user, completeOnboarding } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.full_name || "");
  const [useCase, setUseCase] = useState("");
  const [experience, setExperience] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      await completeOnboarding({
        full_name: name,
        use_case: useCase,
        experience: experience.toLowerCase(),
      });
      navigate("/dashboard");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-10 rounded-full",
                i <= step ? "bg-ink" : "bg-line"
              )}
            />
          ))}
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
          {step === 0 && (
            <>
              <h1 className="text-xl font-semibold">Welcome to Subli</h1>
              <p className="mt-1 text-sm text-muted">Let's set up your workspace.</p>
              <label className="mt-5 block text-sm font-medium">Your name</label>
              <Input
                className="mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={finish}>Skip</Button>
                <Button onClick={() => setStep(1)} disabled={!name.trim()}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-xl font-semibold">What will you use Subli for?</h1>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {useCases.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setUseCase(u.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors",
                      useCase === u.id
                        ? "border-ink bg-ink text-white"
                        : "border-line hover:bg-bg"
                    )}
                  >
                    <u.icon className="h-5 w-5" />
                    {u.label}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                <Button onClick={() => setStep(2)} disabled={!useCase}>Continue</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-xl font-semibold">Your experience level</h1>
              <div className="mt-4 space-y-2">
                {levels.map((l) => (
                  <button
                    key={l}
                    onClick={() => setExperience(l)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border p-3 text-sm transition-colors",
                      experience === l
                        ? "border-ink bg-ink text-white"
                        : "border-line hover:bg-bg"
                    )}
                  >
                    {l}
                    {experience === l && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={finish} disabled={!experience || busy}>
                  {busy ? "Setting up…" : "Complete setup"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
