SET check_function_bodies=off;
-- Schema-only baseline captured from ShapersOS on 2026-10-24. No production data or credentials.
-- Used only by isolated migration/RLS tests; never apply this file to the production project.
CREATE TABLE public.org_projects (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'planning'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT auth.uid(),
  "import_key" text
);
CREATE TABLE public.org_tasks (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "assignee_id" uuid,
  "status" text DEFAULT 'todo'::text NOT NULL,
  "priority" text DEFAULT 'medium'::text NOT NULL,
  "due_date" date,
  "archived" boolean DEFAULT false NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT auth.uid()
);
CREATE TABLE public.org_task_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "member_id" uuid,
  "actor_id" uuid,
  "changes" jsonb NOT NULL,
  "old_status" text,
  "new_status" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.org_work_entries (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL,
  "project_id" uuid,
  "date" date NOT NULL,
  "hours" numeric NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "import_key" text
);
CREATE TABLE public.org_meetings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "calendar_id" text NOT NULL,
  "google_event_id" text NOT NULL,
  "ical_uid" text,
  "recurring_event_id" text,
  "original_start" text,
  "title" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "series" text DEFAULT ''::text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "timezone" text DEFAULT 'Europe/Ljubljana'::text NOT NULL,
  "all_day" boolean DEFAULT false NOT NULL,
  "location" text DEFAULT ''::text NOT NULL,
  "meeting_url" text DEFAULT ''::text NOT NULL,
  "cancelled" boolean DEFAULT false NOT NULL,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.org_meeting_members (
  "meeting_id" uuid NOT NULL,
  "member_id" uuid NOT NULL
);
CREATE TABLE public.org_attendance (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "meeting_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "status" text NOT NULL,
  "note" text DEFAULT ''::text NOT NULL,
  "recorded_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "import_key" text
);
CREATE TABLE public.org_audit (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entity" text NOT NULL,
  "record_id" text NOT NULL,
  "actor_id" uuid,
  "action" text NOT NULL,
  "old_data" jsonb,
  "new_data" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.org_settings (
  "id" boolean DEFAULT true NOT NULL,
  "name" text DEFAULT 'Shapers OS'::text NOT NULL,
  "calendar_id" text DEFAULT ''::text NOT NULL,
  "timezone" text DEFAULT 'Europe/Ljubljana'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.members (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "tier" text NOT NULL,
  "weekly_hours" numeric NOT NULL,
  "is_admin" boolean DEFAULT false NOT NULL,
  "auth_user_id" uuid,
  "series" text DEFAULT ''::text NOT NULL
);
CREATE TABLE public.org_project_members (
  "project_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.org_weekly_hours (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL,
  "week_start" date NOT NULL,
  "through_date" date NOT NULL,
  "hours" numeric NOT NULL,
  "source" text NOT NULL,
  "import_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE org_private.access (
  "email" text NOT NULL,
  "role" text NOT NULL,
  "disabled" boolean DEFAULT false NOT NULL,
  "member_id" uuid,
  "auth_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE org_private."access" ADD CONSTRAINT "access_auth_user_id_key" UNIQUE (auth_user_id);
ALTER TABLE org_private."access" ADD CONSTRAINT "access_pkey" PRIMARY KEY (email);
ALTER TABLE public."org_projects" ADD CONSTRAINT "org_projects_import_key_key" UNIQUE (import_key);
ALTER TABLE public."org_projects" ADD CONSTRAINT "org_projects_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_tasks" ADD CONSTRAINT "org_tasks_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_task_history" ADD CONSTRAINT "org_task_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_work_entries" ADD CONSTRAINT "org_work_entries_import_key_key" UNIQUE (import_key);
ALTER TABLE public."org_work_entries" ADD CONSTRAINT "org_work_entries_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_meetings" ADD CONSTRAINT "org_meetings_calendar_id_google_event_id_key" UNIQUE (calendar_id, google_event_id);
ALTER TABLE public."org_meetings" ADD CONSTRAINT "org_meetings_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_meeting_members" ADD CONSTRAINT "org_meeting_members_pkey" PRIMARY KEY (meeting_id, member_id);
ALTER TABLE public."org_attendance" ADD CONSTRAINT "org_attendance_import_key_key" UNIQUE (import_key);
ALTER TABLE public."org_attendance" ADD CONSTRAINT "org_attendance_meeting_id_member_id_key" UNIQUE (meeting_id, member_id);
ALTER TABLE public."org_attendance" ADD CONSTRAINT "org_attendance_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_audit" ADD CONSTRAINT "org_audit_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_settings" ADD CONSTRAINT "org_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."members" ADD CONSTRAINT "members_auth_user_id_key" UNIQUE (auth_user_id);
ALTER TABLE public."members" ADD CONSTRAINT "members_email_key" UNIQUE (email);
ALTER TABLE public."members" ADD CONSTRAINT "members_pkey" PRIMARY KEY (id);
ALTER TABLE public."org_project_members" ADD CONSTRAINT "org_project_members_pkey" PRIMARY KEY (project_id, member_id);
ALTER TABLE public."org_weekly_hours" ADD CONSTRAINT "org_weekly_hours_import_key_key" UNIQUE (import_key);
ALTER TABLE public."org_weekly_hours" ADD CONSTRAINT "org_weekly_hours_member_id_week_start_key" UNIQUE (member_id, week_start);
ALTER TABLE public."org_weekly_hours" ADD CONSTRAINT "org_weekly_hours_pkey" PRIMARY KEY (id);
ALTER TABLE org_private."access" ADD CONSTRAINT "access_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE org_private."access" ADD CONSTRAINT "access_email_check" CHECK ((email = lower(btrim(email))));
ALTER TABLE org_private."access" ADD CONSTRAINT "access_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE org_private."access" ADD CONSTRAINT "access_role_check" CHECK ((role = ANY (ARRAY['MEMBER'::text, 'ADMIN'::text, 'SUPERADMIN'::text])));
ALTER TABLE public."org_projects" ADD CONSTRAINT "org_projects_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."org_projects" ADD CONSTRAINT "org_projects_description_check" CHECK ((length(description) <= 5000));
ALTER TABLE public."org_projects" ADD CONSTRAINT "org_projects_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 160)));
ALTER TABLE public."org_projects" ADD CONSTRAINT "org_projects_status_check" CHECK ((status = ANY (ARRAY['planning'::text, 'active'::text, 'done'::text, 'archived'::text])));
ALTER TABLE public."org_tasks" ADD CONSTRAINT "org_tasks_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES members(id);
ALTER TABLE public."org_tasks" ADD CONSTRAINT "org_tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."org_tasks" ADD CONSTRAINT "org_tasks_description_check" CHECK ((length(description) <= 5000));
ALTER TABLE public."org_tasks" ADD CONSTRAINT "org_tasks_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE public."org_tasks" ADD CONSTRAINT "org_tasks_project_id_fkey" FOREIGN KEY (project_id) REFERENCES org_projects(id);
ALTER TABLE public."org_tasks" ADD CONSTRAINT "org_tasks_status_check" CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'in_review'::text, 'done'::text])));
ALTER TABLE public."org_tasks" ADD CONSTRAINT "org_tasks_title_check" CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 200)));
ALTER TABLE public."org_task_history" ADD CONSTRAINT "org_task_history_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE public."org_task_history" ADD CONSTRAINT "org_task_history_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public."org_task_history" ADD CONSTRAINT "org_task_history_task_id_fkey" FOREIGN KEY (task_id) REFERENCES org_tasks(id);
ALTER TABLE public."org_work_entries" ADD CONSTRAINT "org_work_entries_description_check" CHECK ((length(description) <= 2000));
ALTER TABLE public."org_work_entries" ADD CONSTRAINT "org_work_entries_hours_check" CHECK ((((hours >= 0.25) AND (hours <= (24)::numeric)) AND (mod(hours, 0.25) = (0)::numeric)));
ALTER TABLE public."org_work_entries" ADD CONSTRAINT "org_work_entries_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public."org_work_entries" ADD CONSTRAINT "org_work_entries_project_id_fkey" FOREIGN KEY (project_id) REFERENCES org_projects(id);
ALTER TABLE public."org_meetings" ADD CONSTRAINT "org_meetings_check" CHECK ((ends_at > starts_at));
ALTER TABLE public."org_meeting_members" ADD CONSTRAINT "org_meeting_members_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES org_meetings(id) ON DELETE CASCADE;
ALTER TABLE public."org_meeting_members" ADD CONSTRAINT "org_meeting_members_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public."org_attendance" ADD CONSTRAINT "org_attendance_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES org_meetings(id);
ALTER TABLE public."org_attendance" ADD CONSTRAINT "org_attendance_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public."org_attendance" ADD CONSTRAINT "org_attendance_note_check" CHECK ((length(note) <= 2000));
ALTER TABLE public."org_attendance" ADD CONSTRAINT "org_attendance_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
ALTER TABLE public."org_attendance" ADD CONSTRAINT "org_attendance_status_check" CHECK ((status = ANY (ARRAY['present'::text, 'remote'::text, 'excused'::text, 'unexcused'::text])));
ALTER TABLE public."org_audit" ADD CONSTRAINT "org_audit_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE public."org_settings" ADD CONSTRAINT "org_settings_calendar_id_check" CHECK ((length(calendar_id) <= 500));
ALTER TABLE public."org_settings" ADD CONSTRAINT "org_settings_id_check" CHECK (id);
ALTER TABLE public."org_settings" ADD CONSTRAINT "org_settings_name_check" CHECK (((length(name) >= 1) AND (length(name) <= 80)));
ALTER TABLE public."org_settings" ADD CONSTRAINT "org_settings_timezone_check" CHECK ((timezone = 'Europe/Ljubljana'::text));
ALTER TABLE public."members" ADD CONSTRAINT "members_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."members" ADD CONSTRAINT "members_tier_check" CHECK ((tier = ANY (ARRAY['GO!'::text, 'Impact'::text, 'Core'::text])));
ALTER TABLE public."members" ADD CONSTRAINT "members_weekly_hours_check" CHECK ((weekly_hours > (0)::numeric));
ALTER TABLE public."org_project_members" ADD CONSTRAINT "org_project_members_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public."org_project_members" ADD CONSTRAINT "org_project_members_project_id_fkey" FOREIGN KEY (project_id) REFERENCES org_projects(id) ON DELETE CASCADE;
ALTER TABLE public."org_weekly_hours" ADD CONSTRAINT "org_weekly_hours_check" CHECK (((through_date >= week_start) AND (through_date < (week_start + 7))));
ALTER TABLE public."org_weekly_hours" ADD CONSTRAINT "org_weekly_hours_hours_check" CHECK ((((hours >= (0)::numeric) AND (hours <= (168)::numeric)) AND (mod(hours, 0.25) = (0)::numeric)));
ALTER TABLE public."org_weekly_hours" ADD CONSTRAINT "org_weekly_hours_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public."org_weekly_hours" ADD CONSTRAINT "org_weekly_hours_week_start_check" CHECK ((EXTRACT(isodow FROM week_start) = (1)::numeric));
CREATE OR REPLACE FUNCTION org_private.link_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.email_confirmed_at is not null and not coalesce(new.is_anonymous,false) then
  update org_private.access set auth_user_id=new.id where email=lower(btrim(new.email)) and (auth_user_id is null or auth_user_id=new.id);
  update public.members set auth_user_id=new.id where lower(btrim(email))=lower(btrim(new.email)) and (auth_user_id is null or auth_user_id=new.id);
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION org_private.member_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select (org_private.identity()->>'member_id')::uuid $function$
;
CREATE OR REPLACE FUNCTION org_private.admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select coalesce(org_private.role() in ('ADMIN','SUPERADMIN'),false) $function$
;
CREATE OR REPLACE FUNCTION org_private.project_access(p uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select org_private.admin() or exists(select 1 from public.org_project_members where project_id=p and member_id=org_private.member_id()) or exists(select 1 from public.org_tasks where project_id=p and assignee_id=org_private.member_id())
$function$
;
CREATE OR REPLACE FUNCTION public.org_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select org_private.identity() $function$
;
CREATE OR REPLACE FUNCTION org_private.audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 insert into public.org_audit(entity,record_id,actor_id,action,old_data,new_data) values(tg_table_name,new.id::text,auth.uid(),tg_op,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 if tg_table_name='org_tasks' then
  insert into public.org_task_history(task_id,member_id,actor_id,changes,old_status,new_status)
  values(new.id,new.assignee_id,auth.uid(),jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) end,'after',to_jsonb(new)),case when tg_op='UPDATE' then old.status end,new.status);
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION org_private.identity()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('user_id',u.id,'email',a.email,'role',a.role,'member_id',a.member_id)
 from auth.users u join org_private.access a on a.email=lower(btrim(u.email))
 where u.id=(select auth.uid()) and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and not a.disabled and (a.auth_user_id is null or a.auth_user_id=u.id)
 and (u.banned_until is null or u.banned_until < now())
