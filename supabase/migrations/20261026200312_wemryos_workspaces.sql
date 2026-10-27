-- Staging first. Existing row IDs, immutable history and legacy JSONB are retained.
begin;
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 80),
 slug text not null unique, description text not null default '' check(length(description)<=2000),
 organization_type text not null default 'other' check(organization_type in ('association','nonprofit','volunteer','remote','other')),
 logo_url text not null default '' check(length(logo_url)<=2000 and (logo_url='' or logo_url like 'https://%')),
 accent_color text not null default '#5267df' check(accent_color ~ '^#[0-9a-fA-F]{6}$'),
 created_by uuid references auth.users(id), active_member_count integer not null default 0 check(active_member_count between 0 and 50), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.organizations(id,name,slug,organization_type) values('00000000-0000-4000-8000-000000000001','Global Shapers','global-shapers','association');

create function org_private.workspace_id() returns uuid language sql stable set search_path='' as $$
 select coalesce(nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-workspace-id','')::uuid,'00000000-0000-4000-8000-000000000001'::uuid)
$$;
revoke all on function org_private.workspace_id() from public,anon;
grant execute on function org_private.workspace_id() to authenticated,service_role;

-- A constant metadata backfill avoids UPDATE triggers on immutable ledgers.
do $$ declare t text; begin
 foreach t in array array['members','org_projects','org_project_members','org_tasks','org_task_history','org_work_entries','org_weekly_hours','org_meetings','org_meeting_members','org_attendance','org_audit','org_settings','org_work_sessions','org_work_segments','org_project_join_requests','org_project_membership_history','org_leaderboard_weeks'] loop
  execute format('alter table public.%I add column organization_id uuid not null default %L references public.organizations(id)',t,'00000000-0000-4000-8000-000000000001');
  execute format('alter table public.%I alter column organization_id set default org_private.workspace_id()',t);
  execute format('create index on public.%I(organization_id)',t);
 end loop;
end $$;
alter table public.org_settings drop constraint org_settings_pkey;
alter table public.org_settings add primary key(organization_id,id);
alter table public.org_leaderboard_weeks drop constraint org_leaderboard_weeks_pkey;
alter table public.org_leaderboard_weeks add primary key(organization_id,week_start,version);
alter table public.members drop constraint if exists members_email_key;
alter table public.members drop constraint if exists members_auth_user_id_key;
drop index if exists public.members_normalized_email;
create unique index members_workspace_email on public.members(organization_id,lower(btrim(email)));
create unique index members_workspace_user on public.members(organization_id,auth_user_id);
alter table public.members drop constraint if exists members_tier_check;
alter table public.members drop constraint if exists members_weekly_hours_check;
alter table public.members add check(weekly_hours>=0 and weekly_hours<=168);
alter table public.members add check(length(tier) between 1 and 80);

create table public.organization_members (
 organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id),
 member_id uuid references public.members(id), role text not null check(role in ('OWNER','ADMIN','MEMBER')),
 membership_status text not null default 'active' check(membership_status in ('active','inactive')),
 presence_hidden boolean not null default false, joined_at timestamptz not null default now(), primary key(organization_id,user_id)
);
create index on public.organization_members(user_id,membership_status);
insert into public.organization_members(organization_id,user_id,member_id,role,membership_status)
 select '00000000-0000-4000-8000-000000000001',a.auth_user_id,a.member_id,case when a.role in ('ADMIN','SUPERADMIN') then 'ADMIN' else 'MEMBER' end,case when a.disabled then 'inactive' else 'active' end
 from org_private.access a where a.auth_user_id is not null;
update public.organizations o set active_member_count=(select count(*) from public.organization_members m where m.organization_id=o.id and m.membership_status='active');

create table public.organization_settings (
 organization_id uuid primary key references public.organizations(id), weekly_hours_enabled boolean not null default true,
 attendance_enabled boolean not null default true, leaderboard_enabled boolean not null default true,
 gamification_enabled boolean not null default true, default_weekly_hours numeric not null default 4 check(default_weekly_hours between 0 and 168)
);
insert into public.organization_settings(organization_id) select id from public.organizations;
create table public.organization_groups (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check(length(btrim(name)) between 1 and 80), weekly_hours numeric not null check(weekly_hours between 0 and 168), unique(organization_id,name)
);
insert into public.organization_groups(organization_id,name,weekly_hours) select organization_id,tier,max(weekly_hours) from public.members group by organization_id,tier;

-- Preserve verified demo links and platform operator authorization in the legacy workspace only.
alter function org_private.identity() rename to legacy_identity;
create function org_private.identity() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(case when org_private.workspace_id()='00000000-0000-4000-8000-000000000001' then org_private.legacy_identity()||jsonb_build_object('organization_id',org_private.workspace_id()) end, (
  select jsonb_build_object('user_id',u.id,'email',u.email,'role',m.role,'member_id',m.member_id,'organization_id',m.organization_id)
  from public.organization_members m join auth.users u on u.id=m.user_id
  where m.organization_id=org_private.workspace_id() and m.user_id=auth.uid() and m.membership_status='active'
  and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now())
  and (m.organization_id<>'00000000-0000-4000-8000-000000000001' or not exists(select 1 from org_private.access a where a.email=lower(btrim(u.email))))
 ))
