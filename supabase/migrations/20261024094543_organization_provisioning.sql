-- Administrative CLI helpers. No browser role can execute these functions.
grant select,insert,update on public.members to service_role;
create function org_private.refresh_member_access() returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 insert into org_private.access(email,role,member_id,auth_user_id)
 select lower(btrim(email)),case when is_admin then 'ADMIN' else 'MEMBER' end,id,auth_user_id from public.members
 on conflict(email) do nothing;
 get diagnostics changed=row_count;
 return changed;
end $$;
create function public.org_refresh_member_access() returns integer language sql security invoker set search_path='' as $$ select org_private.refresh_member_access() $$;
create function org_private.bootstrap_access(emails text[]) returns integer language plpgsql security definer set search_path='' as $$
declare address text; changed integer=0;
begin
 if cardinality(emails) not between 1 and 10 then raise exception 'Explicit list of 1-10 administrators required';end if;
 foreach address in array emails loop
  address=lower(btrim(address));
  if address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or address like '%@sandbox.example' then raise exception 'Use explicitly approved real operator addresses';end if;
  insert into org_private.access(email,role,auth_user_id) values(address,'SUPERADMIN',(select id from auth.users where lower(btrim(email))=address and email_confirmed_at is not null and not coalesce(is_anonymous,false))) on conflict(email) do update set role='SUPERADMIN',disabled=false;
  insert into public.org_audit(entity,record_id,action,new_data) values('access',address,'EXPLICIT_OWNER_BOOTSTRAP','{"role":"SUPERADMIN"}');
  changed=changed+1;
 end loop;
 return changed;
end $$;
create function public.org_bootstrap_access(emails text[]) returns integer language sql security invoker set search_path='' as $$ select org_private.bootstrap_access(emails) $$;
revoke all on function org_private.refresh_member_access(),org_private.bootstrap_access(text[]),public.org_refresh_member_access(),public.org_bootstrap_access(text[]) from public,anon,authenticated;
grant execute on function org_private.refresh_member_access(),org_private.bootstrap_access(text[]),public.org_refresh_member_access(),public.org_bootstrap_access(text[]) to service_role;

-- Serialize changes for a member/day before checking the 24h daily cap.
create function org_private.work_daily_cap() returns trigger language plpgsql security invoker set search_path='' as $$
declare existing numeric;
begin
 if new.deleted then return new;end if;
 perform pg_advisory_xact_lock(hashtext(new.member_id::text||new.date::text));
 select coalesce(sum(hours),0) into existing from public.org_work_entries where member_id=new.member_id and date=new.date and id<>new.id and not deleted;
 if existing+new.hours>24 then raise exception 'Daily hours exceed 24' using errcode='23514';end if;
 return new;
end $$;
revoke all on function org_private.work_daily_cap() from public,anon;
grant execute on function org_private.work_daily_cap() to authenticated,service_role;
create trigger org_daily_cap before insert or update on public.org_work_entries for each row execute function org_private.work_daily_cap();
