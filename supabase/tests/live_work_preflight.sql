-- Read-only preflight for SQL Editor / a trusted DB connection. No migration or writes.
-- Confirm the connection targets Supabase project xdzofggamwoywxwdduio before running.
select version();
select version, name from supabase_migrations.schema_migrations order by version;
select n.nspname as schema_name,c.relname,c.relrowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','org_private') and c.relname in
 ('members','access','org_work_entries','org_weekly_hours','org_audit','org_work_sessions','org_work_segments');
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
 where schemaname='public' and tablename in
 ('members','org_work_entries','org_weekly_hours','org_audit','org_work_sessions','org_work_segments')
 order by tablename,policyname;
select conrelid::regclass as table_name,conname,pg_get_constraintdef(oid) as definition
 from pg_constraint where conrelid in ('public.org_work_entries'::regclass,'public.org_weekly_hours'::regclass);
select event_object_table,trigger_name,action_timing,event_manipulation,action_statement
 from information_schema.triggers where trigger_schema='public' and event_object_table in
 ('org_work_entries','org_weekly_hours','org_audit') order by event_object_table,trigger_name;
select table_name,grantee,privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name in ('org_work_entries','org_audit','org_work_sessions','org_work_segments')
 and grantee in ('anon','authenticated','service_role');
select table_name,column_name,grantee,privilege_type from information_schema.column_privileges
 where table_schema='public' and table_name='org_work_entries' and grantee in ('anon','authenticated','service_role');
select n.nspname,p.proname,p.prosecdef,p.proacl,pg_get_functiondef(p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','org_private') and p.proname in
 ('identity','admin','audit_change','immutable_activity','work_daily_cap','no_overlapping_hours','org_leaderboard_source');
select count(*) as source_members from public.members;
select count(*) as historical_rows,sum(hours) as historical_hours from public.org_weekly_hours;
