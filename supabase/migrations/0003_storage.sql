-- Subli 2.0 — private storage buckets + policies
-- Videos and generated artifacts are private; access via signed URLs only
-- (spec §45). Path convention: <auth.uid()>/<project_id>/<file>.

insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('artifacts', 'artifacts', false)   -- thumbnails, srt/vtt, pdf reports
on conflict (id) do nothing;

-- Owner-only access: the first path segment must equal the user's uid.
do $$
declare b text;
begin
  foreach b in array array['videos','artifacts']
  loop
    execute format($p$drop policy if exists %I_owner_read on storage.objects;$p$, b);
    execute format($p$
      create policy %I_owner_read on storage.objects
        for select to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, b, b);

    execute format($p$drop policy if exists %I_owner_write on storage.objects;$p$, b);
    execute format($p$
      create policy %I_owner_write on storage.objects
        for insert to authenticated
        with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, b, b);

    execute format($p$drop policy if exists %I_owner_delete on storage.objects;$p$, b);
    execute format($p$
      create policy %I_owner_delete on storage.objects
        for delete to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);
    $p$, b, b);
  end loop;
end $$;
