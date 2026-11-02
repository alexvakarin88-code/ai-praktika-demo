-- AI Практика: chunked spreadsheet storage
-- Run once in Supabase SQL Editor before using the updated uploader.

create table if not exists public.dataset_rows (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  rows jsonb not null default '[]'::jsonb,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (dataset_id, chunk_index)
);

create index if not exists dataset_rows_dataset_id_idx
  on public.dataset_rows(dataset_id, chunk_index);

alter table public.dataset_rows enable row level security;

drop policy if exists "members read dataset rows" on public.dataset_rows;
create policy "members read dataset rows"
  on public.dataset_rows for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "members add dataset rows" on public.dataset_rows;
create policy "members add dataset rows"
  on public.dataset_rows for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and uploaded_by = auth.uid()
    and exists (
      select 1
      from public.datasets d
      where d.id = dataset_rows.dataset_id
        and d.workspace_id = dataset_rows.workspace_id
        and d.uploaded_by = auth.uid()
    )
  );

grant select, insert on public.dataset_rows to authenticated;