$$;
create or replace function org_private.role() returns text language sql stable set search_path='' as $$ select org_private.identity()->>'role' $$;
create or replace function org_private.member_id() returns uuid language sql stable set search_path='' as $$ select (org_private.identity()->>'member_id')::uuid $$;
create or replace function org_private.admin() returns boolean language sql stable set search_path='' as $$ select coalesce(org_private.role() in ('OWNER','ADMIN','SUPERADMIN'),false) $$;
create or replace function public.org_context() returns jsonb language sql stable set search_path='' as $$ select org_private.identity() $$;
revoke all on function org_private.identity() from public,anon;
grant execute on function org_private.identity() to authenticated;

create function org_private.workspace_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=w and m.user_id=auth.uid() and m.membership_status='active' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now())) or (w='00000000-0000-4000-8000-000000000001' and org_private.legacy_identity() is not null))
$$;
revoke all on function org_private.workspace_member(uuid) from public,anon;
grant execute on function org_private.workspace_member(uuid) to authenticated;

-- RESTRICTIVE policies intersect existing role/task/hour policies, including SUPERADMIN.
do $$ declare t text; begin
 foreach t in array array['members','org_projects','org_project_members','org_tasks','org_task_history','org_work_entries','org_weekly_hours','org_meetings','org_meeting_members','org_attendance','org_audit','org_settings','org_work_sessions','org_work_segments','org_project_join_requests','org_project_membership_history'] loop
  execute format('create policy workspace_boundary on public.%I as restrictive for all to authenticated using(organization_id=org_private.workspace_id() and org_private.workspace_member(organization_id)) with check(organization_id=org_private.workspace_id() and org_private.workspace_member(organization_id))',t);
 end loop;
 foreach t in array array['organizations','organization_members','organization_settings','organization_groups'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy workspace_read on public.organizations for select to authenticated using(org_private.workspace_member(id));
create policy workspace_roster on public.organization_members for select to authenticated using(user_id=auth.uid());
create policy workspace_settings on public.organization_settings for select to authenticated using(org_private.workspace_member(organization_id) and organization_id=org_private.workspace_id());
create policy workspace_groups on public.organization_groups for select to authenticated using(org_private.workspace_member(organization_id) and organization_id=org_private.workspace_id());

-- Relationship validation also runs inside SECURITY DEFINER writes.
create function org_private.tenant_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; key text; target_table text; target uuid;
begin
 r=to_jsonb(new);
 if tg_op='UPDATE' and r->>'organization_id' is distinct from to_jsonb(old)->>'organization_id' then raise exception 'Workspace is immutable' using errcode='42501'; end if;
 foreach key in array array['member_id','assignee_id','project_id','task_id','meeting_id','session_id'] loop
  if r->>key is null then continue; end if;
  target_table=case key when 'member_id' then 'members' when 'assignee_id' then 'members' when 'project_id' then 'org_projects' when 'task_id' then 'org_tasks' when 'meeting_id' then 'org_meetings' when 'session_id' then 'org_work_sessions' end;
  execute format('select organization_id from public.%I where id=$1',target_table) into target using (r->>key)::uuid;
  if target is distinct from (r->>'organization_id')::uuid then raise exception 'Cross-workspace relationship rejected' using errcode='42501'; end if;
 end loop;
 if auth.uid() is not null and (r->>'organization_id')::uuid<>org_private.workspace_id() then raise exception 'Wrong workspace' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function org_private.tenant_guard() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['members','org_projects','org_project_members','org_tasks','org_work_entries','org_weekly_hours','org_meetings','org_meeting_members','org_attendance','org_settings','org_work_sessions','org_work_segments','org_project_join_requests'] loop
  execute format('create trigger a_workspace_guard before insert or update on public.%I for each row execute function org_private.tenant_guard()',t);
 end loop;
end $$;

create or replace function org_private.project_access(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select org_private.role() is not null and exists(select 1 from public.org_projects x where x.id=p and x.organization_id=org_private.workspace_id() and (org_private.admin() or x.created_by=auth.uid() or exists(select 1 from public.org_project_members pm where pm.project_id=p and pm.member_id=org_private.member_id()) or exists(select 1 from public.org_tasks t where t.project_id=p and t.assignee_id=org_private.member_id())))
$$;
create or replace function org_private.project_visible(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select org_private.role() is not null and exists(select 1 from public.org_projects x where x.id=p and x.organization_id=org_private.workspace_id() and (org_private.project_access(p) or x.visibility='organization'))
$$;
create function org_private.project_owner(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select org_private.role() is not null and exists(select 1 from public.org_projects x where x.id=p and x.organization_id=org_private.workspace_id() and (org_private.admin() or x.created_by=auth.uid()))
$$;
revoke all on function org_private.project_owner(uuid) from public,anon;
grant execute on function org_private.project_owner(uuid) to authenticated;
drop policy join_requests_read on public.org_project_join_requests;
create policy join_requests_read on public.org_project_join_requests for select to authenticated using((member_id=org_private.member_id() or org_private.project_owner(project_id)) and org_private.project_visible(project_id));
drop policy membership_history_read on public.org_project_membership_history;
create policy membership_history_read on public.org_project_membership_history for select to authenticated using((member_id=org_private.member_id() or org_private.project_owner(project_id)) and org_private.project_visible(project_id));
drop policy projects_insert on public.org_projects;
drop policy projects_update on public.org_projects;
create policy projects_insert on public.org_projects for insert to authenticated with check(org_private.member_id() is not null and created_by=auth.uid());
create policy projects_update on public.org_projects for update to authenticated using(org_private.project_owner(id)) with check(org_private.project_owner(id));
drop policy projects_read on public.org_projects;
create policy projects_read on public.org_projects for select to authenticated using(created_by=auth.uid() or org_private.project_visible(id));
create function org_private.project_creator() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  insert into public.org_project_members(project_id,member_id,organization_id) values(new.id,org_private.member_id(),new.organization_id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function org_private.project_creator() from public,anon,authenticated;
create trigger project_creator after insert on public.org_projects for each row execute function org_private.project_creator();

drop policy tasks_insert on public.org_tasks;
drop policy tasks_update on public.org_tasks;
create policy tasks_insert on public.org_tasks for insert to authenticated with check(org_private.project_access(project_id) and created_by=auth.uid());
create policy tasks_update on public.org_tasks for update to authenticated using(org_private.project_owner(project_id) or created_by=auth.uid() or assignee_id=org_private.member_id()) with check(org_private.project_access(project_id));
-- Existing guard is retained for all non-task entities. Task permissions broaden explicitly.
alter function org_private.guard_changes() rename to legacy_guard_changes;
create function org_private.guard_changes() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='org_tasks' then
  if tg_op='UPDATE' then
   if new.project_id<>old.project_id or new.created_by is distinct from old.created_by or new.created_at<>old.created_at then raise exception 'Task identity immutable' using errcode='42501'; end if;
   if not org_private.project_owner(old.project_id) and old.created_by is distinct from auth.uid() then
    if old.assignee_id is distinct from org_private.member_id() and (to_jsonb(new)-array['assignee_id','claimable','updated_at','completed_at']) is distinct from (to_jsonb(old)-array['assignee_id','claimable','updated_at','completed_at']) then raise exception 'Claim cannot edit task fields' using errcode='42501'; end if;
    if old.assignee_id is distinct from org_private.member_id() and not (old.claimable and old.assignee_id is null and new.assignee_id=org_private.member_id()) then raise exception 'Task unavailable' using errcode='42501'; end if;
    if (to_jsonb(new)-array['status','description','priority','due_date','assignee_id','claimable','updated_at','completed_at']) is distinct from (to_jsonb(old)-array['status','description','priority','due_date','assignee_id','claimable','updated_at','completed_at']) then raise exception 'Project owner or creator required' using errcode='42501'; end if;
   end if;
   new.updated_at=clock_timestamp(); new.created_at=old.created_at;
   new.completed_at=case when new.status is distinct from old.status then case when new.status='done' then now() end else old.completed_at end;
  else new.completed_at=case when new.status='done' then now() end;
  end if;
  if new.assignee_id is not null and (tg_op='INSERT' or new.assignee_id is distinct from old.assignee_id) and not (org_private.admin() and new.organization_id='00000000-0000-4000-8000-000000000001') and not exists(select 1 from public.org_project_members pm where pm.project_id=new.project_id and pm.member_id=new.assignee_id) then raise exception 'Assignee must join project' using errcode='42501'; end if;
  return new;
 end if;
 return new;
end $$;
-- Existing triggers follow the renamed function OID; only task guard is replaced.
drop trigger org_guard on public.org_tasks;
create trigger org_guard before insert or update on public.org_tasks for each row execute function org_private.guard_changes();
revoke all on function org_private.guard_changes() from public,anon;
grant execute on function org_private.guard_changes() to authenticated,service_role;

-- Reviewed edits to definer paths: do not depend on RLS inside a definer.
do $$ declare source text; begin
 source=pg_get_functiondef('org_private.membership(uuid,text,uuid)'::regprocedure);
 source=replace(source,'administrator=org_private.admin();','administrator=org_private.project_owner(p_project);');
 execute source;
 source=pg_get_functiondef('public.org_work_state()'::regprocedure);
 source=replace(source,'s.state<>''stopped'' and','s.organization_id=org_private.workspace_id() and s.state<>''stopped'' and');
 source=replace(source,'from public.org_work_entries w,actor a where','from public.org_work_entries w,actor a where w.organization_id=org_private.workspace_id() and (');
 source=replace(source,$s$a.identity->>'role' in ('ADMIN','SUPERADMIN')
  union all$s$,$s$a.identity->>'role' in ('OWNER','ADMIN','SUPERADMIN'))
  union all$s$);
 source=replace(source,$s$in ('ADMIN','SUPERADMIN')$s$,$s$in ('OWNER','ADMIN','SUPERADMIN')$s$);
 execute source;
 source=pg_get_functiondef('public.org_work_timer(text,uuid,integer,uuid,text)'::regprocedure);
 source=replace(source,'actor=org_private.identity();',$s$actor=org_private.identity();
 if p_action in ('start','resume') and not exists(select 1 from public.organization_settings where organization_id=org_private.workspace_id() and weekly_hours_enabled) then raise exception 'Time tracking disabled' using errcode='42501'; end if;$s$);
 source=replace(source,$s$if s.user_id<>(actor->>'user_id')::uuid then$s$,$s$if s.user_id<>(actor->>'user_id')::uuid or s.organization_id<>org_private.workspace_id() then$s$);
 execute source;
 source=pg_get_functiondef('public.org_admin_work(uuid,uuid,date,numeric,text,uuid,text,timestamptz,boolean)'::regprocedure);
 source=replace(source,'if not org_private.admin() then','if not org_private.admin() or not exists(select 1 from public.members where id=p_member_id and organization_id=org_private.workspace_id()) then');
 execute source;
end $$;

-- Bind temporal leaderboard evidence and service-only projections to the trusted scope.
alter table org_private.leaderboard_events add column organization_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.organizations(id);
alter table org_private.leaderboard_events alter column organization_id set default org_private.workspace_id();
create index on org_private.leaderboard_events(organization_id,entity,record_key,recorded_at);
create or replace function org_private.leaderboard_rows(entity_name text,cutoff timestamptz) returns setof jsonb language sql stable set search_path='' as $$
 select data from (select distinct on(record_key) record_key,data from org_private.leaderboard_events where organization_id=org_private.workspace_id() and entity=entity_name and recorded_at<cutoff order by record_key,recorded_at desc,sequence desc) latest where data is not null
$$;
do $$ declare source text; begin
 source=pg_get_functiondef('org_private.session_work(timestamptz,uuid[])'::regprocedure);
 source=replace(source,'where g.started_at<at_time','where s.organization_id=org_private.workspace_id() and g.started_at<at_time');
 execute source;
end $$;

-- All capacity-changing paths serialize on the organization row, including direct service writes.
create function org_private.member_capacity() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid; delta integer;
begin
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.user_id<>old.user_id) then raise exception 'Membership identity is immutable' using errcode='42501'; end if;
 w=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
 perform 1 from public.organizations where id=w for update;
 -- BEFORE INSERT also runs before ON CONFLICT UPDATE. Count only the eventual
 -- membership transition, not the speculative insert preceding an idempotent upsert.
 if tg_op='INSERT' and exists(select 1 from public.organization_members where organization_id=w and user_id=new.user_id) then return new; end if;
 -- UPDATE takes a row lock and a write dependency, protecting REPEATABLE READ as well.
 delta=case when tg_op<>'DELETE' and new.membership_status='active' then 1 else 0 end-case when tg_op<>'INSERT' and old.membership_status='active' then 1 else 0 end;
 if delta=1 then
  update public.organizations set active_member_count=active_member_count+1 where id=w and active_member_count<50;
  if not found then raise exception 'Workspace supports at most 50 active members' using errcode='23514'; end if;
 elsif delta=-1 then update public.organizations set active_member_count=active_member_count-1 where id=w; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function org_private.member_capacity() from public,anon,authenticated;
create trigger member_capacity before insert or update or delete on public.organization_members for each row execute function org_private.member_capacity();

create table org_private.workspace_invitations (
 token uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 email text not null, expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz
);
create table org_private.presence_leases (
 organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id),
 connection_id uuid not null, last_seen timestamptz not null, active_at timestamptz not null, primary key(organization_id,user_id,connection_id)
);
alter table org_private.workspace_invitations enable row level security;
alter table org_private.presence_leases enable row level security;
revoke all on org_private.workspace_invitations,org_private.presence_leases from public,anon,authenticated;

create function org_private.verified_user() returns uuid language sql stable security definer set search_path='' as $$
 select id from auth.users where id=auth.uid() and email_confirmed_at is not null and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<now())
$$;
revoke all on function org_private.verified_user() from public,anon;
grant execute on function org_private.verified_user() to authenticated;

create function public.wemry_workspaces() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('member_count',(select count(*) from public.organization_members m where m.organization_id=o.id and m.membership_status='active'),'role',(select m.role from public.organization_members m where m.organization_id=o.id and m.user_id=auth.uid())) order by o.created_at),'[]') from public.organizations o where org_private.verified_user() is not null and org_private.workspace_member(o.id)
$$;
create function public.wemry_create_workspace(p_name text,p_description text default '',p_type text default 'other',p_logo text default '',p_accent text default '#5267df') returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid; m uuid; actor uuid; address text;
begin
 actor=org_private.verified_user(); if actor is null then raise exception 'Verified account required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,603));
 if (select count(*) from public.organizations where created_by=actor)>=10 then raise exception 'Workspace creation limit reached' using errcode='23514'; end if;
 insert into public.organizations(name,slug,description,organization_type,logo_url,accent_color,created_by) values(btrim(p_name),gen_random_uuid()::text,p_description,p_type,p_logo,p_accent,actor) returning id into w;
 perform set_config('request.headers',jsonb_build_object('x-workspace-id',w)::text,true);
 select email into address from auth.users where id=actor;
 insert into public.members(name,email,tier,weekly_hours,auth_user_id,organization_id) values(split_part(address,'@',1),address,'Member',4,actor,w) returning id into m;
 insert into public.organization_members(organization_id,user_id,member_id,role) values(w,actor,m,'OWNER');
 insert into public.organization_settings(organization_id) values(w);
 insert into public.org_settings(organization_id,name) values(w,btrim(p_name));
 insert into public.organization_groups(organization_id,name,weekly_hours) values(w,'Member',4);
 return w;
