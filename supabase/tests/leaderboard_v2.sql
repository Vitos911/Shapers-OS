-- Rollback-only: scoring versions coexist, immutable history and grants remain intact.
begin;
create function pg_temp.assert_v2(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
update org_private.leaderboard_tracking set started_at='2026-09-01T10:00:00Z';
insert into public.org_leaderboard_weeks(week_start,version,rows) values('2026-09-07',1,'[]'),('2026-09-07',2,'[]');
select pg_temp.assert_v2((select count(*)=2 from public.org_leaderboard_weeks where week_start='2026-09-07'),'both scoring versions survive');
do $$ begin
 begin insert into public.org_leaderboard_weeks(week_start,version,rows) values('2026-09-07',2,'[]'); raise exception 'duplicate version accepted'; exception when unique_violation then null; end;
 begin insert into public.org_leaderboard_weeks(week_start,version,rows) values('2026-09-07',3,'[]'); raise exception 'unknown version accepted'; exception when check_violation then null; end;
 begin update public.org_leaderboard_weeks set rows='[{}]' where week_start='2026-09-07' and version=2; raise exception 'version 2 changed'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert_v2(not has_table_privilege('authenticated','public.org_leaderboard_weeks','SELECT'),'authenticated cache denied');
select pg_temp.assert_v2(not has_table_privilege('anon','public.org_leaderboard_weeks','SELECT'),'anonymous cache denied');
select pg_temp.assert_v2(not has_table_privilege('service_role','public.org_leaderboard_weeks','UPDATE'),'service cannot overwrite scores');
select pg_temp.assert_v2(not has_table_privilege('service_role','public.org_leaderboard_weeks','DELETE'),'service cannot delete scores');
select pg_temp.assert_v2((select relrowsecurity from pg_class where oid='public.org_leaderboard_weeks'::regclass),'cache RLS still enabled');
select pg_temp.assert_v2(not has_function_privilege('authenticated','public.org_leaderboard_source(timestamptz)','execute'),'source stays server only');
rollback;
