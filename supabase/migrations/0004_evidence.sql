-- Subli 2.0 — Evidence Board 2.0
-- Additive, backward-compatible columns for notes, tags, title, ordering.
-- Run once in the Supabase SQL Editor (or via `supabase db push`).

alter table public.evidence add column if not exists title text;
alter table public.evidence add column if not exists note text;
alter table public.evidence add column if not exists tags jsonb;
alter table public.evidence add column if not exists sort integer default 0;
