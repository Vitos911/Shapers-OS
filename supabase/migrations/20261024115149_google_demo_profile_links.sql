-- Google OAuth itself does not require a schema change. Demo aliases do: preserve
-- both the fictional login and an explicitly approved real login for one member.
alter table org_private.access drop constraint access_member_id_key;
create index access_member_id_idx on org_private.access(member_id);

create function org_private.approve_demo_link(real_email text,sandbox_email text,approved_role text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.members%rowtype; account auth.users%rowtype; previous org_private.access%rowtype; base_role text;
begin
 real_email=lower(btrim(real_email));sandbox_email=lower(btrim(sandbox_email));
 if real_email like '%@sandbox.example' or real_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or sandbox_email not like '%@sandbox.example' then raise exception 'Explicit real-to-fictional sandbox mapping required';end if;
 if approved_role not in ('MEMBER','ADMIN','SUPERADMIN') or approved_role is null then raise exception 'Explicit role required';end if;
 perform pg_advisory_xact_lock(hashtext('org_access_change'));
 select * into target from public.members where lower(btrim(email))=sandbox_email;
 if not found then raise exception 'Unknown sandbox profile';end if;
 select role into base_role from org_private.access where email=sandbox_email and member_id=target.id and not disabled;
 if base_role is distinct from (case when approved_role='SUPERADMIN' then 'ADMIN' else approved_role end) then raise exception 'Sandbox profile role does not match explicit approval';end if;
 select * into account from auth.users u where lower(btrim(u.email))=real_email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now()) and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
 if not found then raise exception 'Real account must complete verified Google sign-in first';end if;
 select * into previous from org_private.access where email=real_email;
 if previous.email is not null and (previous.disabled or previous.role<>approved_role or (previous.member_id is not null and previous.member_id<>target.id) or (previous.auth_user_id is not null and previous.auth_user_id<>account.id)) then raise exception 'Existing approved access conflicts; resolve explicitly, not through demo linking';end if;
 if approved_role='SUPERADMIN' and previous.email is null then raise exception 'Demo mapping cannot create a superadmin; explicit separate bootstrap required';end if;
 if previous.member_id=target.id and previous.auth_user_id=account.id then return target.id;end if;
 insert into org_private.access(email,role,member_id,auth_user_id) values(real_email,approved_role,target.id,account.id)
 on conflict(email) do update set member_id=excluded.member_id,auth_user_id=excluded.auth_user_id;
 insert into public.org_audit(entity,record_id,action,old_data,new_data) values('access',real_email,'DEMO_LINK_APPROVED',case when previous.email is not null then to_jsonb(previous) end,jsonb_build_object('member_id',target.id,'role',approved_role));
 return target.id;
end $$;
create function public.org_approve_demo_link(real_email text,sandbox_email text,approved_role text) returns uuid
language sql security invoker set search_path='' as $$ select org_private.approve_demo_link(real_email,sandbox_email,approved_role) $$;

create function org_private.remove_demo_link(real_email text) returns void language plpgsql security definer set search_path='' as $$
declare previous org_private.access%rowtype;
begin
 real_email=lower(btrim(real_email));perform pg_advisory_xact_lock(hashtext('org_access_change'));
 select a.* into previous from org_private.access a join public.members m on m.id=a.member_id where a.email=real_email and a.email not like '%@sandbox.example' and m.email like '%@sandbox.example';
 if not found then raise exception 'No approved real-to-sandbox mapping exists';end if;
 update org_private.access set member_id=null,disabled=(role<>'SUPERADMIN' or disabled) where email=real_email;
 insert into public.org_audit(entity,record_id,action,old_data,new_data) values('access',real_email,'DEMO_LINK_REMOVED',to_jsonb(previous),jsonb_build_object('member_id',null,'disabled',previous.role<>'SUPERADMIN' or previous.disabled));
end $$;
create function public.org_remove_demo_link(real_email text) returns void language sql security invoker set search_path='' as $$ select org_private.remove_demo_link(real_email) $$;

revoke all on function org_private.approve_demo_link(text,text,text),public.org_approve_demo_link(text,text,text),org_private.remove_demo_link(text),public.org_remove_demo_link(text) from public,anon,authenticated;
grant execute on function org_private.approve_demo_link(text,text,text),public.org_approve_demo_link(text,text,text),org_private.remove_demo_link(text),public.org_remove_demo_link(text) to service_role;
