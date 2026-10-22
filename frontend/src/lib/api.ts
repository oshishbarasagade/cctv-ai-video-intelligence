import axios from "axios";
import { supabase } from "./supabase";

const baseURL = import.meta.env.VITE_API_BASE || "/api";

export const api = axios.create({ baseURL });

// Attach the bearer token on every request. When Supabase is configured we use
// its (auto-refreshed) access token; otherwise fall back to the stored token.
api.interceptors.request.use(async (config) => {
  let token: string | null = null;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch {
      /* ignore */
    }
  }
  if (!token) {
    try {
      token = localStorage.getItem("subli_token");
    } catch {
      /* ignore */
    }
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalize the backend's { status, message, code } error envelope.
api.interceptors.response.use(
  (r) => r,
  (error) => {
    const msg =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      "Request failed";
    return Promise.reject(new Error(msg));
  }
);

// Absolute URL for streamed media (frames, subtitles) that <img>/<a> load.
export function mediaUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE || "/api";
  return `${base}${path}`;
}
