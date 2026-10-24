-- Applied migration version: 20261024084128 (Supabase history).
-- Expose only a boolean permission check; authorization remains in RLS.
create function public.shapers_workspace_can_edit(workspace uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select shapers_private.can_access(workspace, true);
$$;
revoke all on function public.shapers_workspace_can_edit(uuid) from public, anon;
grant execute on function public.shapers_workspace_can_edit(uuid) to authenticated;
