begin;
create temporary table org_test_ids(key text primary key,id uuid default gen_random_uuid());
insert into org_test_ids(key) values('member'),('admin'),('super'),('other'),('project'),('task'),('meeting'),('future');
grant select on org_test_ids to authenticated,anon;
create function pg_temp.test_id(k text) returns uuid language sql as $$ select id from org_test_ids where key=k $$;
create function pg_temp.assert_true(condition boolean,label text) returns void language plpgsql as $$ begin if condition is distinct from true then raise exception 'FAILED: %',label;end if;end $$;
insert into public.members(id,name,email,tier,weekly_hours,is_admin,series)
 select id,'RLS '||key,key||'@org-rls.invalid','GO!',4,key='admin','Community' from org_test_ids where key in ('member','admin','super','other');
insert into org_private.access(email,role,member_id)
 select key||'@org-rls.invalid',case key when 'admin' then 'ADMIN' when 'super' then 'SUPERADMIN' else 'MEMBER' end,id from org_test_ids where key in ('member','admin','super','other');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,is_anonymous)
 select id,key||'@org-rls.invalid',now(),'{"role":"SUPERADMIN"}',false from org_test_ids where key in ('member','admin','super','other');
insert into public.org_weekly_hours(member_id,week_start,through_date,hours,source,import_key)
 values(pg_temp.test_id('member'),'2026-09-14','2026-09-20',4,'RLS fixture','rls-'||pg_temp.test_id('member'));
insert into public.org_projects(id,name) values(pg_temp.test_id('project'),'RLS project');
insert into public.org_tasks(id,project_id,title,assignee_id) values(pg_temp.test_id('task'),pg_temp.test_id('project'),'RLS task',pg_temp.test_id('member'));
insert into public.org_meetings(id,calendar_id,google_event_id,title,series,starts_at,ends_at) values
 (pg_temp.test_id('meeting'),'fixture','current','RLS meeting','Community',now()-interval '10 minutes',now()+interval '50 minutes'),
 (pg_temp.test_id('future'),'fixture','future','RLS future','Community',now()+interval '2 days',now()+interval '2 days 1 hour');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.test_id('member'),'email','super@org-rls.invalid','role','authenticated','user_metadata',jsonb_build_object('role','SUPERADMIN'))::text,true);
set local role authenticated;
select pg_temp.assert_true((public.org_context()->>'role')='MEMBER','metadata and spoofed JWT email cannot elevate');
select pg_temp.assert_true((select count(*) from public.members)=1,'member sees only own profile');
select pg_temp.assert_true((select count(*) from public.org_weekly_hours)=1,'member sees only own weekly totals');
do $$ begin
 begin insert into public.org_work_entries(member_id,date,hours) values(pg_temp.test_id('member'),'2026-09-16',1);raise exception 'weekly overlap allowed';exception when check_violation then null;end;
 begin insert into public.org_weekly_hours(member_id,week_start,through_date,hours,source,import_key) values(pg_temp.test_id('member'),'2026-09-21','2026-09-27',4,'forged','forged');raise exception 'member forged weekly total';exception when insufficient_privilege then null;end;
end $$;
select pg_temp.assert_true((select count(*) from public.org_tasks)=1,'member sees own task');
select pg_temp.assert_true((select count(*) from public.org_projects)=1,'assignee sees related project');
update public.members set name='RLS renamed' where id=pg_temp.test_id('member');
do $$ begin
 begin update public.members set is_admin=true where id=pg_temp.test_id('member');raise exception 'role escalation allowed';exception when insufficient_privilege then null;end;
 begin perform public.org_set_access('member@org-rls.invalid','SUPERADMIN',false);raise exception 'RPC escalation allowed';exception when insufficient_privilege then null;end;
 begin update public.org_tasks set priority='urgent' where id=pg_temp.test_id('task');raise exception 'member reprioritized task';exception when insufficient_privilege then null;end;
 begin insert into public.org_tasks(project_id,title) values(pg_temp.test_id('project'),'Illegal');raise exception 'member created task';exception when insufficient_privilege then null;end;
