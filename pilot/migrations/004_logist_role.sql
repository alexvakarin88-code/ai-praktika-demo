-- AI Практика: separate logistics operator permissions
-- Apply once in Supabase SQL Editor after migration 003.

alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;

alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'tester', 'logist'));

create or replace function public.is_workspace_logist(w uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = w
      and m.user_id = auth.uid()
      and m.role = 'logist'
  );
$$;

revoke all on function public.is_workspace_logist(uuid) from public;
grant execute on function public.is_workspace_logist(uuid) to authenticated;

drop policy if exists "owners and uploaders delete datasets" on public.datasets;
drop policy if exists "owners logist and uploaders delete datasets" on public.datasets;

create policy "owners logist and uploaders delete datasets"
  on public.datasets
  for delete
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      public.is_workspace_owner(workspace_id)
      or public.is_workspace_logist(workspace_id)
      or uploaded_by = auth.uid()
    )
  );

grant delete on public.datasets to authenticated;