end $$;

create function public.wemry_workspace_command(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; w uuid; token uuid; invite org_private.workspace_invitations; m uuid; target uuid; g public.organization_groups; address text;
begin
 actor=org_private.verified_user(); w=org_private.workspace_id();
 if actor is null then raise exception 'Verified account required' using errcode='42501'; end if;
 if p_action='accept' then
  select * into invite from org_private.workspace_invitations where workspace_invitations.token=(p_data->>'token')::uuid for update;
  select email into address from auth.users where id=actor;
  if invite.token is null or invite.expires_at<now() or invite.accepted_at is not null or lower(address)<>invite.email then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  w=invite.organization_id; perform 1 from public.organizations where id=w for update;
  perform set_config('request.headers',jsonb_build_object('x-workspace-id',w)::text,true);
  select id into m from public.members where organization_id=w and auth_user_id=actor;
  if m is null then insert into public.members(name,email,tier,weekly_hours,auth_user_id,organization_id) values(split_part(address,'@',1),address,'Member',4,actor,w) returning id into m; end if;
  insert into public.organization_members(organization_id,user_id,member_id,role) values(w,actor,m,'MEMBER') on conflict(organization_id,user_id) do update set membership_status='active';
  update org_private.workspace_invitations set accepted_at=now() where workspace_invitations.token=invite.token;
  return jsonb_build_object('organization_id',w);
 end if;
 if not org_private.workspace_member(w) or org_private.identity() is null then raise exception 'Workspace unavailable' using errcode='42501'; end if;
 perform 1 from public.organizations where id=w for update;
 if p_action='leave' then
  if org_private.role()='OWNER' then raise exception 'Transfer ownership before leaving' using errcode='42501'; end if;
  if w='00000000-0000-4000-8000-000000000001' then raise exception 'Legacy access is managed by platform operators' using errcode='42501'; end if;
  if exists(select 1 from public.org_work_sessions where member_id=org_private.member_id() and state<>'stopped') or exists(select 1 from public.org_tasks where assignee_id=org_private.member_id() and status<>'done' and not archived) then raise exception 'Finish work or reassign tasks before leaving' using errcode='23514'; end if;
  update public.organization_members set membership_status='inactive' where organization_id=w and user_id=actor;
 elsif p_action='privacy' then
  update public.organization_members set presence_hidden=(p_data->>'hidden')::boolean where organization_id=w and user_id=actor;
  delete from org_private.presence_leases where organization_id=w and user_id=actor;
 else
  if not org_private.admin() then raise exception 'Workspace administrator required' using errcode='42501'; end if;
  if p_action='invite' then
   if p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_data->>'email')>254 then raise exception 'Invalid email' using errcode='22023'; end if;
   insert into org_private.workspace_invitations(organization_id,email) values(w,lower(btrim(p_data->>'email'))) returning workspace_invitations.token into token;
   return jsonb_build_object('token',token);
  elsif p_action='group' then
   if p_data->>'id' is not null then
    select * into g from public.organization_groups where id=(p_data->>'id')::uuid and organization_id=w;
    if g.id is null then raise exception 'Group unavailable' using errcode='42501'; end if;
    update public.organization_groups set name=btrim(p_data->>'name'),weekly_hours=(p_data->>'weekly_hours')::numeric where id=g.id;
    update public.members set tier=btrim(p_data->>'name'),weekly_hours=(p_data->>'weekly_hours')::numeric where organization_id=w and tier=g.name;
   else
    insert into public.organization_groups(organization_id,name,weekly_hours) values(w,btrim(p_data->>'name'),(p_data->>'weekly_hours')::numeric) on conflict(organization_id,name) do update set weekly_hours=excluded.weekly_hours;
    update public.members set weekly_hours=(p_data->>'weekly_hours')::numeric where organization_id=w and tier=btrim(p_data->>'name');
   end if;
  elsif p_action='assign-group' then
   select * into g from public.organization_groups where id=(p_data->>'group_id')::uuid and organization_id=w;
   if g.id is null then raise exception 'Group unavailable' using errcode='42501'; end if;
   update public.members set tier=g.name,weekly_hours=g.weekly_hours where id=(p_data->>'member_id')::uuid and organization_id=w;
  elsif p_action='settings' then
   if (p_data->>'weekly_hours_enabled')::boolean=false and exists(select 1 from public.org_work_sessions where organization_id=w and state<>'stopped') then raise exception 'Stop active timers before disabling time tracking' using errcode='23514'; end if;
   update public.organization_settings set weekly_hours_enabled=(p_data->>'weekly_hours_enabled')::boolean,attendance_enabled=(p_data->>'attendance_enabled')::boolean,leaderboard_enabled=(p_data->>'leaderboard_enabled')::boolean,gamification_enabled=(p_data->>'gamification_enabled')::boolean where organization_id=w;
  elsif p_action='remove' then
   target=(p_data->>'user_id')::uuid;
   if exists(select 1 from public.organization_members where organization_id=w and user_id=target and role='OWNER') then raise exception 'Owner cannot be removed' using errcode='42501'; end if;
   if w='00000000-0000-4000-8000-000000000001' then raise exception 'Legacy access managed separately' using errcode='42501'; end if;
   select member_id into m from public.organization_members where organization_id=w and user_id=target;
   if m is null then raise exception 'Member unavailable' using errcode='42501'; end if;
   if exists(select 1 from public.org_work_sessions where member_id=m and state<>'stopped') or exists(select 1 from public.org_tasks where assignee_id=m and status<>'done' and not archived) then raise exception 'Finish work or reassign tasks before removal' using errcode='23514'; end if;
   update public.organization_members set membership_status='inactive' where organization_id=w and user_id=target;
  elsif p_action in ('role','transfer') then
   if org_private.role()<>'OWNER' then raise exception 'Owner required' using errcode='42501'; end if;
   target=(p_data->>'user_id')::uuid;
   if target=actor or not exists(select 1 from public.organization_members where organization_id=w and user_id=target and membership_status='active') then raise exception 'Active teammate required' using errcode='42501'; end if;
   if p_action='transfer' then
    update public.organization_members set role='OWNER' where organization_id=w and user_id=target;
    update public.organization_members set role='ADMIN' where organization_id=w and user_id=actor;
   else
    if p_data->>'role' not in ('ADMIN','MEMBER') then raise exception 'Invalid role' using errcode='22023'; end if;
    update public.organization_members set role=p_data->>'role' where organization_id=w and user_id=target and role<>'OWNER';
   end if;
  else raise exception 'Unknown command' using errcode='22023'; end if;
 end if;
 return jsonb_build_object('saved',true);
