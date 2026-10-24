-- Single organization backend. Existing workspaces and their JSON payloads are untouched.
create schema if not exists org_private;
revoke all on schema org_private from public, anon;
grant usage on schema org_private to authenticated, service_role;

create table if not exists public.members (
 id uuid primary key default gen_random_uuid(), name text not null, email text unique not null,
 tier text not null check(tier in ('GO!','Impact','Core')), weekly_hours numeric not null check(weekly_hours>0),
 is_admin boolean not null default false, auth_user_id uuid unique references auth.users(id) on delete set null,
 series text not null default ''
);
create unique index if not exists members_normalized_email on public.members(lower(btrim(email)));
create table org_private.access (
 email text primary key check(email=lower(btrim(email))),
 role text not null check(role in ('MEMBER','ADMIN','SUPERADMIN')),
 disabled boolean not null default false,
 member_id uuid unique references public.members(id),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table org_private.access enable row level security;
insert into org_private.access(email,role,member_id,auth_user_id)
 select lower(btrim(email)),case when is_admin then 'ADMIN' else 'MEMBER' end,id,auth_user_id from public.members;

create function org_private.identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('user_id',u.id,'email',a.email,'role',a.role,'member_id',a.member_id)
 from auth.users u join org_private.access a on a.email=lower(btrim(u.email))
 where u.id=(select auth.uid()) and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and not a.disabled and (a.auth_user_id is null or a.auth_user_id=u.id)
 and (u.banned_until is null or u.banned_until < now())
$$;
create function org_private.role() returns text language sql stable security invoker set search_path='' as $$ select org_private.identity()->>'role' $$;
create function org_private.member_id() returns uuid language sql stable security invoker set search_path='' as $$ select (org_private.identity()->>'member_id')::uuid $$;
create function org_private.admin() returns boolean language sql stable security invoker set search_path='' as $$ select coalesce(org_private.role() in ('ADMIN','SUPERADMIN'),false) $$;
create function org_private.link_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and not coalesce(new.is_anonymous,false) then
  update org_private.access set auth_user_id=new.id where email=lower(btrim(new.email)) and (auth_user_id is null or auth_user_id=new.id);
  update public.members set auth_user_id=new.id where lower(btrim(email))=lower(btrim(new.email)) and (auth_user_id is null or auth_user_id=new.id);
 end if;
 return new;
end $$;
create trigger org_link_verified_auth after insert or update of email,email_confirmed_at on auth.users for each row execute function org_private.link_identity();
-- Backfill only verified email matches; signup metadata is never consulted.
update public.members m set auth_user_id=u.id from auth.users u where lower(btrim(m.email))=lower(btrim(u.email)) and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and m.auth_user_id is null;
update org_private.access a set auth_user_id=m.auth_user_id from public.members m where m.id=a.member_id;

create table public.org_projects (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 160),
 description text not null default '' check(length(description)<=5000), status text not null default 'planning' check(status in ('planning','active','done','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid default auth.uid() references auth.users(id), import_key text unique
);
create table public.org_project_members (
 project_id uuid references public.org_projects(id) on delete cascade, member_id uuid references public.members(id),
 created_at timestamptz not null default now(), primary key(project_id,member_id)
);
create index org_project_members_member on public.org_project_members(member_id);
create function org_private.project_access(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select org_private.admin() or exists(select 1 from public.org_project_members where project_id=p and member_id=org_private.member_id())
$$;
create table public.org_tasks (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.org_projects(id),
 title text not null check(length(btrim(title)) between 1 and 200), description text not null default '' check(length(description)<=5000),
 assignee_id uuid references public.members(id), status text not null default 'todo' check(status in ('todo','in_progress','in_review','done')),
 priority text not null default 'medium' check(priority in ('low','medium','high','urgent')), due_date date,
 archived boolean not null default false, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid default auth.uid() references auth.users(id)
);
create index org_tasks_project on public.org_tasks(project_id);
create index org_tasks_assignee_status on public.org_tasks(assignee_id,status);
create index org_tasks_due on public.org_tasks(due_date) where not archived and status<>'done';
create table public.org_task_history (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.org_tasks(id), member_id uuid references public.members(id),
 actor_id uuid references auth.users(id), changes jsonb not null, old_status text, new_status text,
 occurred_at timestamptz not null default now()
);
create index org_task_history_task on public.org_task_history(task_id);
create index org_task_history_member_time on public.org_task_history(member_id,occurred_at);
create table public.org_work_entries (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), project_id uuid references public.org_projects(id),
 date date not null, hours numeric not null check(hours between 0.25 and 24 and mod(hours,0.25)=0),
 description text not null default '' check(length(description)<=2000), deleted boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), import_key text unique
);
create index org_work_member_date on public.org_work_entries(member_id,date);
create index org_work_project on public.org_work_entries(project_id);
create table public.org_meetings (
 id uuid primary key default gen_random_uuid(), calendar_id text not null, google_event_id text not null,
 ical_uid text, recurring_event_id text, original_start text,
 title text not null, description text not null default '', series text not null default '',
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 timezone text not null default 'Europe/Ljubljana', all_day boolean not null default false,
 location text not null default '', meeting_url text not null default '', cancelled boolean not null default false,
 synced_at timestamptz not null default now(), unique(calendar_id,google_event_id)
);
create index org_meetings_time on public.org_meetings(starts_at);
create table public.org_meeting_members (
 meeting_id uuid references public.org_meetings(id) on delete cascade, member_id uuid references public.members(id), primary key(meeting_id,member_id)
);
create index org_meeting_members_member on public.org_meeting_members(member_id);
create function org_private.eligible(meeting uuid) returns boolean language sql stable security definer set search_path='' as $$
 select org_private.admin() or exists(select 1 from public.org_meetings e join public.members m on m.id=org_private.member_id()
 where e.id=meeting and (e.series='Community' or e.series=any(regexp_split_to_array(m.series,'\s*;\s*')) or exists(select 1 from public.org_meeting_members em where em.meeting_id=e.id and em.member_id=m.id)))
$$;
create table public.org_attendance (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.org_meetings(id), member_id uuid not null references public.members(id),
 status text not null check(status in ('present','remote','excused','unexcused')), note text not null default '' check(length(note)<=2000),
 recorded_by uuid default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 import_key text unique, unique(meeting_id,member_id)
);
create index org_attendance_member on public.org_attendance(member_id);
create table public.org_audit (
 id uuid primary key default gen_random_uuid(), entity text not null, record_id text not null,
 actor_id uuid references auth.users(id), action text not null, old_data jsonb, new_data jsonb, occurred_at timestamptz not null default now()
);
create index org_audit_time on public.org_audit(occurred_at);
create table public.org_settings (
 id boolean primary key default true check(id), name text not null default 'Shapers OS' check(length(name) between 1 and 80),
 calendar_id text not null default '' check(length(calendar_id)<=500), timezone text not null default 'Europe/Ljubljana' check(timezone='Europe/Ljubljana'), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.org_settings default values;

create or replace function org_private.project_access(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select org_private.admin() or exists(select 1 from public.org_project_members where project_id=p and member_id=org_private.member_id()) or exists(select 1 from public.org_tasks where project_id=p and assignee_id=org_private.member_id())
$$;
create function org_private.guard_changes() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then new.updated_at=clock_timestamp(); new.created_at=old.created_at; end if;
 if tg_table_name='org_tasks' then
  if tg_op='UPDATE' and not org_private.admin() and
   (to_jsonb(new)-array['status','description','updated_at','completed_at']) is distinct from (to_jsonb(old)-array['status','description','updated_at','completed_at']) then
   raise exception 'Only administrators can assign, rename, archive or reprioritize tasks' using errcode='42501';
  end if;
  if tg_op='INSERT' then new.completed_at=case when new.status='done' then now() else null end;
  elsif new.status is distinct from old.status then new.completed_at=case when new.status='done' then now() else null end;
  else new.completed_at=old.completed_at; end if;
 end if;
 if tg_table_name='org_attendance' then
  if not org_private.admin() and not exists(select 1 from public.org_meetings e where e.id=new.meeting_id and not e.cancelled and not e.all_day and now() between e.starts_at-interval '30 minutes' and e.ends_at+interval '2 hours' and org_private.eligible(e.id)) then
   raise exception 'Self check-in is outside the permitted meeting window' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (new.meeting_id<>old.meeting_id or new.member_id<>old.member_id) then raise exception 'Attendance identity is immutable'; end if;
  new.recorded_by=auth.uid();
 end if;
 if tg_table_name='org_work_entries' then
  if new.date>(now() at time zone 'Europe/Ljubljana')::date then raise exception 'Future work entries are not permitted'; end if;
  if tg_op='UPDATE' and new.member_id<>old.member_id then raise exception 'Work owner is immutable'; end if;
 end if;
 return new;
end $$;
create function org_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.org_audit(entity,record_id,actor_id,action,old_data,new_data) values(tg_table_name,new.id::text,auth.uid(),tg_op,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 if tg_table_name='org_tasks' then
  insert into public.org_task_history(task_id,member_id,actor_id,changes,old_status,new_status)
  values(new.id,new.assignee_id,auth.uid(),jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) end,'after',to_jsonb(new)),case when tg_op='UPDATE' then old.status end,new.status);
 end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['org_projects','org_tasks','org_work_entries','org_attendance','org_settings'] loop
  execute format('create trigger org_guard before insert or update on public.%I for each row execute function org_private.guard_changes()',t);
  execute format('create trigger org_audit after insert or update on public.%I for each row execute function org_private.audit_change()',t);
 end loop;
end $$;

-- Internal helpers are not exposed RPCs. All public wrappers run as the caller.
create function public.org_context() returns jsonb language sql stable security invoker set search_path='' as $$ select org_private.identity() $$;
revoke all on function public.org_context() from public,anon;
grant execute on function public.org_context() to authenticated;
-- Replace legacy exposed SECURITY DEFINER helpers without breaking existing policies.
create or replace function public.current_member_id() returns uuid language sql stable security invoker set search_path='' as $$ select org_private.member_id() $$;
create or replace function public.current_is_admin() returns boolean language sql stable security invoker set search_path='' as $$ select org_private.admin() $$;
revoke all on function public.current_member_id(),public.current_is_admin() from public,anon;
grant execute on function public.current_member_id(),public.current_is_admin() to authenticated;

alter table public.members enable row level security;
drop policy if exists "members read own or admin" on public.members;
create policy org_member_read on public.members for select to authenticated using(id=(select org_private.member_id()) or (select org_private.admin()));
create policy org_member_update on public.members for update to authenticated using(id=(select org_private.member_id())) with check(id=(select org_private.member_id()));
revoke all on public.members from anon,authenticated;
grant select on public.members to authenticated;
grant update(name) on public.members to authenticated;

do $$ declare t text; begin
 foreach t in array array['org_projects','org_project_members','org_tasks','org_task_history','org_work_entries','org_meetings','org_meeting_members','org_attendance','org_audit','org_settings'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select,update on public.members to service_role;
create policy projects_read on public.org_projects for select to authenticated using(org_private.project_access(id));
create policy projects_write on public.org_projects for all to authenticated using((select org_private.admin())) with check((select org_private.admin()));
grant insert(name,description,status),update(name,description,status) on public.org_projects to authenticated;
create policy project_members_read on public.org_project_members for select to authenticated using(member_id=(select org_private.member_id()) or (select org_private.admin()));
create policy project_members_write on public.org_project_members for all to authenticated using((select org_private.admin())) with check((select org_private.admin()));
grant insert(project_id,member_id),delete on public.org_project_members to authenticated;
create policy tasks_read on public.org_tasks for select to authenticated using(assignee_id=(select org_private.member_id()) or (select org_private.admin()));
create policy tasks_insert on public.org_tasks for insert to authenticated with check((select org_private.admin()));
create policy tasks_update on public.org_tasks for update to authenticated using(assignee_id=(select org_private.member_id()) or (select org_private.admin())) with check(assignee_id=(select org_private.member_id()) or (select org_private.admin()));
grant insert(project_id,title,description,assignee_id,status,priority,due_date),update(project_id,title,description,assignee_id,status,priority,due_date,archived) on public.org_tasks to authenticated;
create policy history_read on public.org_task_history for select to authenticated using(member_id=(select org_private.member_id()) or (select org_private.admin()));
create policy work_read on public.org_work_entries for select to authenticated using(member_id=(select org_private.member_id()) or (select org_private.admin()));
create policy work_insert on public.org_work_entries for insert to authenticated with check(member_id=(select org_private.member_id()) and (project_id is null or org_private.project_access(project_id)));
create policy work_update on public.org_work_entries for update to authenticated using(member_id=(select org_private.member_id())) with check(member_id=(select org_private.member_id()) and (project_id is null or org_private.project_access(project_id)));
grant insert(member_id,project_id,date,hours,description),update(date,hours,description,project_id,deleted) on public.org_work_entries to authenticated;
create policy meetings_read on public.org_meetings for select to authenticated using(org_private.eligible(id));
create policy meeting_members_read on public.org_meeting_members for select to authenticated using(member_id=(select org_private.member_id()) or (select org_private.admin()));
create policy attendance_read on public.org_attendance for select to authenticated using(member_id=(select org_private.member_id()) or (select org_private.admin()));
create policy attendance_write on public.org_attendance for all to authenticated using(member_id=(select org_private.member_id()) or (select org_private.admin())) with check((select org_private.admin()) or (member_id=(select org_private.member_id()) and status in ('present','remote') and org_private.eligible(meeting_id)));
grant insert(meeting_id,member_id,status,note),update(status,note) on public.org_attendance to authenticated;
create policy audit_read on public.org_audit for select to authenticated using((select org_private.role())='SUPERADMIN');
create policy settings_read on public.org_settings for select to authenticated using((select org_private.role()) is not null);
create policy settings_update on public.org_settings for update to authenticated using((select org_private.role())='SUPERADMIN') with check((select org_private.role())='SUPERADMIN');
grant update(name,calendar_id) on public.org_settings to authenticated;

create function org_private.set_access(target_email text,new_role text,is_disabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 if org_private.role() is distinct from 'SUPERADMIN' then raise exception 'SUPERADMIN required' using errcode='42501'; end if;
 if new_role not in ('MEMBER','ADMIN','SUPERADMIN') then raise exception 'Invalid role'; end if;
 perform pg_advisory_xact_lock(hashtext('org_access_change'));
 select to_jsonb(a) into previous from org_private.access a where email=lower(btrim(target_email));
 if previous is null then raise exception 'Unknown approved account'; end if;
 if previous->>'role'='SUPERADMIN' and (new_role<>'SUPERADMIN' or is_disabled) and
  (select count(*) from org_private.access where role='SUPERADMIN' and not disabled)<=1 then raise exception 'Cannot remove the last superadmin'; end if;
 update org_private.access set role=new_role,disabled=is_disabled where email=lower(btrim(target_email));
 insert into public.org_audit(entity,record_id,actor_id,action,old_data,new_data) values('access',lower(btrim(target_email)),auth.uid(),'UPDATE',previous,jsonb_build_object('role',new_role,'disabled',is_disabled));
end $$;
create function public.org_set_access(target_email text,new_role text,is_disabled boolean) returns void language sql security invoker set search_path='' as $$ select org_private.set_access(target_email,new_role,is_disabled) $$;
create function org_private.list_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if org_private.role() is distinct from 'SUPERADMIN' then raise exception 'SUPERADMIN required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(a)),'[]') from org_private.access a);
end $$;
create function public.org_list_access() returns jsonb language sql stable security invoker set search_path='' as $$ select org_private.list_access() $$;
revoke all on all functions in schema org_private from public,anon,authenticated;
grant execute on function org_private.identity(),org_private.role(),org_private.member_id(),org_private.admin(),org_private.project_access(uuid),org_private.eligible(uuid),org_private.guard_changes(),org_private.set_access(text,text,boolean),org_private.list_access() to authenticated;
revoke all on function public.org_set_access(text,text,boolean),public.org_list_access() from public,anon;
grant execute on function public.org_set_access(text,text,boolean),public.org_list_access() to authenticated;
