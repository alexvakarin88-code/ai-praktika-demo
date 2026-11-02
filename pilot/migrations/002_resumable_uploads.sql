-- AI Практика: reliable, resumable large spreadsheet uploads
-- Run this migration once in Supabase SQL Editor before deploying the matching app.js/parser-worker.js.

alter table public.datasets
  add column if not exists upload_status text not null default 'complete',
  add column if not exists upload_error text,
  add column if not exists stored_row_count bigint not null default 0,
  add column if not exists stored_chunks integer not null default 0,
  add column if not exists source_file_name text,
  add column if not exists source_file_size bigint,
  add column if not exists source_file_last_modified bigint,
  add column if not exists source_file_hash text,
  add column if not exists upload_started_at timestamptz,
  add column if not exists upload_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'datasets_upload_status_check'
      and conrelid = 'public.datasets'::regclass
  ) then
    alter table public.datasets
      add constraint datasets_upload_status_check
      check (upload_status in ('uploading','interrupted','complete','failed'));
  end if;
end $$;

-- Backfill counts for datasets that already have chunked rows.
update public.datasets d
set stored_chunks = x.chunk_count,
    stored_row_count = x.row_count
from (
  select dataset_id,
         count(*)::integer as chunk_count,
         coalesce(sum(jsonb_array_length(rows)), 0)::bigint as row_count
  from public.dataset_rows
  group by dataset_id
) x
where x.dataset_id = d.id;

-- Preserve counts for legacy datasets stored in datasets.rows.
update public.datasets
set stored_row_count = greatest(
  stored_row_count,
  case
    when jsonb_typeof(rows) = 'array' then jsonb_array_length(rows)::bigint
    else 0
  end
)
where stored_row_count = 0;

create or replace function public.bump_dataset_upload_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.datasets
  set stored_chunks = stored_chunks + 1,
      stored_row_count = stored_row_count
        + jsonb_array_length(coalesce(new.rows, '[]'::jsonb))
  where id = new.dataset_id
    and workspace_id = new.workspace_id;
  return new;
end;
$$;

drop trigger if exists dataset_rows_track_progress on public.dataset_rows;
create trigger dataset_rows_track_progress
after insert on public.dataset_rows
for each row execute function public.bump_dataset_upload_progress();

create index if not exists datasets_workspace_upload_status_idx
  on public.datasets(workspace_id, upload_status, created_at desc);

-- Keep the trigger helper unavailable as a direct API function.
revoke all on function public.bump_dataset_upload_progress() from public, anon, authenticated;
