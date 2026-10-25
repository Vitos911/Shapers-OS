-- Synthetic fixtures only. Run on a local/disposable database; always roll back.
begin;
create temporary table history_test_ids(key text primary key,id uuid default gen_random_uuid());
insert into history_test_ids(key) values('member'),('other'),('admin'),('super'),('outsider'),('project'),('task'),('foreign_task'),('meeting');
grant select on history_test_ids to authenticated,anon,service_role;
grant update on history_test_ids to authenticated;
create function pg_temp.history_id(k text) returns uuid language sql as $$ select id from history_test_ids where key=k $$;
create function pg_temp.history_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;

insert into public.members(id,name,email,tier,weekly_hours,is_admin,series)
 select id,'History '||key,id||'@history-test.invalid','Impact',10,key='admin','Community' from history_test_ids where key in ('member','other','admin','super','outsider');
insert into org_private.access(email,role,member_id)
 select id||'@history-test.invalid',case key when 'admin' then 'ADMIN' when 'super' then 'SUPERADMIN' else 'MEMBER' end,id from history_test_ids where key in ('member','other','admin','super','outsider');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,is_anonymous)
 select id,id||'@history-test.invalid',now(),'{"role":"SUPERADMIN"}',false from history_test_ids where key in ('member','other','admin','super','outsider');
insert into public.org_projects(id,name) values(pg_temp.history_id('project'),'History test project');
insert into public.org_work_entries(member_id,date,hours) values
 (pg_temp.history_id('member'),'2026-09-22',1), (pg_temp.history_id('other'),'2026-09-22',2);
insert into public.org_weekly_hours(member_id,week_start,through_date,hours,source,import_key) values
 (pg_temp.history_id('member'),'2026-09-14','2026-09-20',4,'History test','history-'||pg_temp.history_id('member')),
 (pg_temp.history_id('other'),'2026-09-14','2026-09-20',6,'History test','history-'||pg_temp.history_id('other'));
insert into public.org_meetings(id,calendar_id,google_event_id,title,series,starts_at,ends_at)
 values(pg_temp.history_id('meeting'),'history-test',pg_temp.history_id('meeting')::text,'History test meeting','Community','2026-09-22T12:00Z','2026-09-22T13:00Z');

select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.history_id('admin'),'role','authenticated')::text,true);
insert into public.org_attendance(meeting_id,member_id,status) values
 (pg_temp.history_id('meeting'),pg_temp.history_id('member'),'present'),
 (pg_temp.history_id('meeting'),pg_temp.history_id('other'),'remote'),
 (pg_temp.history_id('meeting'),pg_temp.history_id('admin'),'excused'),
 (pg_temp.history_id('meeting'),pg_temp.history_id('super'),'unexcused');
