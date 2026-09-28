import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE || "/api";

export const api = axios.create({ baseURL });

// Attach the bearer token from localStorage on every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("subli_token");
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
