-- Private temporal evidence is necessary: existing history omits member tiers,
-- meeting requirements and imported totals. No client can read or edit this ledger.
create table org_private.leaderboard_tracking (
 id boolean primary key default true check(id), started_at timestamptz not null default clock_timestamp()
);
insert into org_private.leaderboard_tracking default values;
create table org_private.leaderboard_events (
 sequence bigint generated always as identity primary key,
 entity text not null, record_key text not null, recorded_at timestamptz not null default clock_timestamp(), data jsonb
);
create index leaderboard_events_asof on org_private.leaderboard_events(entity,record_key,recorded_at desc,sequence desc);
create table public.org_leaderboard_weeks (
 week_start date primary key check(extract(isodow from week_start)=1),
 version integer not null check(version=1), rows jsonb not null check(jsonb_typeof(rows)='array'),
 created_at timestamptz not null default clock_timestamp()
);
alter table org_private.leaderboard_tracking enable row level security;
alter table org_private.leaderboard_events enable row level security;
alter table public.org_leaderboard_weeks enable row level security;
revoke all on org_private.leaderboard_tracking,org_private.leaderboard_events,public.org_leaderboard_weeks from public,anon,authenticated;
grant select on org_private.leaderboard_tracking,org_private.leaderboard_events to service_role;
grant select,insert on public.org_leaderboard_weeks to service_role;

