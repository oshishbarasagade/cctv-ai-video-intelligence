export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  use_case?: string;
  experience?: string;
  onboarding_completed?: number | boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at?: number;
  video_count?: number;
  event_count?: number;
  videos?: Video[];
}

export interface Video {
  id: string;
  project_id: string;
  original_name?: string;
  storage_path?: string;
  size_bytes?: number;
  duration_sec?: number;
  width?: number;
  height?: number;
  fps?: number;
  format?: string;
  created_at?: number;
}

export interface Job {
  id: string;
  video_id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage?: string;
  progress: number;
  mode?: string;
  error_message?: string;
  failed_stage?: string;
}

export interface Event {
  id: string;
  type: string;
  start_time: number;
  end_time?: number;
  description?: string;
  confidence?: number;
  related_objects?: string[];
}

export interface DetectedObject {
  id: string;
  type: string;
  confidence?: number;
  bbox?: number[];
  ts: number;
}

export interface Subject {
  id: string;
  label: string;
  first_seen?: number;
  last_seen?: number;
}

export interface OcrResult {
  id: string;
  text: string;
  confidence?: number;
  ts: number;
}

export interface Caption {
  id: string;
  text: string;
  model?: string;
  ts: number;
}

export interface EnvState {
  id: string;
  ts: number;
  state: Record<string, any>;
}

export interface Frame {
  id: string;
  ts: number;
  storage_path?: string;
}

export interface SearchResult {
  ts: number;
  kind: string;
  content: string;
  relevance: number;
}

export interface Answer {
  answer: string;
  citations?: { ts: number; type?: string }[];
  before?: Record<string, any>;
  after?: Record<string, any>;
  changes?: { field: string; before: any; after: any }[];
}

export interface Evidence {
  id: string;
  project_id: string;
  video_id?: string;
  ts?: number;
  description?: string;
  confidence?: number;
  event_id?: string;
}

export interface DashboardMetrics {
  videos: number;
  events: number;
  people: number;
  objects: number;
  projects: number;
}
