-- Entire test is disposable and rolls back, including Auth/identity fixtures.
begin;
create temporary table google_test_ids(key text primary key,id uuid default gen_random_uuid());
insert into google_test_ids(key) values('canonical-member'),('canonical-admin'),('google-member'),('google-admin'),('google-super'),('unknown-google'),('unverified-google'),('profile-member'),('profile-admin');
grant select on google_test_ids to authenticated,anon,service_role;
create function pg_temp.gid(k text) returns uuid language sql as $$ select id from google_test_ids where key=k $$;
create function pg_temp.check_google(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;end $$;
insert into public.members(id,name,email,tier,weekly_hours,is_admin,series) values
 (pg_temp.gid('profile-member'),'Google RLS member','oauth-member@sandbox.example','GO!',4,false,'Community'),
 (pg_temp.gid('profile-admin'),'Google RLS admin','oauth-admin@sandbox.example','Core',70,true,'Community');
insert into org_private.access(email,role,member_id) values('oauth-member@sandbox.example','MEMBER',pg_temp.gid('profile-member')),('oauth-admin@sandbox.example','ADMIN',pg_temp.gid('profile-admin'));
insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
 select id,case key when 'canonical-member' then 'oauth-member@sandbox.example' when 'canonical-admin' then 'oauth-admin@sandbox.example' else key||'@google-test.invalid' end,case when key='unverified-google' then null else now() end,false,'{"role":"SUPERADMIN","is_admin":true}'::jsonb from google_test_ids where key not like 'profile-%';
insert into auth.identities(provider_id,user_id,provider,identity_data)
 select id::text,id,'google',jsonb_build_object('sub',id::text,'email',key||'@google-test.invalid','email_verified',key<>'unverified-google') from google_test_ids where key like 'google-%' or key in ('unknown-google','unverified-google');
insert into org_private.access(email,role,auth_user_id) values('google-super@google-test.invalid','SUPERADMIN',pg_temp.gid('google-super'));
select pg_temp.check_google(not has_function_privilege('authenticated','public.org_approve_demo_link(text,text,text)','execute'),'member/admin cannot approve aliases');
select pg_temp.check_google(not has_function_privilege('anon','public.org_remove_demo_link(text)','execute'),'anonymous cannot remove aliases');
set local role service_role;
select public.org_approve_demo_link('google-member@google-test.invalid','oauth-member@sandbox.example','MEMBER');
select public.org_approve_demo_link('google-member@google-test.invalid','oauth-member@sandbox.example','MEMBER');
select public.org_approve_demo_link('google-admin@google-test.invalid','oauth-admin@sandbox.example','ADMIN');
select public.org_approve_demo_link('google-super@google-test.invalid','oauth-admin@sandbox.example','SUPERADMIN');
do $$ begin
 begin perform public.org_approve_demo_link('unknown-google@google-test.invalid','oauth-admin@sandbox.example','SUPERADMIN');raise exception 'automatic superadmin allowed';exception when raise_exception then if sqlerrm='automatic superadmin allowed' then raise;end if;end;
 begin perform public.org_approve_demo_link('unverified-google@google-test.invalid','oauth-member@sandbox.example','MEMBER');raise exception 'unverified identity accepted';exception when raise_exception then if sqlerrm='unverified identity accepted' then raise;end if;end;
 begin perform public.org_approve_demo_link('google-member@google-test.invalid','oauth-admin@sandbox.example','ADMIN');raise exception 'implicit role upgrade allowed';exception when raise_exception then if sqlerrm='implicit role upgrade allowed' then raise;end if;end;
end $$;
reset role;
select pg_temp.check_google((select auth_user_id=pg_temp.gid('canonical-member') from public.members where id=pg_temp.gid('profile-member')),'original fictional login remains linked');
select pg_temp.check_google((select count(*) from org_private.access where member_id=pg_temp.gid('profile-admin'))=3,'canonical/admin/super aliases share one original profile');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.gid('google-member'),'role','authenticated','email','google-super@google-test.invalid','user_metadata',jsonb_build_object('role','SUPERADMIN'))::text,true);
set local role authenticated;
select pg_temp.check_google(public.org_context()->>'role'='MEMBER','Google member metadata cannot elevate');
select pg_temp.check_google((public.org_context()->>'member_id')::uuid=pg_temp.gid('profile-member'),'real account resolves existing member UUID');
select pg_temp.check_google((select count(*) from public.members)=1,'Google member sees only mapped profile');
do $$ begin begin perform public.org_set_access('google-member@google-test.invalid','SUPERADMIN',false);raise exception 'member upgraded role';exception when insufficient_privilege then null;end;end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.gid('google-admin'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.check_google(public.org_context()->>'role'='ADMIN','explicit Google ADMIN role retained');
select pg_temp.check_google((select count(*) from public.members)>=22,'Google admin sees organization');
do $$ begin begin perform public.org_list_access();raise exception 'admin read role management';exception when insufficient_privilege then null;end;end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.gid('google-super'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.check_google(public.org_context()->>'role'='SUPERADMIN','only pre-approved SUPERADMIN retained');
select pg_temp.check_google(jsonb_array_length(public.org_list_access())>0,'superadmin can manage trusted access');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.gid('unknown-google'),'role','authenticated','user_metadata',jsonb_build_object('role','SUPERADMIN'))::text,true);
set local role authenticated;
select pg_temp.check_google(public.org_context() is null,'unapproved verified Google account has no organization access');
select pg_temp.check_google((select count(*) from public.members)=0,'RLS denies organization data for unapproved Google user');
reset role;
set local role service_role;
select public.org_remove_demo_link('google-member@google-test.invalid');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.gid('google-member'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.check_google(public.org_context() is null,'removed demo alias loses access with existing JWT');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.gid('canonical-member'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.check_google(public.org_context()->>'role'='MEMBER','original sandbox login still works after unlinking real alias');
reset role;
rollback;