set local role authenticated;
with inserted as (
 insert into public.org_tasks(project_id,title,assignee_id)
 values(pg_temp.history_id('project'),'History task',pg_temp.history_id('member')) returning id
) update history_test_ids set id=(select id from inserted) where key='task';
select pg_temp.history_assert((select count(*)=1 from public.org_task_history where task_id=pg_temp.history_id('task')),'one history record per task creation');
select pg_temp.history_assert((select actor_id=pg_temp.history_id('admin') and actor_name='History admin' and changes->'before'='null'::jsonb and changes->'after'->>'title'='History task' and occurred_at is not null from public.org_task_history where task_id=pg_temp.history_id('task')),'creation has actor, time, before/after and saved name');
update public.org_tasks set status='in_progress',priority='urgent',due_date='2026-11-01',assignee_id=pg_temp.history_id('other') where id=pg_temp.history_id('task');
select pg_temp.history_assert((select count(*)=2 from public.org_task_history where task_id=pg_temp.history_id('task')),'one record for combined update');
select pg_temp.history_assert(exists(select 1 from public.org_task_history where task_id=pg_temp.history_id('task') and
 changes->'before'->>'status'='todo' and changes->'after'->>'status'='in_progress' and
 changes->'before'->>'priority'='medium' and changes->'after'->>'priority'='urgent' and
 changes->'before'->'due_date'='null'::jsonb and changes->'after'->>'due_date'='2026-11-01' and
 changes->'before'->>'assignee_id'=pg_temp.history_id('member')::text and changes->'after'->>'assignee_id'=pg_temp.history_id('other')::text),'status, priority, deadline and assignee retain exact old/new values');

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.history_id('other'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.history_assert((select count(*)=2 from public.org_task_history where task_id=pg_temp.history_id('task')),'new assignee sees earlier task history');
select pg_temp.history_assert((select count(*)=1 from public.org_work_entries where member_id in (pg_temp.history_id('member'),pg_temp.history_id('other'))),'member sees only own daily hours');
select pg_temp.history_assert((select count(*)=1 from public.org_weekly_hours where member_id in (pg_temp.history_id('member'),pg_temp.history_id('other'))),'member sees only own weekly hours');
select pg_temp.history_assert((select count(*)=1 from public.org_attendance where meeting_id=pg_temp.history_id('meeting')),'member sees only own attendance');
update public.org_tasks set status='done' where id=pg_temp.history_id('task');
select pg_temp.history_assert((select completed_at is not null from public.org_tasks where id=pg_temp.history_id('task')),'completion behavior remains intact');
select pg_temp.history_assert(exists(select 1 from public.org_task_history where task_id=pg_temp.history_id('task') and old_status='in_progress' and new_status='done' and actor_id=pg_temp.history_id('other')),'completion captured by existing trigger');
update public.org_tasks set status='todo',description='Reopened description' where id=pg_temp.history_id('task');
select pg_temp.history_assert((select completed_at is null from public.org_tasks where id=pg_temp.history_id('task')),'reopening behavior remains intact');
select pg_temp.history_assert(exists(select 1 from public.org_task_history where task_id=pg_temp.history_id('task') and old_status='done' and new_status='todo'),'reopening recorded');
update public.members set name='Renamed later' where id=pg_temp.history_id('other');
select pg_temp.history_assert(exists(select 1 from public.org_task_history where task_id=pg_temp.history_id('task') and actor_id=pg_temp.history_id('other') and actor_name='History other'),'recorded actor name is not rewritten by later profile edits');

-- A failed history insert must roll back the business write and general audit too.
reset role;
alter table public.org_task_history add constraint history_test_reject_actor check(actor_name is distinct from 'Renamed later');
set local role authenticated;
do $$ begin
 begin update public.org_tasks set status='done' where id=pg_temp.history_id('task'); raise exception 'failed log did not abort task write'; exception when check_violation then null; end;
end $$;
select pg_temp.history_assert((select status='todo' and completed_at is null from public.org_tasks where id=pg_temp.history_id('task')),'history failure rolls back task status and timestamp');
select pg_temp.history_assert((select count(*)=4 from public.org_task_history where task_id=pg_temp.history_id('task')),'history failure adds no extra history row');
reset role;
alter table public.org_task_history drop constraint history_test_reject_actor;

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.history_id('member'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.history_assert((select count(*)=1 from public.org_task_history where task_id=pg_temp.history_id('task')),'former assignee retains own historical records for existing analytics');
select pg_temp.history_assert((select count(*)=0 from public.org_tasks where id=pg_temp.history_id('task')),'former assignee cannot access reassigned task');
do $$ declare affected int; begin
 update public.org_tasks set status='done' where id=pg_temp.history_id('task'); get diagnostics affected=row_count;
 perform pg_temp.history_assert(affected=0,'RLS-denied update affects zero rows');
end $$;

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.history_id('outsider'),'role','authenticated','user_metadata',jsonb_build_object('role','SUPERADMIN'))::text,true);
set local role authenticated;
select pg_temp.history_assert((public.org_context()->>'role')='MEMBER','user metadata cannot elevate history access');
select pg_temp.history_assert((select count(*)=0 from public.org_task_history where task_id=pg_temp.history_id('task')),'unrelated member cannot read history');
select pg_temp.history_assert((select count(*)=0 from public.org_audit where record_id=pg_temp.history_id('task')::text),'member cannot read global audit');
select pg_temp.history_assert((select count(*)=0 from public.org_work_entries where member_id in (pg_temp.history_id('member'),pg_temp.history_id('other'))),'unrelated member cannot read hours');
select pg_temp.history_assert((select count(*)=0 from public.org_weekly_hours where member_id in (pg_temp.history_id('member'),pg_temp.history_id('other'))),'unrelated member cannot read weekly hours');
select pg_temp.history_assert((select count(*)=0 from public.org_attendance where meeting_id=pg_temp.history_id('meeting')),'unrelated member cannot read attendance');

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.history_id('admin'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.history_assert((select count(*)=4 from public.org_task_history where task_id=pg_temp.history_id('task')),'admin sees task history without duplicates');
select pg_temp.history_assert((select count(*)=0 from public.org_audit where record_id=pg_temp.history_id('task')::text),'admin still cannot read superadmin audit');
select pg_temp.history_assert((select count(*)=2 from public.org_work_entries where member_id in (pg_temp.history_id('member'),pg_temp.history_id('other'))),'admin can review member hours');
select pg_temp.history_assert((select count(*)=2 from public.org_weekly_hours where member_id in (pg_temp.history_id('member'),pg_temp.history_id('other'))),'admin can review member weekly hours');
select pg_temp.history_assert((select count(*)=4 from public.org_attendance where meeting_id=pg_temp.history_id('meeting')),'admin can review all saved attendance statuses');

reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.history_id('super'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.history_assert((select count(*)=4 from public.org_task_history where task_id=pg_temp.history_id('task')),'superadmin sees task history');
select pg_temp.history_assert((select count(*)=4 from public.org_audit where entity='org_tasks' and record_id=pg_temp.history_id('task')::text),'global audit remains available to superadmin');
select pg_temp.history_assert((select count(*)=2 from public.org_work_entries where member_id in (pg_temp.history_id('member'),pg_temp.history_id('other'))),'superadmin can review member hours');
select pg_temp.history_assert((select count(*)=2 from public.org_weekly_hours where member_id in (pg_temp.history_id('member'),pg_temp.history_id('other'))),'superadmin can review member weekly hours');
select pg_temp.history_assert((select count(*)=4 from public.org_attendance where meeting_id=pg_temp.history_id('meeting')),'superadmin can review attendance');
select public.org_set_access((pg_temp.history_id('outsider')::text||'@history-test.invalid'),'ADMIN',false);
select pg_temp.history_assert(exists(select 1 from public.org_audit where entity='access' and record_id=pg_temp.history_id('outsider')::text||'@history-test.invalid'),'existing access change still appends audit');

-- Every application role has read-only log privileges, including the service role.
reset role;
do $$ declare r text; t text; begin
 foreach r in array array['authenticated','service_role'] loop
  foreach t in array array['public.org_task_history','public.org_audit'] loop
   perform pg_temp.history_assert(has_table_privilege(r,t,'SELECT'),'read grant remains');
   perform pg_temp.history_assert(not has_table_privilege(r,t,'INSERT') and not has_table_privilege(r,t,'UPDATE') and not has_table_privilege(r,t,'DELETE') and not has_table_privilege(r,t,'TRUNCATE'),'no direct log mutation grant');
  end loop;
 end loop;
end $$;
set local role authenticated;
do $$ begin
 begin insert into public.org_task_history(task_id,changes) values(pg_temp.history_id('task'),'{}'); raise exception 'forged history accepted'; exception when insufficient_privilege then null; end;
 begin update public.org_task_history set actor_name='Forged' where task_id=pg_temp.history_id('task'); raise exception 'history update accepted'; exception when insufficient_privilege then null; end;
 begin delete from public.org_task_history where task_id=pg_temp.history_id('task'); raise exception 'history delete accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
 begin insert into public.org_audit(entity,record_id,action) values('forged','forged','UPDATE'); raise exception 'service forged audit accepted'; exception when insufficient_privilege then null; end;
 begin truncate public.org_task_history; raise exception 'service truncate accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Even an owner with table grants must explicitly bypass guards to rewrite history.
do $$ begin
 begin insert into public.org_task_history(task_id,actor_id,changes) values(pg_temp.history_id('task'),pg_temp.history_id('other'),'{}'); raise exception 'forged actor accepted'; exception when insufficient_privilege then null; end;
 begin update public.org_task_history set actor_name='Forged' where task_id=pg_temp.history_id('task'); raise exception 'owner history update accepted'; exception when insufficient_privilege then null; end;
 begin delete from public.org_audit where record_id=pg_temp.history_id('task')::text; raise exception 'owner audit delete accepted'; exception when insufficient_privilege then null; end;
 begin truncate public.org_task_history; raise exception 'owner history truncate accepted'; exception when insufficient_privilege then null; end;
 begin truncate public.org_audit; raise exception 'owner audit truncate accepted'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.org_task_history; raise exception 'anonymous history read accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.history_assert((select count(*)=4 from public.org_task_history where task_id=pg_temp.history_id('task')),'denied writes did not append history or change existing rows');
rollback;
