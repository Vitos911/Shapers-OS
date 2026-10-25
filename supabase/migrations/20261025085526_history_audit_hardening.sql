-- Reuse the existing task/audit logs and their transactional writers.
-- No backfill: old records keep their original values and actor IDs.
alter table public.org_task_history add column actor_name text;

create function org_private.stamp_task_history_actor() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() then
    raise exception 'Task history actor must match the authenticated writer' using errcode='42501';
  end if;
  select m.name into new.actor_name from public.members m where m.auth_user_id=new.actor_id;
  return new;
end $$;
revoke all on function org_private.stamp_task_history_actor() from public,anon,authenticated,service_role;
create trigger org_history_actor before insert on public.org_task_history
  for each row execute function org_private.stamp_task_history_actor();

-- Keep access to a member's own historical assignments (used by analytics).
-- Also let the current assignee read the task's earlier activity after reassignment.
drop policy history_read on public.org_task_history;
create policy history_read on public.org_task_history for select to authenticated using (
  member_id=(select org_private.member_id()) or (select org_private.admin()) or exists (
    select 1 from public.org_tasks t
    where t.id=task_id and t.assignee_id=(select org_private.member_id())
  )
);

-- Only the existing SECURITY DEFINER trigger/functions append rows.
-- RLS remains enabled; authenticated access is SELECT-only with existing role gates.
revoke all on public.org_task_history,public.org_audit from public,anon,authenticated,service_role;
grant select on public.org_task_history,public.org_audit to authenticated,service_role;

create function org_private.immutable_activity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'Activity history is append-only' using errcode='42501';
end $$;
revoke all on function org_private.immutable_activity() from public,anon,authenticated,service_role;
create trigger org_history_immutable before update or delete on public.org_task_history
  for each row execute function org_private.immutable_activity();
create trigger org_history_no_truncate before truncate on public.org_task_history
  for each statement execute function org_private.immutable_activity();
create trigger org_audit_immutable before update or delete on public.org_audit
  for each row execute function org_private.immutable_activity();
create trigger org_audit_no_truncate before truncate on public.org_audit
  for each statement execute function org_private.immutable_activity();
