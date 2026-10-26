-- Existing projects retain private visibility and invite-only membership.
alter table public.org_projects
 add column visibility text not null default 'private' check (visibility in ('private','organization')),
 add column join_policy text not null default 'closed' check (join_policy in ('open','approval','closed')),
 add column goal text not null default '' check (length(goal)<=2000);
grant insert(visibility,join_policy,goal), update(visibility,join_policy,goal) on public.org_projects to authenticated;

create function org_private.project_visible(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select org_private.role() is not null and (org_private.project_access(p) or exists(
 select 1 from public.org_projects where id=p and visibility='organization'))
$$;
revoke all on function org_private.project_visible(uuid) from public, anon;
grant execute on function org_private.project_visible(uuid) to authenticated;
drop policy projects_read on public.org_projects;
create policy projects_read on public.org_projects for select to authenticated using(org_private.project_visible(id));
drop policy project_members_read on public.org_project_members;
create policy project_members_read on public.org_project_members for select to authenticated using(org_private.project_visible(project_id));
-- All membership writes go through a locked operation, including administrator removal.
revoke insert,update,delete on public.org_project_members from authenticated;

create table public.org_project_join_requests (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.org_projects(id),
 member_id uuid not null references public.members(id), status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,member_id)
);
create index org_join_requests_member on public.org_project_join_requests(member_id);
alter table public.org_project_join_requests enable row level security;
revoke all on public.org_project_join_requests from public,anon,authenticated;
grant select on public.org_project_join_requests to authenticated;
create policy join_requests_read on public.org_project_join_requests for select to authenticated using(
 (member_id=(select org_private.member_id()) or (select org_private.admin())) and org_private.project_visible(project_id));

create table public.org_project_membership_history (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.org_projects(id),
 member_id uuid not null references public.members(id), actor_id uuid references auth.users(id),
 action text not null, occurred_at timestamptz not null default now()
);
create index org_membership_history_project on public.org_project_membership_history(project_id,occurred_at);
create index org_membership_history_member on public.org_project_membership_history(member_id);
alter table public.org_project_membership_history enable row level security;
revoke all on public.org_project_membership_history from public,anon,authenticated,service_role;
grant select on public.org_project_membership_history to authenticated,service_role;
create policy membership_history_read on public.org_project_membership_history for select to authenticated using(
 (member_id=(select org_private.member_id()) or (select org_private.admin())) and org_private.project_visible(project_id));

create function org_private.audit_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  insert into public.org_project_membership_history(project_id,member_id,actor_id,action) values(old.project_id,old.member_id,auth.uid(),'left'); return old;
 end if;
 insert into public.org_project_membership_history(project_id,member_id,actor_id,action)
 values(new.project_id,new.member_id,auth.uid(),case when tg_table_name='org_project_members' then 'joined' else 'request_'||(to_jsonb(new)->>'status') end);
 return new;
end $$;
revoke all on function org_private.audit_membership() from public,anon,authenticated;
create trigger membership_audit after insert or delete on public.org_project_members for each row execute function org_private.audit_membership();
create trigger join_request_audit after insert or update on public.org_project_join_requests for each row execute function org_private.audit_membership();