end $$;
update public.org_tasks set status='done' where id=pg_temp.test_id('task');
select pg_temp.assert_true((select completed_at is not null from public.org_tasks where id=pg_temp.test_id('task')),'completion timestamp persisted');
select pg_temp.assert_true((select count(*) from public.org_task_history where task_id=pg_temp.test_id('task') and new_status='done')=1,'completion history persisted');
update public.org_tasks set status='todo' where id=pg_temp.test_id('task');
select pg_temp.assert_true((select completed_at is null from public.org_tasks where id=pg_temp.test_id('task')),'reopened task timestamp reset');
insert into public.org_work_entries(member_id,date,hours) values(pg_temp.test_id('member'),(now() at time zone 'Europe/Ljubljana')::date,1.25);
select pg_temp.assert_true((select sum(hours) from public.org_work_entries)=1.25,'own hours persist');
do $$ begin
 begin insert into public.org_work_entries(member_id,date,hours) values(pg_temp.test_id('other'),current_date,1);raise exception 'foreign hours allowed';exception when insufficient_privilege then null;end;
 begin insert into public.org_work_entries(member_id,date,hours) values(pg_temp.test_id('member'),current_date,0.1);raise exception 'invalid hours allowed';exception when check_violation then null;end;
end $$;
insert into public.org_attendance(meeting_id,member_id,status) values(pg_temp.test_id('meeting'),pg_temp.test_id('member'),'present');
do $$ begin
 begin insert into public.org_attendance(meeting_id,member_id,status) values(pg_temp.test_id('meeting'),pg_temp.test_id('member'),'remote');raise exception 'duplicate attendance allowed';exception when unique_violation then null;end;
 begin insert into public.org_attendance(meeting_id,member_id,status) values(pg_temp.test_id('future'),pg_temp.test_id('member'),'present');raise exception 'future checkin allowed';exception when insufficient_privilege then null;end;
 begin update public.org_attendance set status='excused' where member_id=pg_temp.test_id('member');raise exception 'member excused self';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.test_id('other'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.assert_true((select count(*) from public.org_tasks)=0,'unrelated task hidden');
select pg_temp.assert_true((select count(*) from public.org_work_entries)=0,'unrelated hours hidden');
select pg_temp.assert_true((select count(*) from public.org_weekly_hours)=0,'unrelated weekly totals hidden');
select pg_temp.assert_true((select count(*) from public.org_attendance)=0,'unrelated attendance hidden');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.test_id('admin'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.assert_true(public.current_is_admin(),'admin trusted role');
select pg_temp.assert_true((select count(*) from public.members)>=24,'admin sees members');
insert into public.org_tasks(project_id,title,assignee_id,priority) values(pg_temp.test_id('project'),'Assigned by admin',pg_temp.test_id('other'),'high');
update public.org_attendance set status='excused',note='Admin correction' where member_id=pg_temp.test_id('member');
insert into public.org_attendance(meeting_id,member_id,status) values(pg_temp.test_id('future'),pg_temp.test_id('member'),'excused');
select pg_temp.assert_true((select count(*) from public.org_work_entries)>=1,'admin sees historical hours');
do $$ begin
 begin perform public.org_set_access('member@org-rls.invalid','SUPERADMIN',false);raise exception 'admin elevated member';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.test_id('super'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.org_list_access())>=24,'superadmin access list');
select public.org_set_access('other@org-rls.invalid','ADMIN',false);
update public.org_settings set name='RLS setting' where id=true;
select public.org_set_access('member@org-rls.invalid','MEMBER',true);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.test_id('member'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.assert_true(public.org_context() is null,'disabled access invalidates existing JWT immediately');
select pg_temp.assert_true((select count(*) from public.members)=0,'disabled member sees nothing');
reset role;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$ begin
 begin perform * from public.members;raise exception 'anonymous read allowed';exception when insufficient_privilege then null;end;
 begin perform public.org_context();raise exception 'anonymous RPC allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
