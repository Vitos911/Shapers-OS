-- Local/disposable engine only. All fixtures are rolled back.
begin;
create temporary table release_ids(key text primary key,id uuid default gen_random_uuid());
insert into release_ids(key) values('owner'),('peer'),('admin'),('project'),('task'),('meeting');
grant select on release_ids to authenticated,service_role;
create function pg_temp.release_id(k text) returns uuid language sql as $$ select id from release_ids where key=k $$;
create function pg_temp.release_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into public.members(id,name,email,tier,weekly_hours,series)
 select id,key,id||'@release.invalid','Impact',10,'Community' from release_ids where key in ('owner','peer','admin');
insert into org_private.access(email,role,member_id)
 select id||'@release.invalid',case when key='admin' then 'ADMIN' else 'MEMBER' end,id
 from release_ids where key in ('owner','peer','admin');
insert into auth.users(id,email,email_confirmed_at) select id,id||'@release.invalid',now()
 from release_ids where key in ('owner','peer','admin');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.release_id('admin'))::text,true);
insert into public.org_projects(id,name) values(pg_temp.release_id('project'),'Release fixture');
insert into public.org_project_members(project_id,member_id)
 select pg_temp.release_id('project'),id from release_ids where key in ('owner','peer');
insert into public.org_tasks(id,project_id,title,assignee_id,status) values
 (pg_temp.release_id('task'),pg_temp.release_id('project'),'Fixture task',pg_temp.release_id('owner'),'backlog');
insert into public.org_meetings(id,calendar_id,google_event_id,title,series,starts_at,ends_at) values
 (pg_temp.release_id('meeting'),'release','historical','Historical fixture','Community','2026-09-22T12:00Z','2026-09-22T13:00Z');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.release_id('owner'))::text,true);
set local role authenticated;
update public.org_tasks set priority='high',due_date='2026-11-01',status='in_progress' where id=pg_temp.release_id('task');
select pg_temp.release_assert((select priority='high' and status='in_progress' from public.org_tasks where id=pg_temp.release_id('task')),'owner retains P0 priority/date/status edits');
do $$ begin
 begin update public.org_tasks set title='Forbidden rename' where id=pg_temp.release_id('task');
  raise exception 'Owner rename accepted'; exception when insufficient_privilege then null; end;
end $$;
update public.org_tasks set assignee_id=pg_temp.release_id('peer') where id=pg_temp.release_id('task');
select pg_temp.release_assert((select assignee_id=pg_temp.release_id('peer') from public.org_tasks where id=pg_temp.release_id('task')),'assignment to project peer allowed');
do $$ begin
 begin insert into public.org_attendance(meeting_id,member_id,status)
  values(pg_temp.release_id('meeting'),pg_temp.release_id('owner'),'present');
  raise exception 'End-user historical check-in accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','',true);
set local role service_role;
insert into public.org_attendance(meeting_id,member_id,status)
 values(pg_temp.release_id('meeting'),pg_temp.release_id('owner'),'present');
select pg_temp.release_assert((select count(*)=1 from public.org_attendance where meeting_id=pg_temp.release_id('meeting')),'service historical INSERT preserved');
do $$ begin
 begin update public.org_attendance set status='remote' where meeting_id=pg_temp.release_id('meeting');
  raise exception 'Service historical UPDATE bypass accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.release_id('owner'))::text,true);
set local role authenticated;
do $$ declare i integer; begin
 for i in 1..6 loop
  perform pg_temp.release_assert(public.org_reserve_ai_budget(),'six shared requests accepted');
 end loop;
 perform pg_temp.release_assert(not public.org_reserve_ai_budget(),'seventh request rejected across instances');
 begin update org_private.ai_usage set requests=0;
  raise exception 'User reset quota'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.release_id('peer'))::text,true);
set local role authenticated;
select pg_temp.release_assert(public.org_reserve_ai_budget(),'one user cannot consume another user minute budget');
reset role;
update org_private.ai_usage set requests=1000 where bucket='global-day';
set local role authenticated;
select pg_temp.release_assert(not public.org_reserve_ai_budget(),'global cap applies to all users');
reset role;
set local role anon;
do $$ begin
 begin perform public.org_reserve_ai_budget(); raise exception 'Anonymous budget access accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