$function$
;
CREATE OR REPLACE FUNCTION org_private.role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select org_private.identity()->>'role' $function$
;
CREATE OR REPLACE FUNCTION org_private.eligible(meeting uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select org_private.admin() or exists(select 1 from public.org_meetings e join public.members m on m.id=org_private.member_id()
 where e.id=meeting and (e.series='Community' or e.series=any(regexp_split_to_array(m.series,'\s*;\s*')) or exists(select 1 from public.org_meeting_members em where em.meeting_id=e.id and em.member_id=m.id)))
$function$
;
CREATE OR REPLACE FUNCTION org_private.set_access(target_email text, new_role text, is_disabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION org_private.bootstrap_access(emails text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare address text; changed integer=0;
begin
 if cardinality(emails) not between 1 and 10 then raise exception 'Explicit list of 1-10 administrators required';end if;
 foreach address in array emails loop
  address=lower(btrim(address));
  if address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or address like '%@sandbox.example' then raise exception 'Use explicitly approved real operator addresses';end if;
  insert into org_private.access(email,role,auth_user_id) values(address,'SUPERADMIN',(select id from auth.users where lower(btrim(email))=address and email_confirmed_at is not null and not coalesce(is_anonymous,false))) on conflict(email) do update set role='SUPERADMIN',disabled=false;
  insert into public.org_audit(entity,record_id,action,new_data) values('access',address,'EXPLICIT_OWNER_BOOTSTRAP','{"role":"SUPERADMIN"}');
  changed=changed+1;
 end loop;
 return changed;
end $function$
;
CREATE OR REPLACE FUNCTION org_private.work_daily_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare existing numeric;
begin
 if new.deleted then return new;end if;
 perform pg_advisory_xact_lock(hashtext(new.member_id::text||new.date::text));
 select coalesce(sum(hours),0) into existing from public.org_work_entries where member_id=new.member_id and date=new.date and id<>new.id and not deleted;
 if existing+new.hours>24 then raise exception 'Daily hours exceed 24' using errcode='23514';end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION org_private.guard_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION org_private.list_access()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if org_private.role() is distinct from 'SUPERADMIN' then raise exception 'SUPERADMIN required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(a)),'[]') from org_private.access a);
end $function$
;
CREATE OR REPLACE FUNCTION public.org_set_access(target_email text, new_role text, is_disabled boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select org_private.set_access(target_email,new_role,is_disabled) $function$
;
CREATE OR REPLACE FUNCTION public.org_list_access()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select org_private.list_access() $function$
;
CREATE OR REPLACE FUNCTION org_private.no_overlapping_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 perform pg_advisory_xact_lock(hashtext(new.member_id::text||'hours-import'));
 if tg_table_name='org_work_entries' then
  if not new.deleted and exists(select 1 from public.org_weekly_hours h where h.member_id=new.member_id and new.date between h.week_start and h.through_date) then
   raise exception 'Historical weekly aggregate already covers this date; do not double-count hours' using errcode='23514';
  end if;
 else
  if exists(select 1 from public.org_work_entries w where w.member_id=new.member_id and not w.deleted and w.date between new.week_start and new.through_date) then
   raise exception 'Daily records overlap imported weekly total' using errcode='23514';
  end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION org_private.refresh_member_access()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare changed integer;
begin
 insert into org_private.access(email,role,member_id,auth_user_id)
 select lower(btrim(email)),case when is_admin then 'ADMIN' else 'MEMBER' end,id,auth_user_id from public.members
 on conflict(email) do nothing;
 get diagnostics changed=row_count;
 return changed;
end $function$
;
CREATE OR REPLACE FUNCTION public.org_refresh_member_access()
 RETURNS integer
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select org_private.refresh_member_access() $function$
;
CREATE OR REPLACE FUNCTION public.org_bootstrap_access(emails text[])
 RETURNS integer
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select org_private.bootstrap_access(emails) $function$
;
CREATE OR REPLACE FUNCTION public.org_approve_demo_link(real_email text, sandbox_email text, approved_role text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select org_private.approve_demo_link(real_email,sandbox_email,approved_role) $function$
;
CREATE OR REPLACE FUNCTION public.org_remove_demo_link(real_email text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select org_private.remove_demo_link(real_email) $function$
;
CREATE OR REPLACE FUNCTION org_private.approve_demo_link(real_email text, sandbox_email text, approved_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.members%rowtype; account auth.users%rowtype; previous org_private.access%rowtype; base_role text;
begin
 real_email=lower(btrim(real_email));sandbox_email=lower(btrim(sandbox_email));
 if real_email like '%@sandbox.example' or real_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or sandbox_email not like '%@sandbox.example' then raise exception 'Explicit real-to-fictional sandbox mapping required';end if;
 if approved_role not in ('MEMBER','ADMIN','SUPERADMIN') or approved_role is null then raise exception 'Explicit role required';end if;
 perform pg_advisory_xact_lock(hashtext('org_access_change'));
 select * into target from public.members where lower(btrim(email))=sandbox_email;
 if not found then raise exception 'Unknown sandbox profile';end if;
 select role into base_role from org_private.access where email=sandbox_email and member_id=target.id and not disabled;
 if base_role is distinct from (case when approved_role='SUPERADMIN' then 'ADMIN' else approved_role end) then raise exception 'Sandbox profile role does not match explicit approval';end if;
 select * into account from auth.users u where lower(btrim(u.email))=real_email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now()) and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
 if not found then raise exception 'Real account must complete verified Google sign-in first';end if;
 select * into previous from org_private.access where email=real_email;
 if previous.email is not null and (previous.disabled or previous.role<>approved_role or (previous.member_id is not null and previous.member_id<>target.id) or (previous.auth_user_id is not null and previous.auth_user_id<>account.id)) then raise exception 'Existing approved access conflicts; resolve explicitly, not through demo linking';end if;
 if approved_role='SUPERADMIN' and previous.email is null then raise exception 'Demo mapping cannot create a superadmin; explicit separate bootstrap required';end if;
 if previous.member_id=target.id and previous.auth_user_id=account.id then return target.id;end if;
 insert into org_private.access(email,role,member_id,auth_user_id) values(real_email,approved_role,target.id,account.id)
 on conflict(email) do update set member_id=excluded.member_id,auth_user_id=excluded.auth_user_id;
 insert into public.org_audit(entity,record_id,action,old_data,new_data) values('access',real_email,'DEMO_LINK_APPROVED',case when previous.email is not null then to_jsonb(previous) end,jsonb_build_object('member_id',target.id,'role',approved_role));
 return target.id;
end $function$
;
CREATE OR REPLACE FUNCTION org_private.remove_demo_link(real_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous org_private.access%rowtype;
begin
 real_email=lower(btrim(real_email));perform pg_advisory_xact_lock(hashtext('org_access_change'));
 select a.* into previous from org_private.access a join public.members m on m.id=a.member_id where a.email=real_email and a.email not like '%@sandbox.example' and m.email like '%@sandbox.example';
 if not found then raise exception 'No approved real-to-sandbox mapping exists';end if;
 update org_private.access set member_id=null,disabled=(role<>'SUPERADMIN' or disabled) where email=real_email;
 insert into public.org_audit(entity,record_id,action,old_data,new_data) values('access',real_email,'DEMO_LINK_REMOVED',to_jsonb(previous),jsonb_build_object('member_id',null,'disabled',previous.role<>'SUPERADMIN' or previous.disabled));
end $function$
;
CREATE TRIGGER org_audit AFTER INSERT OR UPDATE ON public.org_projects FOR EACH ROW EXECUTE FUNCTION org_private.audit_change();
CREATE TRIGGER org_guard BEFORE INSERT OR UPDATE ON public.org_projects FOR EACH ROW EXECUTE FUNCTION org_private.guard_changes();
CREATE TRIGGER org_audit AFTER INSERT OR UPDATE ON public.org_tasks FOR EACH ROW EXECUTE FUNCTION org_private.audit_change();
CREATE TRIGGER org_guard BEFORE INSERT OR UPDATE ON public.org_tasks FOR EACH ROW EXECUTE FUNCTION org_private.guard_changes();
CREATE TRIGGER org_audit AFTER INSERT OR UPDATE ON public.org_work_entries FOR EACH ROW EXECUTE FUNCTION org_private.audit_change();
CREATE TRIGGER org_daily_cap BEFORE INSERT OR UPDATE ON public.org_work_entries FOR EACH ROW EXECUTE FUNCTION org_private.work_daily_cap();
CREATE TRIGGER org_guard BEFORE INSERT OR UPDATE ON public.org_work_entries FOR EACH ROW EXECUTE FUNCTION org_private.guard_changes();
CREATE TRIGGER org_no_overlap BEFORE INSERT OR UPDATE ON public.org_work_entries FOR EACH ROW EXECUTE FUNCTION org_private.no_overlapping_hours();
CREATE TRIGGER org_audit AFTER INSERT OR UPDATE ON public.org_attendance FOR EACH ROW EXECUTE FUNCTION org_private.audit_change();
CREATE TRIGGER org_guard BEFORE INSERT OR UPDATE ON public.org_attendance FOR EACH ROW EXECUTE FUNCTION org_private.guard_changes();
CREATE TRIGGER org_audit AFTER INSERT OR UPDATE ON public.org_settings FOR EACH ROW EXECUTE FUNCTION org_private.audit_change();
CREATE TRIGGER org_guard BEFORE INSERT OR UPDATE ON public.org_settings FOR EACH ROW EXECUTE FUNCTION org_private.guard_changes();
CREATE TRIGGER org_no_overlap BEFORE INSERT ON public.org_weekly_hours FOR EACH ROW EXECUTE FUNCTION org_private.no_overlapping_hours();
ALTER TABLE public.org_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_work_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_meeting_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_weekly_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_private.access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_insert" ON public.org_projects FOR INSERT TO authenticated WITH CHECK (( SELECT org_private.admin() AS admin));
CREATE POLICY "projects_read" ON public.org_projects FOR SELECT TO authenticated USING (org_private.project_access(id));
CREATE POLICY "projects_update" ON public.org_projects FOR UPDATE TO authenticated USING (( SELECT org_private.admin() AS admin)) WITH CHECK (( SELECT org_private.admin() AS admin));
CREATE POLICY "tasks_insert" ON public.org_tasks FOR INSERT TO authenticated WITH CHECK (( SELECT org_private.admin() AS admin));
CREATE POLICY "tasks_read" ON public.org_tasks FOR SELECT TO authenticated USING (((assignee_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin)));
CREATE POLICY "tasks_update" ON public.org_tasks FOR UPDATE TO authenticated USING (((assignee_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin))) WITH CHECK (((assignee_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin)));
CREATE POLICY "history_read" ON public.org_task_history FOR SELECT TO authenticated USING (((member_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin)));
CREATE POLICY "work_insert" ON public.org_work_entries FOR INSERT TO authenticated WITH CHECK (((member_id = ( SELECT org_private.member_id() AS member_id)) AND ((project_id IS NULL) OR org_private.project_access(project_id))));
CREATE POLICY "work_read" ON public.org_work_entries FOR SELECT TO authenticated USING (((member_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin)));
CREATE POLICY "work_update" ON public.org_work_entries FOR UPDATE TO authenticated USING ((member_id = ( SELECT org_private.member_id() AS member_id))) WITH CHECK (((member_id = ( SELECT org_private.member_id() AS member_id)) AND ((project_id IS NULL) OR org_private.project_access(project_id))));
CREATE POLICY "meetings_read" ON public.org_meetings FOR SELECT TO authenticated USING (org_private.eligible(id));
CREATE POLICY "meeting_members_read" ON public.org_meeting_members FOR SELECT TO authenticated USING (((member_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin)));
CREATE POLICY "attendance_insert" ON public.org_attendance FOR INSERT TO authenticated WITH CHECK ((( SELECT org_private.admin() AS admin) OR ((member_id = ( SELECT org_private.member_id() AS member_id)) AND (status = ANY (ARRAY['present'::text, 'remote'::text])) AND org_private.eligible(meeting_id))));
CREATE POLICY "attendance_read" ON public.org_attendance FOR SELECT TO authenticated USING (((member_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin)));
CREATE POLICY "attendance_update" ON public.org_attendance FOR UPDATE TO authenticated USING (((member_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin))) WITH CHECK ((( SELECT org_private.admin() AS admin) OR ((member_id = ( SELECT org_private.member_id() AS member_id)) AND (status = ANY (ARRAY['present'::text, 'remote'::text])) AND org_private.eligible(meeting_id))));
CREATE POLICY "audit_read" ON public.org_audit FOR SELECT TO authenticated USING ((( SELECT org_private.role() AS role) = 'SUPERADMIN'::text));
CREATE POLICY "settings_read" ON public.org_settings FOR SELECT TO authenticated USING ((( SELECT org_private.role() AS role) IS NOT NULL));
CREATE POLICY "settings_update" ON public.org_settings FOR UPDATE TO authenticated USING ((( SELECT org_private.role() AS role) = 'SUPERADMIN'::text)) WITH CHECK ((( SELECT org_private.role() AS role) = 'SUPERADMIN'::text));
CREATE POLICY "project_members_delete" ON public.org_project_members FOR DELETE TO authenticated USING (( SELECT org_private.admin() AS admin));
CREATE POLICY "project_members_insert" ON public.org_project_members FOR INSERT TO authenticated WITH CHECK (( SELECT org_private.admin() AS admin));
CREATE POLICY "project_members_read" ON public.org_project_members FOR SELECT TO authenticated USING (((member_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin)));
CREATE POLICY "org_member_read" ON public.members FOR SELECT TO authenticated USING (((id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin)));
CREATE POLICY "org_member_update" ON public.members FOR UPDATE TO authenticated USING ((id = ( SELECT org_private.member_id() AS member_id))) WITH CHECK ((id = ( SELECT org_private.member_id() AS member_id)));
CREATE POLICY "weekly_read" ON public.org_weekly_hours FOR SELECT TO authenticated USING (((member_id = ( SELECT org_private.member_id() AS member_id)) OR ( SELECT org_private.admin() AS admin)));
GRANT INSERT ON public.org_projects TO service_role;
GRANT SELECT ON public.org_projects TO service_role;
GRANT UPDATE ON public.org_projects TO service_role;
GRANT DELETE ON public.org_projects TO service_role;
GRANT TRUNCATE ON public.org_projects TO service_role;
GRANT REFERENCES ON public.org_projects TO service_role;
GRANT TRIGGER ON public.org_projects TO service_role;
GRANT SELECT ON public.org_projects TO authenticated;
GRANT INSERT ON public.org_tasks TO service_role;
GRANT SELECT ON public.org_tasks TO service_role;
GRANT UPDATE ON public.org_tasks TO service_role;
GRANT DELETE ON public.org_tasks TO service_role;
GRANT TRUNCATE ON public.org_tasks TO service_role;
GRANT REFERENCES ON public.org_tasks TO service_role;
GRANT TRIGGER ON public.org_tasks TO service_role;
GRANT SELECT ON public.org_tasks TO authenticated;
GRANT INSERT ON public.org_task_history TO service_role;
GRANT SELECT ON public.org_task_history TO service_role;
GRANT UPDATE ON public.org_task_history TO service_role;
GRANT DELETE ON public.org_task_history TO service_role;
GRANT TRUNCATE ON public.org_task_history TO service_role;
GRANT REFERENCES ON public.org_task_history TO service_role;
GRANT TRIGGER ON public.org_task_history TO service_role;
GRANT SELECT ON public.org_task_history TO authenticated;
GRANT INSERT ON public.org_work_entries TO service_role;
GRANT SELECT ON public.org_work_entries TO service_role;
GRANT UPDATE ON public.org_work_entries TO service_role;
GRANT DELETE ON public.org_work_entries TO service_role;
GRANT TRUNCATE ON public.org_work_entries TO service_role;
GRANT REFERENCES ON public.org_work_entries TO service_role;
GRANT TRIGGER ON public.org_work_entries TO service_role;
GRANT SELECT ON public.org_work_entries TO authenticated;
GRANT INSERT ON public.org_meetings TO service_role;
GRANT SELECT ON public.org_meetings TO service_role;
GRANT UPDATE ON public.org_meetings TO service_role;
GRANT DELETE ON public.org_meetings TO service_role;
GRANT TRUNCATE ON public.org_meetings TO service_role;
GRANT REFERENCES ON public.org_meetings TO service_role;
GRANT TRIGGER ON public.org_meetings TO service_role;
GRANT SELECT ON public.org_meetings TO authenticated;
GRANT INSERT ON public.org_meeting_members TO service_role;
GRANT SELECT ON public.org_meeting_members TO service_role;
GRANT UPDATE ON public.org_meeting_members TO service_role;
GRANT DELETE ON public.org_meeting_members TO service_role;
GRANT TRUNCATE ON public.org_meeting_members TO service_role;
GRANT REFERENCES ON public.org_meeting_members TO service_role;
GRANT TRIGGER ON public.org_meeting_members TO service_role;
GRANT SELECT ON public.org_meeting_members TO authenticated;
GRANT INSERT ON public.org_attendance TO service_role;
GRANT SELECT ON public.org_attendance TO service_role;
GRANT UPDATE ON public.org_attendance TO service_role;
GRANT DELETE ON public.org_attendance TO service_role;
GRANT TRUNCATE ON public.org_attendance TO service_role;
GRANT REFERENCES ON public.org_attendance TO service_role;
GRANT TRIGGER ON public.org_attendance TO service_role;
GRANT SELECT ON public.org_attendance TO authenticated;
GRANT INSERT ON public.org_audit TO service_role;
GRANT SELECT ON public.org_audit TO service_role;
GRANT UPDATE ON public.org_audit TO service_role;
GRANT DELETE ON public.org_audit TO service_role;
GRANT TRUNCATE ON public.org_audit TO service_role;
GRANT REFERENCES ON public.org_audit TO service_role;
GRANT TRIGGER ON public.org_audit TO service_role;
GRANT SELECT ON public.org_audit TO authenticated;
GRANT INSERT ON public.org_settings TO service_role;
GRANT SELECT ON public.org_settings TO service_role;
GRANT UPDATE ON public.org_settings TO service_role;
GRANT DELETE ON public.org_settings TO service_role;
GRANT TRUNCATE ON public.org_settings TO service_role;
GRANT REFERENCES ON public.org_settings TO service_role;
GRANT TRIGGER ON public.org_settings TO service_role;
GRANT SELECT ON public.org_settings TO authenticated;
GRANT INSERT ON public.members TO service_role;
GRANT SELECT ON public.members TO service_role;
GRANT UPDATE ON public.members TO service_role;
GRANT DELETE ON public.members TO service_role;
GRANT TRUNCATE ON public.members TO service_role;
GRANT REFERENCES ON public.members TO service_role;
GRANT TRIGGER ON public.members TO service_role;
GRANT SELECT ON public.members TO authenticated;
GRANT INSERT ON public.org_project_members TO service_role;
GRANT SELECT ON public.org_project_members TO service_role;
GRANT UPDATE ON public.org_project_members TO service_role;
GRANT DELETE ON public.org_project_members TO service_role;
GRANT TRUNCATE ON public.org_project_members TO service_role;
GRANT REFERENCES ON public.org_project_members TO service_role;
GRANT TRIGGER ON public.org_project_members TO service_role;
GRANT SELECT ON public.org_project_members TO authenticated;
GRANT DELETE ON public.org_project_members TO authenticated;
GRANT INSERT ON public.org_weekly_hours TO service_role;
GRANT SELECT ON public.org_weekly_hours TO service_role;
GRANT UPDATE ON public.org_weekly_hours TO service_role;
GRANT DELETE ON public.org_weekly_hours TO service_role;
GRANT TRUNCATE ON public.org_weekly_hours TO service_role;
GRANT REFERENCES ON public.org_weekly_hours TO service_role;
GRANT TRIGGER ON public.org_weekly_hours TO service_role;
GRANT SELECT ON public.org_weekly_hours TO authenticated;
GRANT UPDATE ("name") ON public.members TO authenticated;
-- Column grants are taken from the checked-in organization backend migration.
grant insert(name,description,status),update(name,description,status) on public.org_projects to authenticated;
grant insert(project_id,member_id) on public.org_project_members to authenticated;
grant insert(project_id,title,description,assignee_id,status,priority,due_date),update(project_id,title,description,assignee_id,status,priority,due_date,archived) on public.org_tasks to authenticated;
grant insert(member_id,project_id,date,hours,description),update(date,hours,description,project_id,deleted) on public.org_work_entries to authenticated;
grant insert(meeting_id,member_id,status,note),update(status,note) on public.org_attendance to authenticated;
grant update(name,calendar_id) on public.org_settings to authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA org_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION org_private.member_id() TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.admin() TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.project_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.identity() TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.role() TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.eligible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.set_access(text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.list_access() TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.guard_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.work_daily_cap() TO authenticated;
GRANT EXECUTE ON FUNCTION org_private.no_overlapping_hours() TO authenticated;
REVOKE ALL ON FUNCTION public.org_context() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_set_access(text,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_list_access() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_refresh_member_access() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.org_bootstrap_access(text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.org_approve_demo_link(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.org_remove_demo_link(text) FROM PUBLIC,anon,authenticated;


SET check_function_bodies=on;
GRANT EXECUTE ON FUNCTION public.org_context(),public.org_list_access(),public.org_set_access(text,text,boolean) TO authenticated;
