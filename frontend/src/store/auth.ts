import { create } from "zustand";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  signup: (full_name: string, email: string, password: string) => Promise<User>;
  applyToken: (token?: string) => Promise<User>;
  completeOnboarding: (data: {
    full_name?: string;
    use_case?: string;
    experience?: string;
  }) => Promise<void>;
  logout: () => void;
}

const TOKEN_KEY = "subli_token";
function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// Build our User object from a Supabase session (profile fields live in user_metadata,
// so authentication needs no backend — it talks straight to Supabase Auth).
function userFromSupabase(u: any): User {
  const m = (u && u.user_metadata) || {};
  return {
    id: u.id,
    email: u.email,
    full_name: m.full_name,
    use_case: m.use_case,
    experience: m.experience,
    onboarding_completed: m.onboarding_completed ?? false,
  };
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  init: async () => {
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setToken(data.session.access_token);
          set({ user: userFromSupabase(data.session.user), loading: false });
          return;
        }
      } catch {
        /* ignore */
      }
      setToken(null);
      set({ user: null, loading: false });
      return;
    }
    // Fallback: backend-issued token (fully offline, no Supabase configured).
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const { data } = await api.get<User>("/auth/me");
      set({ user: data, loading: false });
    } catch {
      setToken(null);
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      setToken(data.session!.access_token);
      const user = userFromSupabase(data.session!.user);
      set({ user });
      return user;
    }
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    set({ user: data.user });
    return data.user;
  },

  signup: async (full_name, email, password) => {
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name, onboarding_completed: false } },
      });
      if (error) throw new Error(error.message);
      if (!data.session) {
        // Email confirmation is enabled on the Supabase project.
        throw new Error(
          "Account created — please check your email to confirm, then sign in."
        );
      }
      setToken(data.session.access_token);
      const user = userFromSupabase(data.session.user);
      set({ user });
      return user;
    }
    const { data } = await api.post("/auth/signup", { full_name, email, password });
    setToken(data.token);
    set({ user: data.user });
    return data.user;
  },

  applyToken: async () => {
    // After Google OAuth, Supabase JS has already stored the session.
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("No session returned.");
      setToken(data.session.access_token);
      const user = userFromSupabase(data.session.user);
      set({ user, loading: false });
      return user;
    }
    throw new Error("Supabase is not configured.");
  },

  completeOnboarding: async (payload) => {
    if (supabase) {
      const { data, error } = await supabase.auth.updateUser({
        data: { ...payload, onboarding_completed: true },
      });
      if (error) throw new Error(error.message);
      set({ user: userFromSupabase(data.user) });
      // Best-effort: sync to the backend profile too (if it is reachable).
      try {
        await api.post("/auth/onboarding", { ...payload, completed: true });
      } catch {
        /* backend offline — metadata is the source of truth */
      }
      return;
    }
    const { data } = await api.post("/auth/onboarding", { ...payload, completed: true });
    set({ user: data });
  },

  logout: () => {
    if (supabase) void supabase.auth.signOut().catch(() => {});
    setToken(null);
    set({ user: null });
    void get;
  },
}));