end $$;

-- Presence is a server-verified, short connection lease: no client-controlled identity,
-- no keyboard content, coordinates, cross-app activity or unprotected public channels.
create function public.wemry_presence(p_connection uuid,p_active boolean default false,p_disconnect boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid; actor uuid; hidden boolean;
begin
 w=org_private.workspace_id(); actor=org_private.verified_user();
 if actor is null or not org_private.workspace_member(w) then raise exception 'Workspace unavailable' using errcode='42501'; end if;
 select presence_hidden into hidden from public.organization_members where organization_id=w and user_id=actor and membership_status='active';
 if p_disconnect or coalesce(hidden,true) then delete from org_private.presence_leases where organization_id=w and user_id=actor and connection_id=p_connection;
 else
  insert into org_private.presence_leases(organization_id,user_id,connection_id,last_seen,active_at) values(w,actor,p_connection,clock_timestamp(),case when p_active then clock_timestamp() else clock_timestamp()-interval '5 minutes' end)
  on conflict(organization_id,user_id,connection_id) do update set last_seen=clock_timestamp(),active_at=case when p_active then clock_timestamp() else presence_leases.active_at end;
 end if;
 delete from org_private.presence_leases where organization_id=w and last_seen<clock_timestamp()-interval '2 minutes';
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'member_id',m.member_id,'name',p.name,'hidden',m.presence_hidden,'status',case when m.presence_hidden then 'unknown' when exists(select 1 from org_private.presence_leases l where l.organization_id=w and l.user_id=m.user_id and l.last_seen>clock_timestamp()-interval '90 seconds' and l.active_at>clock_timestamp()-interval '5 minutes') then 'online' when exists(select 1 from org_private.presence_leases l where l.organization_id=w and l.user_id=m.user_id and l.last_seen>clock_timestamp()-interval '90 seconds') then 'idle' else 'offline' end)),'[]') from public.organization_members m join public.members p on p.id=m.member_id where m.organization_id=w and m.membership_status='active');
end $$;
revoke all on function public.wemry_workspaces(),public.wemry_create_workspace(text,text,text,text,text),public.wemry_workspace_command(text,jsonb),public.wemry_presence(uuid,boolean,boolean) from public,anon;
grant execute on function public.wemry_workspaces(),public.wemry_create_workspace(text,text,text,text,text),public.wemry_workspace_command(text,jsonb),public.wemry_presence(uuid,boolean,boolean) to authenticated;
-- Keep service-only Calendar upserts separate when two workspaces use the same calendar.
alter table public.org_meetings drop constraint org_meetings_calendar_id_google_event_id_key;
alter table public.org_meetings add unique(organization_id,calendar_id,google_event_id);
do $$ declare source text; begin
 source=pg_get_functiondef('public.org_apply_calendar(text,jsonb,text[])'::regprocedure);
 source=replace(source,'on conflict(calendar_id,google_event_id)','on conflict(organization_id,calendar_id,google_event_id)');
 source=replace(source,'where calendar_id=p_calendar_id and google_event_id=any(p_cancelled)','where organization_id=org_private.workspace_id() and calendar_id=p_calendar_id and google_event_id=any(p_cancelled)');
 execute source;
 source=pg_get_functiondef('org_private.refresh_member_access()'::regprocedure);
 source=replace(source,'from public.members','from public.members where organization_id=''00000000-0000-4000-8000-000000000001''');
 execute source;
