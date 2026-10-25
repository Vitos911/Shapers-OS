-- Rollback-only security and time-travel regressions. No fixtures survive.
begin;
create temporary table lb_ids(key text primary key,id uuid default gen_random_uuid());
insert into lb_ids(key) values('member'),('other'),('user'),('project'),('task'),('meeting');
create function pg_temp.lb_id(k text) returns uuid language sql as $$ select id from lb_ids where key=k $$;
create function pg_temp.lb_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',label; end if;end $$;
create temporary table lb_times(key text primary key,at timestamptz);
insert into public.members(id,name,email,tier,weekly_hours,series) values(pg_temp.lb_id('member'),'Leaderboard transaction test','leaderboard-'||pg_temp.lb_id('member')||'@test.invalid','Impact',10,'Test Series');
insert into org_private.access(email,role,member_id) values('leaderboard-'||pg_temp.lb_id('member')||'@test.invalid','SUPERADMIN',pg_temp.lb_id('member'));
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(pg_temp.lb_id('user'),'leaderboard-'||pg_temp.lb_id('member')||'@test.invalid',now(),false);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.lb_id('user'),'role','authenticated')::text,true);
insert into public.org_projects(id,name) values(pg_temp.lb_id('project'),'Leaderboard rollback test');
insert into public.org_tasks(id,project_id,title,assignee_id,due_date) values(pg_temp.lb_id('task'),pg_temp.lb_id('project'),'Leaderboard rollback task',pg_temp.lb_id('member'),'2026-10-23');
insert into lb_times values('before',clock_timestamp());
update public.org_tasks set due_date='2026-11-06',status='done' where id=pg_temp.lb_id('task');
update public.members set tier='Core',weekly_hours=70 where id=pg_temp.lb_id('member');
select pg_temp.lb_assert((select r->>'tier'='Impact' from jsonb_array_elements(public.org_leaderboard_source((select at from lb_times where key='before'))->'members') r where r->>'id'=pg_temp.lb_id('member')::text),'historical tier survives later changes');
select pg_temp.lb_assert((select r->>'due_date'='2026-10-23' and r->>'status'='todo' from jsonb_array_elements(public.org_leaderboard_source((select at from lb_times where key='before'))->'tasks') r where r->>'id'=pg_temp.lb_id('task')::text),'historical deadline and status survive edits');
select pg_temp.lb_assert((select r->>'tier'='Core' and not r ? 'email' and not r ? 'auth_user_id' from jsonb_array_elements(public.org_leaderboard_source()->'members') r where r->>'id'=pg_temp.lb_id('member')::text),'current source updates and excludes account identities');
select pg_temp.lb_assert((select count(*)=1 from org_private.leaderboard_events where entity='org_task_history' and data->>'task_id'=pg_temp.lb_id('task')::text and data->>'new_status'='done'),'ordinary task completion is captured automatically');
select pg_temp.lb_assert(not exists(select 1 from org_private.leaderboard_events where entity='org_task_history' and data->>'task_id'=pg_temp.lb_id('task')::text and (data#>'{changes,after}') ? 'description'),'private task prose is not duplicated');

insert into public.members(id,name,email,tier,weekly_hours,series) values(pg_temp.lb_id('other'),'Leaderboard unrelated fixture','leaderboard-'||pg_temp.lb_id('other')||'@test.invalid','GO!',4,'Unrelated Series');
insert into public.org_meetings(id,calendar_id,google_event_id,title,series,starts_at,ends_at) values(pg_temp.lb_id('meeting'),'rollback',pg_temp.lb_id('meeting')::text,'Rollback meeting','Test Series',clock_timestamp()+interval '100 milliseconds',clock_timestamp()+interval '110 milliseconds');
select pg_sleep(0.12);
update public.members set series='Changed Series' where id=pg_temp.lb_id('member');
update public.org_meetings set series='Different Series' where id=pg_temp.lb_id('meeting');
insert into public.org_meeting_members(meeting_id,member_id) values(pg_temp.lb_id('meeting'),pg_temp.lb_id('other'));
select pg_temp.lb_assert(exists(select 1 from jsonb_array_elements(public.org_leaderboard_source()->'eligibility') r where r->>'meeting_id'=pg_temp.lb_id('meeting')::text and r->>'member_id'=pg_temp.lb_id('member')::text and (r->>'observed')::boolean),'required meeting uses member and meeting series at meeting start');
select pg_temp.lb_assert(not exists(select 1 from jsonb_array_elements(public.org_leaderboard_source()->'eligibility') r where r->>'meeting_id'=pg_temp.lb_id('meeting')::text and r->>'member_id'=pg_temp.lb_id('other')::text),'late assignment cannot invent a past meeting requirement');
insert into lb_times values('assigned',clock_timestamp());
delete from public.org_meeting_members where meeting_id=pg_temp.lb_id('meeting');
select pg_temp.lb_assert(exists(select 1 from jsonb_array_elements(public.org_leaderboard_source((select at from lb_times where key='assigned'))->'meetingMembers') r where r->>'meeting_id'=pg_temp.lb_id('meeting')::text),'deleted assignment remains visible historically');
select pg_temp.lb_assert(not exists(select 1 from jsonb_array_elements(public.org_leaderboard_source()->'meetingMembers') r where r->>'meeting_id'=pg_temp.lb_id('meeting')::text),'deleted assignment tombstone affects current state');

do $$ begin
 begin insert into public.org_leaderboard_weeks(week_start,version,rows) values(date_trunc('week',clock_timestamp() at time zone 'Europe/Ljubljana')::date,1,'[]'); raise exception 'accepted unfinished week' using errcode='XX000'; exception when raise_exception then null; end;
 begin insert into public.org_leaderboard_weeks(week_start,version,rows) values('2000-01-03',1,'[]'); raise exception 'accepted unobserved week' using errcode='XX000'; exception when raise_exception then null; end;
end $$;

-- Set only test metadata backwards inside this transaction, to exercise finalized rows.
update org_private.leaderboard_tracking set started_at='2026-09-01T10:00:00Z';
insert into public.org_leaderboard_weeks(week_start,version,rows) values('2026-09-14',1,'[]');
do $$ begin
 begin update public.org_leaderboard_weeks set rows='[{}]' where week_start='2026-09-14'; raise exception 'cache update allowed'; exception when insufficient_privilege then null; end;
 begin delete from public.org_leaderboard_weeks where week_start='2026-09-14'; raise exception 'cache delete allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
select pg_temp.lb_assert(jsonb_array_length(public.org_leaderboard_source()->'members')>0,'service can load scoring evidence');
select pg_temp.lb_assert(not has_table_privilege('service_role','org_private.leaderboard_events','UPDATE'),'even service cannot rewrite evidence');
select pg_temp.lb_assert(not has_table_privilege('service_role','public.org_leaderboard_weeks','UPDATE') and not has_table_privilege('service_role','public.org_leaderboard_weeks','DELETE') and not has_table_privilege('service_role','public.org_leaderboard_weeks','TRUNCATE'),'cache grants are genuinely append-only');
insert into public.org_leaderboard_weeks(week_start,version,rows) values('2026-09-14',1,'[{"attempt":"ignored"}]') on conflict(week_start,version) do nothing;
select pg_temp.lb_assert((select rows='[]' from public.org_leaderboard_weeks where week_start='2026-09-14'),'concurrent insert-if-absent needs no update grant and preserves the canonical row');
reset role;
set local role authenticated;
do $$ begin
 begin perform public.org_leaderboard_source(); raise exception 'authenticated caller accessed private evidence'; exception when insufficient_privilege then null; end;
 begin perform * from public.org_leaderboard_weeks; raise exception 'authenticated caller accessed all breakdowns'; exception when insufficient_privilege then null; end;
 begin insert into public.org_leaderboard_weeks(week_start,version,rows) values('2026-09-21',1,'[]'); raise exception 'authenticated caller awarded points'; exception when insufficient_privilege then null; end;
 begin perform * from org_private.leaderboard_events; raise exception 'authenticated caller read private event log'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.org_leaderboard_source(); raise exception 'anonymous source access allowed'; exception when insufficient_privilege then null; end;
 begin perform * from public.org_leaderboard_weeks; raise exception 'anonymous scores access allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.lb_assert((select count(*)=1 from public.org_leaderboard_weeks where week_start='2026-09-14' and rows='[]'),'finalized rows unchanged after attacks');
rollback;
