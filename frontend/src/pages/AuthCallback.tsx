import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";
import { Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

// Handles the OAuth redirect: Supabase JS parses the session from the URL, then
// we hand the access token to our backend-based auth store (spec §7).
export function AuthCallback() {
  const navigate = useNavigate();
  const applyToken = useAuth((s) => s.applyToken);
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      if (!supabase) {
        setError("Supabase is not configured.");
        return;
      }
      try {
        // detectSessionInUrl (default) has already stored the session.
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = data.session?.access_token;
        if (!token) throw new Error("No session returned from Google.");
        const user = await applyToken(token);
        navigate(user.onboarding_completed ? "/dashboard" : "/onboarding", { replace: true });
      } catch (e) {
        setError((e as Error).message || "Authentication failed.");
      }
    })();
  }, [applyToken, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      {error ? (
        <>
          <p className="text-danger">{error}</p>
          <Button variant="outline" onClick={() => navigate("/login", { replace: true })}>
            Back to sign in
          </Button>
        </>
      ) : (
        <>
          <Spinner className="h-6 w-6 text-muted" />
          <p className="text-sm text-muted">Signing you in…</p>
        </>
      )}
    </div>
  );
}