end $$;
drop policy settings_update on public.org_settings;
create policy settings_update on public.org_settings for update to authenticated using(org_private.admin()) with check(org_private.admin());

-- Minimal roster never exposes another member's email, targets or logged hours.
create function public.wemry_member_directory() returns table(id uuid,name text,user_id uuid,role text) language sql stable security definer set search_path='' as $$
 select p.id,p.name,m.user_id,m.role from public.members p join public.organization_members m on m.member_id=p.id
 where m.organization_id=org_private.workspace_id() and m.membership_status='active' and org_private.role() is not null
$$;
revoke all on function public.wemry_member_directory() from public,anon;
grant execute on function public.wemry_member_directory() to authenticated;

create function org_private.sync_legacy_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  update public.organization_members set membership_status='inactive' where organization_id='00000000-0000-4000-8000-000000000001' and user_id=old.auth_user_id;
  return old;
 end if;
 if new.auth_user_id is not null then
  insert into public.organization_members(organization_id,user_id,member_id,role,membership_status)
  values('00000000-0000-4000-8000-000000000001',new.auth_user_id,new.member_id,case when new.role in ('ADMIN','SUPERADMIN') then 'ADMIN' else 'MEMBER' end,case when new.disabled then 'inactive' else 'active' end)
  on conflict(organization_id,user_id) do update set member_id=excluded.member_id,role=excluded.role,membership_status=excluded.membership_status;
 end if;
 return new;