create function org_private.leaderboard_projection(entity text, row_data jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(row_data)
 where key=any(case entity
 when 'members' then array['id','name','tier','weekly_hours','series']
 when 'org_tasks' then array['id','assignee_id','status','due_date','archived','completed_at']
 when 'org_task_history' then array['id','task_id','member_id','old_status','new_status','occurred_at','changes']
 when 'org_work_entries' then array['id','member_id','date','hours','deleted']
 when 'org_weekly_hours' then array['id','member_id','week_start','through_date','hours']
 when 'org_meetings' then array['id','series','starts_at','ends_at','cancelled']
 when 'org_attendance' then array['id','meeting_id','member_id','status']
 when 'org_meeting_members' then array['meeting_id','member_id'] else array[]::text[] end)
$$;

create function org_private.capture_leaderboard() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; record_key text; projected jsonb;
begin
 row_data=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 record_key=case when tg_table_name='org_meeting_members' then row_data->>'meeting_id'||':'||(row_data->>'member_id') else row_data->>'id' end;
 projected=org_private.leaderboard_projection(tg_table_name,row_data);
 if tg_table_name='org_task_history' then
  -- Keep completion evidence, not task titles/descriptions or audit actor identities.
  projected=jsonb_set(projected,'{changes}',jsonb_build_object('after',org_private.leaderboard_projection('org_tasks',coalesce(row_data#>'{changes,after}','{}'::jsonb))));
 end if;
 if tg_op='UPDATE' and projected=org_private.leaderboard_projection(tg_table_name,to_jsonb(old)) then return new; end if;
 insert into org_private.leaderboard_events(entity,record_key,data) values(tg_table_name,record_key,case when tg_op='DELETE' then null else projected end);
 return case when tg_op='DELETE' then old else new end;
end $$;

do $$ declare entity text; begin
 foreach entity in array array['members','org_tasks','org_task_history','org_work_entries','org_weekly_hours','org_meetings','org_attendance','org_meeting_members'] loop
  execute format('create trigger org_leaderboard_capture after insert or update or delete on public.%I for each row execute function org_private.capture_leaderboard()',entity);
  execute format($q$insert into org_private.leaderboard_events(entity,record_key,data)
   select %L,case when %L='org_meeting_members' then r->>'meeting_id'||':'||(r->>'member_id') else r->>'id' end,
   case when %L='org_task_history' then jsonb_set(org_private.leaderboard_projection(%L,r),'{changes}',jsonb_build_object('after',org_private.leaderboard_projection('org_tasks',coalesce(r#>'{changes,after}','{}'::jsonb))))
    else org_private.leaderboard_projection(%L,r) end
   from (select to_jsonb(t) r from public.%I t) s$q$,entity,entity,entity,entity,entity,entity);
 end loop;
end $$;

create function org_private.leaderboard_rows(entity_name text, cutoff timestamptz) returns setof jsonb
language sql stable security invoker set search_path='' as $$
 select data from (select distinct on (record_key) record_key,data from org_private.leaderboard_events
 where entity=entity_name and recorded_at<cutoff order by record_key,recorded_at desc,sequence desc) latest where data is not null
$$;

-- Server-only, invoker RPC. It does not expose a definer function to the Data API.
create function public.org_leaderboard_source(as_of timestamptz default clock_timestamp()) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; started timestamptz; cutoff timestamptz;
begin
 cutoff=least(as_of,clock_timestamp());
 select started_at into started from org_private.leaderboard_tracking;
 result=jsonb_build_object('coverageStartedAt',started);
 result=result||jsonb_build_object(
  'members',(select coalesce(jsonb_agg(r),'[]') from org_private.leaderboard_rows('members',cutoff) r),
  'tasks',(select coalesce(jsonb_agg(r),'[]') from org_private.leaderboard_rows('org_tasks',cutoff) r),
  'history',(select coalesce(jsonb_agg(r),'[]') from org_private.leaderboard_rows('org_task_history',cutoff) r),
  'work',(select coalesce(jsonb_agg(r),'[]') from org_private.leaderboard_rows('org_work_entries',cutoff) r),
  'weeklyHours',(select coalesce(jsonb_agg(r),'[]') from org_private.leaderboard_rows('org_weekly_hours',cutoff) r),
  'meetings',(select coalesce(jsonb_agg(r),'[]') from org_private.leaderboard_rows('org_meetings',cutoff) r),
  'attendance',(select coalesce(jsonb_agg(r),'[]') from org_private.leaderboard_rows('org_attendance',cutoff) r),
  'meetingMembers',(select coalesce(jsonb_agg(r),'[]') from org_private.leaderboard_rows('org_meeting_members',cutoff) r)
 );
 -- Required membership is taken at meeting start, not today's assignment/series.
 -- Pre-tracking current-week meetings use current eligibility provisionally only.
 result=result||jsonb_build_object('eligibility',(
  select coalesce(jsonb_agg(jsonb_build_object('meeting_id',e.r->>'id','member_id',m.r->>'id','observed',(e.r->>'starts_at')::timestamptz>=started)),'[]')
  from org_private.leaderboard_rows('org_meetings',cutoff) e(r)
  cross join lateral (
   select r from org_private.leaderboard_rows('org_meetings',case when (e.r->>'starts_at')::timestamptz<started then cutoff else least((e.r->>'starts_at')::timestamptz,cutoff) end) r where r->>'id'=e.r->>'id'
  ) required(r)
  cross join lateral org_private.leaderboard_rows('members',case when (e.r->>'starts_at')::timestamptz<started then cutoff else least((e.r->>'starts_at')::timestamptz,cutoff) end) m(r)
  where (e.r->>'ends_at')::timestamptz<=cutoff and not (e.r->>'cancelled')::boolean and (
   required.r->>'series'='Community' or required.r->>'series'=any(regexp_split_to_array(m.r->>'series','\s*;\s*')) or exists(
    select 1 from org_private.leaderboard_rows('org_meeting_members',case when (e.r->>'starts_at')::timestamptz<started then cutoff else least((e.r->>'starts_at')::timestamptz,cutoff) end) a
    where a->>'meeting_id'=e.r->>'id' and a->>'member_id'=m.r->>'id'
   ))
 ));
 return result;
end $$;

create function org_private.guard_leaderboard_week() returns trigger
language plpgsql security invoker set search_path='' as $$
declare first_week date; started timestamptz;
begin
 if tg_op<>'INSERT' then raise exception 'Final leaderboard weeks are immutable' using errcode='42501'; end if;
 if new.week_start+7>(clock_timestamp() at time zone 'Europe/Ljubljana')::date then raise exception 'Only completed weeks may be finalized'; end if;
 select started_at into started from org_private.leaderboard_tracking;
 first_week=date_trunc('week',started at time zone 'Europe/Ljubljana')::date;
 if started<>(first_week::timestamp at time zone 'Europe/Ljubljana') then first_week=first_week+7; end if;
 if new.week_start<first_week then raise exception 'Week predates complete temporal evidence'; end if;
 return new;
end $$;
create trigger leaderboard_weeks_immutable before insert or update or delete on public.org_leaderboard_weeks for each row execute function org_private.guard_leaderboard_week();
revoke all on function org_private.leaderboard_projection(text,jsonb),org_private.capture_leaderboard(),org_private.leaderboard_rows(text,timestamptz),org_private.guard_leaderboard_week(),public.org_leaderboard_source(timestamptz) from public,anon,authenticated;
grant execute on function org_private.leaderboard_rows(text,timestamptz),org_private.guard_leaderboard_week(),public.org_leaderboard_source(timestamptz) to service_role;
