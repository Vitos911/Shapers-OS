-- Tasks stay unavailable for claiming until an administrator explicitly enables them.
alter table public.org_tasks add column claimable boolean not null default false;
alter table public.org_tasks add constraint org_task_claimable_state check(not claimable or (assignee_id is null and status='todo' and not archived));
grant insert(claimable),update(claimable) on public.org_tasks to authenticated;
create index org_claimable_tasks on public.org_tasks(project_id) where claimable and assignee_id is null;
-- Additive SELECT policy preserves any existing, broader authorized project view.
create policy tasks_claimable_read on public.org_tasks for select to authenticated using(
 claimable and not archived and status='todo' and org_private.project_access(project_id));
-- Preserve the installed guard, including service attendance imports and task permissions.
-- Insert only the narrowly checked unassigned->self claim path ahead of its original body.
do $migration$
declare source text; body_start integer;
begin
 source=pg_get_functiondef('org_private.guard_changes()'::regprocedure);
 body_start=strpos(source,E'\nbegin');
 if body_start=0 or strpos(source,'Only administrators')=0 and strpos(source,'Only the current assignee')=0 then
  raise exception 'Unrecognized task guard: review migration against installed schema';
 end if;
 source=overlay(source placing $claim$
begin
 if tg_table_name='org_tasks' and tg_op='UPDATE' then
  if coalesce(old.claimable and old.assignee_id is null and new.assignee_id=org_private.member_id()
   and old.status='todo' and not old.archived and new.claimable=false
   and org_private.role() is not null
   and (to_jsonb(new)-array['assignee_id','claimable','updated_at','completed_at'])=(to_jsonb(old)-array['assignee_id','claimable','updated_at','completed_at'])
   and exists(select 1 from public.org_project_members where project_id=old.project_id and member_id=org_private.member_id()),false) then
   new.updated_at=clock_timestamp(); new.created_at=old.created_at; new.completed_at=old.completed_at;
   return new;
  end if;
 end if;
$claim$ from body_start for length(E'\nbegin'));
 execute source;
end $migration$;
create function org_private.claim_state() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.assignee_id is not null or new.status<>'todo' or new.archived then new.claimable=false; end if;
 return new;
end $$;
revoke all on function org_private.claim_state() from public,anon;
grant execute on function org_private.claim_state() to authenticated,service_role;
create trigger org_claim_state before insert or update on public.org_tasks for each row execute function org_private.claim_state();

create function org_private.claim_task(p_task uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare project uuid; member uuid; claimed uuid;
begin
 if auth.uid() is null or org_private.role() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 member=org_private.member_id();
 if member is null then raise exception 'Member profile required' using errcode='42501'; end if;
 select project_id into project from public.org_tasks where id=p_task;
 -- No task title or project information is returned on forbidden UUIDs.
 if project is null or not org_private.project_access(project) then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from public.org_projects where id=project for update;
 if not exists(select 1 from public.org_project_members where project_id=project and member_id=member) then raise exception 'Join the project first' using errcode='42501'; end if;
 if not exists(select 1 from public.org_projects where id=project and status in ('planning','active')) then raise exception 'Project is not active' using errcode='23514'; end if;
 update public.org_tasks set assignee_id=member,claimable=false where id=p_task and project_id=project and assignee_id is null and claimable and status='todo' and not archived returning id into claimed;
 if claimed is null then raise exception 'Naloga ni več na voljo. Osveži seznam.' using errcode='23514'; end if;
 return claimed;
end $$;
revoke all on function org_private.claim_task(uuid) from public,anon;
grant execute on function org_private.claim_task(uuid) to authenticated;
create function public.org_claim_task(p_task uuid) returns uuid language sql security invoker set search_path='' as $$ select org_private.claim_task(p_task) $$;
revoke all on function public.org_claim_task(uuid) from public,anon;
grant execute on function public.org_claim_task(uuid) to authenticated;