end $$;
revoke all on function org_private.sync_legacy_membership() from public,anon,authenticated;
create trigger sync_legacy_membership after insert or update or delete on org_private.access for each row execute function org_private.sync_legacy_membership();

alter table public.org_projects add column color text not null default '#5267df' check(color ~ '^#[0-9a-fA-F]{6}$'), add column icon text not null default 'folder' check(icon in ('folder','heart','globe','rocket')), add column due_date date;
grant insert(color,icon,due_date),update(color,icon,due_date) on public.org_projects to authenticated;
-- Member-created tasks do not mint leaderboard credit. Existing scores are preserved.
alter table public.org_tasks add column points_eligible boolean not null default true;
create function org_private.task_credit() returns trigger language plpgsql set search_path='' as $$
begin new.points_eligible=(org_private.admin() or current_user='service_role') and exists(select 1 from public.organization_settings where organization_id=new.organization_id and gamification_enabled); return new; end $$;
revoke all on function org_private.task_credit() from public,anon;
grant execute on function org_private.task_credit() to authenticated;
create trigger task_credit before insert on public.org_tasks for each row execute function org_private.task_credit();
alter function org_private.leaderboard_projection(text,jsonb) rename to legacy_leaderboard_projection;
create function org_private.leaderboard_projection(entity text,row_data jsonb) returns jsonb language sql immutable set search_path='' as $$
 select org_private.legacy_leaderboard_projection(entity,row_data)||case when entity='org_tasks' then jsonb_build_object('points_eligible',coalesce(row_data->'points_eligible','true'::jsonb)) else '{}'::jsonb end
