-- Live work uses the existing members/access, daily ledger, history and analytics.
-- No historical weekly aggregates or old rows are rewritten.
-- Refuse a partial rollout that would leave administrative history mutable.
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.org_audit'::regclass
  and tgname='org_audit_immutable' and tgenabled<>'D') or
  not exists(select 1 from pg_trigger where tgrelid='public.org_audit'::regclass
  and tgname='org_audit_no_truncate' and tgenabled<>'D') then
  raise exception 'Apply the reviewed history_audit_hardening migration before the live timer';
 end if;
end $$;

create table public.org_work_sessions (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 member_id uuid not null references public.members(id),
 project_id uuid references public.org_projects(id),
 description text not null default '' check(length(description)<=2000),
 started_at timestamptz not null,
 stopped_at timestamptz,
 state text not null check(state in ('running','paused','stopped')),
 version integer not null default 1 check(version>0),
 duration_seconds numeric,
 check ((state='stopped' and stopped_at>=started_at and duration_seconds>=0) or
        (state<>'stopped' and stopped_at is null and duration_seconds is null))
);
create unique index org_one_active_work_session on public.org_work_sessions(user_id) where state<>'stopped';
create index org_work_sessions_member on public.org_work_sessions(member_id,started_at);
create table public.org_work_segments (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.org_work_sessions(id),
 started_at timestamptz not null,
 ended_at timestamptz check(ended_at>=started_at)
);
create unique index org_one_running_segment on public.org_work_segments(session_id) where ended_at is null;
create index org_work_segments_session on public.org_work_segments(session_id,started_at);
alter table public.org_work_sessions enable row level security;
alter table public.org_work_segments enable row level security;
revoke all on public.org_work_sessions,public.org_work_segments from public,anon,authenticated,service_role;
grant select on public.org_work_sessions,public.org_work_segments to authenticated,service_role;
create policy work_sessions_read on public.org_work_sessions for select to authenticated
 using(user_id=(select auth.uid()) and member_id=(select org_private.member_id()) or (select org_private.admin()));
create policy work_segments_read on public.org_work_segments for select to authenticated
 using(exists(select 1 from public.org_work_sessions s where s.id=session_id));

alter table public.org_work_entries add column session_id uuid references public.org_work_sessions(id);
alter table public.org_work_entries add column adjustment_reason text check(length(btrim(adjustment_reason)) between 1 and 2000);
-- Timer seconds are exact; quarter-hour rounding would lose short sessions.
-- A local day can contain 25 hours at the autumn DST transition.
alter table public.org_work_entries drop constraint org_work_entries_hours_check;
alter table public.org_work_entries add constraint org_work_entries_hours_check check(hours>=0 and hours<=25);
create index org_work_entries_session on public.org_work_entries(session_id) where session_id is not null;
create or replace function org_private.work_daily_cap() returns trigger
language plpgsql security invoker set search_path='' as $$
declare existing numeric; day_limit numeric;
begin
 if new.deleted then return new; end if;
 perform pg_advisory_xact_lock(hashtext(new.member_id::text||new.date::text));
 select coalesce(sum(hours),0) into existing from public.org_work_entries where member_id=new.member_id and date=new.date and id<>new.id and not deleted;
 day_limit=extract(epoch from ((new.date+1)::timestamp at time zone 'Europe/Ljubljana')-
  (new.date::timestamp at time zone 'Europe/Ljubljana'))/3600;
 if existing+new.hours>day_limit then raise exception 'Hours exceed the length of the local day' using errcode='23514'; end if;
 return new;
end $$;
-- All mutations go through the checked RPCs, including administrators.
-- Column-level grants must also be revoked (table REVOKE alone leaves them intact).
revoke insert,update,delete,truncate,trigger,references on public.org_work_entries from public,anon,authenticated,service_role;
revoke insert(member_id,project_id,date,hours,description),update(date,hours,description,project_id,deleted)
 on public.org_work_entries from authenticated;
drop policy work_insert on public.org_work_entries;
drop policy work_update on public.org_work_entries;
-- Administrators can read work audit rows; other audit visibility is unchanged.
create policy work_audit_read on public.org_audit for select to authenticated
 using(entity='org_work_entries' and (select org_private.admin()));

