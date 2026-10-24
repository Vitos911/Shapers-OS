-- Applied migration version: 20261024084522 (Supabase history).
-- A stable lookup of the same table cannot see an INSERT's new row in RETURNING.
-- Authorize owner SELECT directly on that row, still requiring verified auth.
alter policy shapers_workspace_read on public.shapers_workspaces
using (
  (owner_id = (select auth.uid()) and (select shapers_private.verified_user()))
  or (select shapers_private.can_access(id, false))
);