$$;
revoke all on function org_private.leaderboard_projection(text,jsonb) from public,anon;
grant execute on function org_private.leaderboard_projection(text,jsonb),org_private.legacy_leaderboard_projection(text,jsonb) to authenticated,service_role;
create or replace function org_private.leaderboard_rows(entity_name text,cutoff timestamptz) returns setof jsonb language sql stable set search_path='' as $$
 select data from (select distinct on(record_key) record_key,data from org_private.leaderboard_events where organization_id=org_private.workspace_id() and entity=entity_name and recorded_at<cutoff order by record_key,recorded_at desc,sequence desc) latest where data is not null and (entity_name<>'org_tasks' or data->>'points_eligible' is distinct from 'false')
$$;
create policy attendance_feature_insert on public.org_attendance as restrictive for insert to authenticated with check(org_private.admin() or exists(select 1 from public.organization_settings where organization_id=org_private.workspace_id() and attendance_enabled));
create policy attendance_feature_update on public.org_attendance as restrictive for update to authenticated using(org_private.admin() or exists(select 1 from public.organization_settings where organization_id=org_private.workspace_id() and attendance_enabled)) with check(org_private.admin() or exists(select 1 from public.organization_settings where organization_id=org_private.workspace_id() and attendance_enabled));
-- Derive append-only evidence ownership from the business row, including service imports.
create or replace function org_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.org_audit(organization_id,entity,record_id,actor_id,action,old_data,new_data) values(new.organization_id,tg_table_name,new.id::text,auth.uid(),tg_op,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 if tg_table_name='org_tasks' then
  insert into public.org_task_history(organization_id,task_id,member_id,actor_id,changes,old_status,new_status)
  values(new.organization_id,new.id,new.assignee_id,auth.uid(),jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) end,'after',to_jsonb(new)),case when tg_op='UPDATE' then old.status end,new.status);
 end if;
 return new;