-- Shared projection: split actual running intervals at Ljubljana midnights.
-- Pauses never contribute. Clipping at an instant also reconstructs a week cutoff.
create function org_private.session_work(at_time timestamptz,session_ids uuid[] default null)
returns table(id text,member_id uuid,project_id uuid,date date,hours numeric,description text,deleted boolean,session_id uuid)
language sql stable security definer set search_path='' as $$
 with intervals as (
  select s.id,s.member_id,s.project_id,s.description,g.started_at,least(coalesce(g.ended_at,at_time),at_time) finish
  from public.org_work_sessions s join public.org_work_segments g on g.session_id=s.id
  where g.started_at<at_time and (session_ids is null or s.id=any(session_ids))
 ), days as (
  select i.*,((i.started_at at time zone 'Europe/Ljubljana')::date+n) as local_day
  from intervals i cross join lateral generate_series(0,
   (i.finish at time zone 'Europe/Ljubljana')::date-(i.started_at at time zone 'Europe/Ljubljana')::date) n
 ), slices as (
  select d.*,extract(epoch from least(finish,(local_day+1)::timestamp at time zone 'Europe/Ljubljana')-
   greatest(started_at,local_day::timestamp at time zone 'Europe/Ljubljana')) seconds from days d
 )
 select id::text||':'||local_day,member_id,project_id,local_day,sum(seconds)/3600,description,false,id
 from slices where seconds>0 group by id,member_id,project_id,local_day,description
$$;
revoke all on function org_private.session_work(timestamptz,uuid[]) from public,anon,authenticated,service_role;

-- One statement/snapshot for active projections and completed entries avoids STOP races.
create function public.org_work_state() returns jsonb
language sql stable security definer set search_path='' as $$
 with actor as (select org_private.identity() identity), instant as (select statement_timestamp() at_time),
 visible_sessions as (
  select s.* from public.org_work_sessions s,actor a where s.state<>'stopped' and
   (s.member_id=(a.identity->>'member_id')::uuid or a.identity->>'role' in ('ADMIN','SUPERADMIN'))
 ), work as (
  select to_jsonb(w) row from public.org_work_entries w,actor a where
   w.member_id=(a.identity->>'member_id')::uuid or a.identity->>'role' in ('ADMIN','SUPERADMIN')
  union all
  select to_jsonb(w)||'{"provisional":true}'::jsonb from instant i
   cross join lateral org_private.session_work(i.at_time,array(select id from visible_sessions)) w
   join visible_sessions s on s.id=w.session_id
 )
 select jsonb_build_object('server_now',i.at_time,'sessions',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
 'elapsed_seconds',(select coalesce(sum(extract(epoch from least(coalesce(g.ended_at,i.at_time),i.at_time)-g.started_at)),0) from public.org_work_segments g where g.session_id=s.id))), '[]') from visible_sessions s),
 'work',(select coalesce(jsonb_agg(w.row),'[]') from work w)) from instant i
$$;
revoke all on function public.org_work_state() from public,anon,service_role;
grant execute on function public.org_work_state() to authenticated;

