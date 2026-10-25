-- Live sandbox acceptance using existing identities and historical meeting data.
-- No persistent fixture users, member changes, or attendance corrections.
begin;
create temporary table attendance_import_test as
select e.id meeting_id, m.id member_id, m.auth_user_id member_user,
 a.id other_member_id, a.auth_user_id admin_user,
 (select u.id from auth.users u join org_private.access x on x.auth_user_id=u.id
  where x.role='SUPERADMIN' and not x.disabled and u.email_confirmed_at is not null
  and not coalesce(u.is_anonymous,false) limit 1) super_user
from public.org_meetings e
join public.members m on m.email='ziga.krajnc@sandbox.example'
join public.members a on a.email='ana.kovac@sandbox.example'
where e.series='Community'
and (e.starts_at at time zone 'Europe/Ljubljana')::date='2026-09-14';
grant select on attendance_import_test to authenticated,service_role;
create function pg_temp.attendance_assert(ok boolean,label text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
select pg_temp.attendance_assert((select count(*)=1 and bool_and(member_user is not null and admin_user is not null and super_user is not null) from attendance_import_test),'existing sandbox prerequisites');

-- The same INSERT/ON CONFLICT behavior used by import-sandbox.mjs.
set local role service_role;
insert into public.org_attendance(meeting_id,member_id,status)
 select meeting_id,member_id,'present' from attendance_import_test
 on conflict(meeting_id,member_id) do nothing;
insert into public.org_attendance(meeting_id,member_id,status)
 select meeting_id,other_member_id,'present' from attendance_import_test
 on conflict(meeting_id,member_id) do nothing;
select pg_temp.attendance_assert((select count(*)=1 from public.org_attendance a join attendance_import_test t using(meeting_id,member_id)),'service historical insert');
do $$ begin
 begin
  insert into public.org_attendance(meeting_id,member_id,status)
   select meeting_id,member_id,'invalid' from attendance_import_test;
  raise exception 'invalid status accepted';
 exception when check_violation then null; end;
end $$;
reset role;

-- A spoofed service role in user-editable metadata remains an ordinary MEMBER.
select set_config('request.jwt.claims',jsonb_build_object('sub',member_user,'role','authenticated','user_metadata',jsonb_build_object('role','service_role'))::text,true) from attendance_import_test;
set local role authenticated;
select pg_temp.attendance_assert(public.org_context()->>'role'='MEMBER','trusted member identity');
select pg_temp.attendance_assert(not exists(select 1 from public.org_attendance where member_id<>(select member_id from attendance_import_test)),'other members attendance is private');
select pg_temp.attendance_assert(exists(select 1 from public.org_attendance where meeting_id=(select meeting_id from attendance_import_test)),'own historical attendance readable');
do $$ begin
 begin
  update public.org_attendance set status='remote'
   where meeting_id=(select meeting_id from attendance_import_test);
  raise exception 'historical self correction accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',admin_user,'role','authenticated')::text,true) from attendance_import_test;
set local role authenticated;
select pg_temp.attendance_assert(public.org_context()->>'role'='ADMIN','trusted admin identity');
select pg_temp.attendance_assert((select count(*)=2 from public.org_attendance a join attendance_import_test t on a.meeting_id=t.meeting_id and a.member_id in(t.member_id,t.other_member_id)),'admin reads both members');
update public.org_attendance set status='excused',note='transaction-only correction'
 where meeting_id=(select meeting_id from attendance_import_test)
 and member_id=(select member_id from attendance_import_test);
reset role;

-- Rerunning a different source status must preserve the administrator correction.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
insert into public.org_attendance(meeting_id,member_id,status)
 select meeting_id,member_id,'present' from attendance_import_test
 on conflict(meeting_id,member_id) do nothing;
select pg_temp.attendance_assert((select count(*)=1 and bool_and(a.status='excused' and a.note='transaction-only correction') from public.org_attendance a join attendance_import_test t using(meeting_id,member_id)),'rerun preserves correction without duplicate');
do $$ begin
 begin
  update public.org_attendance set status='remote'
   where meeting_id=(select meeting_id from attendance_import_test);
  raise exception 'service update acquired historical correction privileges';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',super_user,'role','authenticated')::text,true) from attendance_import_test;
set local role authenticated;
select pg_temp.attendance_assert(public.org_context()->>'role'='SUPERADMIN','trusted superadmin identity');
select pg_temp.attendance_assert((select count(*)=2 from public.org_attendance a join attendance_import_test t on a.meeting_id=t.meeting_id and a.member_id in(t.member_id,t.other_member_id)),'superadmin reads both members');
reset role;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$ begin
 begin perform * from public.org_attendance; raise exception 'anonymous read accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
