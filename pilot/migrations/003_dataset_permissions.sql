-- AI Практика: explicit dataset deletion permissions
-- Owners can clean up any completed/interrupted dataset in their workspace.
-- Testers can delete only datasets they uploaded themselves.

drop policy if exists "owners delete datasets" on public.datasets;
drop policy if exists "uploaders delete own datasets" on public.datasets;
drop policy if exists "owners and uploaders delete datasets" on public.datasets;

create policy "owners and uploaders delete datasets"
  on public.datasets
  for delete
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      public.is_workspace_owner(workspace_id)
      or uploaded_by = auth.uid()
    )
  );

grant delete on public.datasets to authenticated;