create function org_private.membership(p_project uuid,p_action text,p_member uuid) returns text language plpgsql security definer set search_path='' as $$
declare p public.org_projects; target uuid; administrator boolean;
begin
 if auth.uid() is null or org_private.role() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
 administrator=org_private.admin(); target=coalesce(p_member,org_private.member_id());
 if target is null or (not administrator and target is distinct from org_private.member_id()) then raise exception 'Forbidden' using errcode='42501'; end if;
 if not org_private.project_visible(p_project) then raise exception 'Forbidden' using errcode='42501'; end if;
 -- Project lock also coordinates with task claims and assignments.
 select * into p from public.org_projects where id=p_project for update;
 if not found or not org_private.project_visible(p_project) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_action in ('add','remove','approve','reject') and not administrator then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_action in ('join','add','approve') then
  if p.status not in ('planning','active') then raise exception 'Project is not active' using errcode='23514'; end if;
  if p_action='join' and p.join_policy='closed' then raise exception 'Membership is closed' using errcode='42501'; end if;
  if exists(select 1 from public.org_project_members where project_id=p.id and member_id=target) then return 'joined'; end if;
  if p_action='join' and p.join_policy='approval' then
   insert into public.org_project_join_requests(project_id,member_id) values(p.id,target)
    on conflict(project_id,member_id) do update set status='pending',updated_at=now() where org_project_join_requests.status<>'pending';
   return 'pending';
  end if;
  if p_action='approve' and not exists(select 1 from public.org_project_join_requests where project_id=p.id and member_id=target and status='pending') then raise exception 'No pending request' using errcode='23514'; end if;
  insert into public.org_project_members(project_id,member_id) values(p.id,target) on conflict do nothing;
  update public.org_project_join_requests set status='approved',updated_at=now() where project_id=p.id and member_id=target and status='pending';
  return 'joined';
 elsif p_action in ('leave','remove') then
  if exists(select 1 from public.org_tasks where project_id=p.id and assignee_id=target and status<>'done' and not archived) then raise exception 'Pred izstopom predaj ali zaključi odprte naloge.' using errcode='23514'; end if;
  delete from public.org_project_members where project_id=p.id and member_id=target;
  update public.org_project_join_requests set status='cancelled',updated_at=now() where project_id=p.id and member_id=target and status='pending';
  return 'left';
 elsif p_action='reject' then
  update public.org_project_join_requests set status='rejected',updated_at=now() where project_id=p.id and member_id=target and status='pending';
  if not found then raise exception 'No pending request' using errcode='23514'; end if;
  return 'rejected';
 end if;
 raise exception 'Invalid action' using errcode='22023';
end $$;
revoke all on function org_private.membership(uuid,text,uuid) from public,anon;
grant execute on function org_private.membership(uuid,text,uuid) to authenticated;
create function public.org_project_membership(p_project uuid,p_action text,p_member uuid default null) returns text language sql security invoker set search_path='' as $$
 select org_private.membership(p_project,p_action,p_member)
$$;
revoke all on function public.org_project_membership(uuid,text,uuid) from public,anon;
grant execute on function public.org_project_membership(uuid,text,uuid) to authenticated;

-- A minimal directory discloses names only, never another member's email or hours.
create function org_private.project_directory() returns table(project_id uuid,member_id uuid,name text) language sql stable security definer set search_path='' as $$
 select pm.project_id,pm.member_id,m.name from public.org_project_members pm join public.members m on m.id=pm.member_id
 where auth.uid() is not null and org_private.project_visible(pm.project_id)
$$;
revoke all on function org_private.project_directory() from public,anon;
grant execute on function org_private.project_directory() to authenticated;
create function public.org_project_directory() returns table(project_id uuid,member_id uuid,name text) language sql stable security invoker set search_path='' as $$ select * from org_private.project_directory() $$;
revoke all on function public.org_project_directory() from public,anon;
grant execute on function public.org_project_directory() to authenticated;

-- Aggregate progress is safe for discoverable projects without exposing task details.
create function org_private.project_progress() returns table(project_id uuid,total bigint,done bigint) language sql stable security definer set search_path='' as $$
 select p.id,count(t.id),count(t.id) filter(where t.status='done') from public.org_projects p
 left join public.org_tasks t on t.project_id=p.id and not t.archived where org_private.project_visible(p.id) group by p.id
$$;
revoke all on function org_private.project_progress() from public,anon;
grant execute on function org_private.project_progress() to authenticated;
create function public.org_project_progress() returns table(project_id uuid,total bigint,done bigint) language sql stable security invoker set search_path='' as $$ select * from org_private.project_progress() $$;
revoke all on function public.org_project_progress() from public,anon;
grant execute on function public.org_project_progress() to authenticated;
