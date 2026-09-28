import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only created when Supabase is configured. Used for Google OAuth (the redirect
// flow must run in the browser). Email/password still goes through our backend.
export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;

export const googleAuthAvailable = !!supabase;