create function public.org_work_timer(
 p_action text,p_session_id uuid,p_expected_version integer default null,
 p_project_id uuid default null,p_description text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor jsonb; s public.org_work_sessions; instant timestamptz;
begin
 actor=org_private.identity();
 if actor is null or actor->>'member_id' is null then raise exception 'Active member profile required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('start','pause','resume','stop') or p_session_id is null then raise exception 'Invalid timer command' using errcode='22023'; end if;
 -- Serialize commands for this verified user, including two concurrent STARTs.
 perform pg_advisory_xact_lock(hashtextextended(actor->>'user_id',1729));
 perform pg_advisory_xact_lock(hashtext((actor->>'member_id')||'hours-import'));
 instant=clock_timestamp();
 if p_action in ('start','resume') and exists(select 1 from public.org_weekly_hours h
  where h.member_id=(actor->>'member_id')::uuid and (instant at time zone 'Europe/Ljubljana')::date between h.week_start and h.through_date) then
  raise exception 'Today is already covered by an imported aggregate' using errcode='23514';
 end if;
 if p_action='start' then
  select * into s from public.org_work_sessions where id=p_session_id;
  if found then
   if s.user_id<>(actor->>'user_id')::uuid then raise exception 'Session unavailable' using errcode='42501'; end if;
   return to_jsonb(s); -- Retrying a lost START response cannot create a second session.
  end if;
  if p_expected_version is not null or p_description is null or length(p_description)>2000 then raise exception 'Invalid start' using errcode='22023'; end if;
  if p_project_id is not null and not org_private.project_access(p_project_id) then raise exception 'Project unavailable' using errcode='42501'; end if;
  if exists(select 1 from public.org_work_sessions where user_id=(actor->>'user_id')::uuid and state<>'stopped') then
   raise exception 'A work session is already active' using errcode='23505';
  end if;
  insert into public.org_work_sessions(id,user_id,member_id,project_id,description,started_at,state)
   values(p_session_id,(actor->>'user_id')::uuid,(actor->>'member_id')::uuid,p_project_id,btrim(p_description),instant,'running') returning * into s;
  insert into public.org_work_segments(session_id,started_at) values(s.id,instant);
 else
  if p_project_id is not null or p_description<>'' then raise exception 'Only START accepts metadata' using errcode='22023'; end if;
  select * into s from public.org_work_sessions where id=p_session_id for update;
  if not found or s.user_id<>(actor->>'user_id')::uuid or s.member_id<>(actor->>'member_id')::uuid then raise exception 'Session unavailable' using errcode='42501'; end if;
  if p_action='stop' and s.state='stopped' then return to_jsonb(s); end if;
  if p_expected_version is distinct from s.version or s.state='stopped' then raise exception 'Session changed; refresh before retrying' using errcode='40001'; end if;
  if (p_action='pause' and s.state<>'running') or (p_action='resume' and s.state<>'paused') then raise exception 'Invalid timer transition' using errcode='40001'; end if;
  if p_action in ('pause','stop') and s.state='running' then
   update public.org_work_segments set ended_at=instant where session_id=s.id and ended_at is null;
  elsif p_action='resume' then
   insert into public.org_work_segments(session_id,started_at) values(s.id,instant);
  end if;
  update public.org_work_sessions set state=case p_action when 'pause' then 'paused' when 'resume' then 'running' else 'stopped' end,
   version=version+1,stopped_at=case when p_action='stop' then instant end,
   duration_seconds=case when p_action='stop' then (select sum(extract(epoch from ended_at-started_at)) from public.org_work_segments where session_id=s.id) end
   where id=s.id returning * into s;
  if p_action='stop' then
   -- Same transaction: either STOP and all daily rows persist, or everything rolls back.
   insert into public.org_work_entries(member_id,project_id,date,hours,description,session_id)
    select w.member_id,w.project_id,w.date,w.hours,w.description,w.session_id from org_private.session_work(instant,array[s.id]) w where w.session_id=s.id;
  end if;
 end if;
 return to_jsonb(s);
end $$;
revoke all on function public.org_work_timer(text,uuid,integer,uuid,text) from public,anon,service_role;
grant execute on function public.org_work_timer(text,uuid,integer,uuid,text) to authenticated;

-- Full replacement of a daily row, with compare-and-swap for edits and a reason
-- persisted by the existing transactional, append-only org_audit trigger.
create function public.org_admin_work(
 p_id uuid,p_member_id uuid,p_date date,p_hours numeric,p_description text,p_project_id uuid,
 p_reason text,p_expected_updated_at timestamptz default null,p_deleted boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.org_work_entries; result public.org_work_entries;
begin
 if not org_private.admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 2000 or p_deleted is null then raise exception 'Reason and valid state required' using errcode='22023'; end if;
 if p_date is null or p_date>(clock_timestamp() at time zone 'Europe/Ljubljana')::date or
  p_hours is null or p_hours::text in ('NaN','Infinity','-Infinity') or p_hours<0 or p_hours>25 or
  p_description is null or length(p_description)>2000 then raise exception 'Invalid daily hours' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext(p_member_id::text||'hours-import'));
 if p_id is null then
  if p_expected_updated_at is not null or p_deleted then raise exception 'Invalid initial state' using errcode='22023'; end if;
  insert into public.org_work_entries(member_id,date,hours,description,project_id,adjustment_reason)
   values(p_member_id,p_date,p_hours,btrim(p_description),p_project_id,btrim(p_reason)) returning * into result;
 else
  select * into previous from public.org_work_entries where id=p_id for update;
  if not found or previous.member_id is distinct from p_member_id or previous.updated_at is distinct from p_expected_updated_at then
   raise exception 'Entry changed; refresh before retrying' using errcode='40001';
  end if;
  update public.org_work_entries set date=p_date,hours=p_hours,description=btrim(p_description),project_id=p_project_id,
   adjustment_reason=btrim(p_reason),deleted=p_deleted where id=p_id returning * into result;
 end if;
 return to_jsonb(result);
end $$;
revoke all on function public.org_admin_work(uuid,uuid,date,numeric,text,uuid,text,timestamptz,boolean) from public,anon,service_role;
grant execute on function public.org_admin_work(uuid,uuid,date,numeric,text,uuid,text,timestamptz,boolean) to authenticated;

-- Keep the existing leaderboard source and privacy projection; add only the
-- session reference needed to replace provisional time exactly once at STOP.
create or replace function org_private.leaderboard_projection(entity text,row_data jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(row_data)
 where key=any(case entity
 when 'members' then array['id','name','tier','weekly_hours','series']
 when 'org_tasks' then array['id','assignee_id','status','due_date','archived','completed_at']
 when 'org_task_history' then array['id','task_id','member_id','old_status','new_status','occurred_at','changes']
 when 'org_work_entries' then array['id','member_id','date','hours','deleted','session_id']
 when 'org_weekly_hours' then array['id','member_id','week_start','through_date','hours']
 when 'org_meetings' then array['id','series','starts_at','ends_at','cancelled']
 when 'org_attendance' then array['id','meeting_id','member_id','status']
 when 'org_meeting_members' then array['meeting_id','member_id'] else array[]::text[] end)
$$;
-- Rename only the internal implementation; public RPC and its service-only ACL stay stable.
alter function public.org_leaderboard_source(timestamptz) rename to org_leaderboard_source_without_timer;
revoke all on function public.org_leaderboard_source_without_timer(timestamptz) from public,anon,authenticated;
create function public.org_leaderboard_source(as_of timestamptz default clock_timestamp()) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; cutoff timestamptz;
begin
 cutoff=least(as_of,clock_timestamp());
 result=public.org_leaderboard_source_without_timer(cutoff);
 return jsonb_set(result,'{work}',(result->'work')||coalesce((
  select jsonb_agg(org_private.leaderboard_projection('org_work_entries',to_jsonb(w)))
   from org_private.session_work(cutoff,array(select s.id from public.org_work_sessions s
    where not exists(select 1 from jsonb_array_elements(result->'work') r where r->>'session_id'=s.id::text))) w
   where not exists(select 1 from jsonb_array_elements(result->'work') r where r->>'session_id'=w.session_id::text)
 ),'[]'::jsonb));
end $$;
revoke all on function public.org_leaderboard_source(timestamptz) from public,anon,authenticated;
grant execute on function public.org_leaderboard_source(timestamptz),public.org_leaderboard_source_without_timer(timestamptz) to service_role;
grant execute on function org_private.session_work(timestamptz,uuid[]) to service_role;
grant execute on function org_private.leaderboard_projection(text,jsonb) to service_role;

-- Imports and timer commands share the existing member import lock. An import
-- cannot cover time already tracked in an open session and strand its STOP.
create function org_private.guard_weekly_live_overlap() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(new.member_id::text||'hours-import'));
 if exists(select 1 from public.org_work_sessions s join public.org_work_segments g on g.session_id=s.id
  where s.member_id=new.member_id and s.state<>'stopped'
   and g.started_at<((new.through_date+1)::timestamp at time zone 'Europe/Ljubljana')
   and coalesce(g.ended_at,clock_timestamp())>(new.week_start::timestamp at time zone 'Europe/Ljubljana')) then
  raise exception 'Imported aggregate overlaps an open work session' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function org_private.guard_weekly_live_overlap() from public,anon,authenticated,service_role;
create trigger org_weekly_live_overlap before insert on public.org_weekly_hours for each row execute function org_private.guard_weekly_live_overlap();
