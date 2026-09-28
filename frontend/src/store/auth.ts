import { create } from "zustand";
import { api } from "@/lib/api";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  signup: (full_name: string, email: string, password: string) => Promise<User>;
  applyToken: (token: string) => Promise<User>;
  completeOnboarding: (data: {
    full_name?: string;
    use_case?: string;
    experience?: string;
  }) => Promise<void>;
  logout: () => void;
}

function setToken(token: string) {
  localStorage.setItem("subli_token", token);
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  init: async () => {
    const token = localStorage.getItem("subli_token");
    if (!token) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const { data } = await api.get<User>("/auth/me");
      set({ user: data, loading: false });
    } catch {
      localStorage.removeItem("subli_token");
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    set({ user: data.user });
    return data.user;
  },

  signup: async (full_name, email, password) => {
    const { data } = await api.post("/auth/signup", {
      full_name,
      email,
      password,
    });
    setToken(data.token);
    set({ user: data.user });
    return data.user;
  },

  applyToken: async (token) => {
    // Used after Google OAuth: store the Supabase access token and load the
    // profile through our backend (which verifies the token with Supabase).
    setToken(token);
    const { data } = await api.get<User>("/auth/me");
    set({ user: data, loading: false });
    return data;
  },

  completeOnboarding: async (payload) => {
    const { data } = await api.post("/auth/onboarding", {
      ...payload,
      completed: true,
    });
    set({ user: data });
  },

  logout: () => {
    localStorage.removeItem("subli_token");
    set({ user: null });
    void get; // keep signature stable
  },
}));