end $$;
create or replace function org_private.stamp_task_history_actor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.actor_id is distinct from auth.uid() then raise exception 'Task history actor must match writer' using errcode='42501'; end if;
 select m.name into new.actor_name from public.members m where m.id=org_private.member_id() and m.organization_id=new.organization_id;
 return new;
end $$;
do $$ declare source text; begin
 source=pg_get_functiondef('org_private.capture_leaderboard()'::regprocedure);
 source=replace(source,'leaderboard_events(entity,record_key,data) values(','leaderboard_events(organization_id,entity,record_key,data) values((row_data->>''organization_id'')::uuid,');
 execute source;
 source=pg_get_functiondef('org_private.audit_membership()'::regprocedure);
 source=replace(source,'org_project_membership_history(project_id,member_id,actor_id,action)','org_project_membership_history(organization_id,project_id,member_id,actor_id,action)');
 source=replace(source,'values(old.project_id','values(old.organization_id,old.project_id');
 source=replace(source,'values(new.project_id','values(new.organization_id,new.project_id');
 execute source;
 source=pg_get_functiondef('public.org_leaderboard_source(timestamptz)'::regprocedure);
 source=replace(source,'result=public.org_leaderboard_source_without_timer(cutoff);',$s$result=public.org_leaderboard_source_without_timer(cutoff);
 if org_private.workspace_id()<>'00000000-0000-4000-8000-000000000001' then
  result=jsonb_set(result,'{coverageStartedAt}',to_jsonb((select created_at from public.organizations where id=org_private.workspace_id())));
 end if;$s$);
 execute source;
end $$;
create trigger a_workspace_guard before insert or update on public.organization_members for each row execute function org_private.tenant_guard();
create function org_private.workspace_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.name is distinct from old.name then update public.organizations set name=new.name,updated_at=clock_timestamp() where id=new.organization_id; end if;
 return new;
end $$;
revoke all on function org_private.workspace_name() from public,anon,authenticated;
create trigger sync_workspace_name after update of name on public.org_settings for each row execute function org_private.workspace_name();
-- Keep privileged implementations in the private schema. Public RPCs are invokers.
alter function public.wemry_workspaces() set schema org_private;
alter function public.wemry_create_workspace(text,text,text,text,text) set schema org_private;
alter function public.wemry_workspace_command(text,jsonb) set schema org_private;
alter function public.wemry_presence(uuid,boolean,boolean) set schema org_private;
alter function public.wemry_member_directory() set schema org_private;
create function public.wemry_workspaces() returns jsonb language sql stable security invoker set search_path='' as $$ select org_private.wemry_workspaces() $$;
create function public.wemry_create_workspace(p_name text,p_description text default '',p_type text default 'other',p_logo text default '',p_accent text default '#5267df') returns uuid language sql security invoker set search_path='' as $$ select org_private.wemry_create_workspace(p_name,p_description,p_type,p_logo,p_accent) $$;
create function public.wemry_workspace_command(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select org_private.wemry_workspace_command(p_action,p_data) $$;
create function public.wemry_presence(p_connection uuid,p_active boolean default false,p_disconnect boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select org_private.wemry_presence(p_connection,p_active,p_disconnect) $$;
create function public.wemry_member_directory() returns table(id uuid,name text,user_id uuid,role text) language sql stable security invoker set search_path='' as $$ select * from org_private.wemry_member_directory() $$;
revoke all on function public.wemry_workspaces(),public.wemry_create_workspace(text,text,text,text,text),public.wemry_workspace_command(text,jsonb),public.wemry_presence(uuid,boolean,boolean),public.wemry_member_directory() from public,anon;
grant execute on function public.wemry_workspaces(),public.wemry_create_workspace(text,text,text,text,text),public.wemry_workspace_command(text,jsonb),public.wemry_presence(uuid,boolean,boolean),public.wemry_member_directory() to authenticated;
commit;
