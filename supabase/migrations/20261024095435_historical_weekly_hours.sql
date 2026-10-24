-- Historical source contains weekly totals, not invented daily entries.
create table public.org_weekly_hours (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id),
 week_start date not null check(extract(isodow from week_start)=1),
 through_date date not null check(through_date>=week_start and through_date<week_start+7),
 hours numeric not null check(hours between 0 and 168 and mod(hours,0.25)=0),
 source text not null, import_key text not null unique, created_at timestamptz not null default now(), unique(member_id,week_start)
);
create index org_weekly_member on public.org_weekly_hours(member_id,week_start);
alter table public.org_weekly_hours enable row level security;
revoke all on public.org_weekly_hours from public,anon,authenticated;
grant select on public.org_weekly_hours to authenticated;
grant select,insert on public.org_weekly_hours to service_role;
create policy weekly_read on public.org_weekly_hours for select to authenticated using(member_id=(select org_private.member_id()) or (select org_private.admin()));
create function org_private.no_overlapping_hours() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(new.member_id::text||'hours-import'));
 if tg_table_name='org_work_entries' then
  if not new.deleted and exists(select 1 from public.org_weekly_hours h where h.member_id=new.member_id and new.date between h.week_start and h.through_date) then
   raise exception 'Historical weekly aggregate already covers this date; do not double-count hours' using errcode='23514';
  end if;
 else
  if exists(select 1 from public.org_work_entries w where w.member_id=new.member_id and not w.deleted and w.date between new.week_start and new.through_date) then
   raise exception 'Daily records overlap imported weekly total' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
revoke all on function org_private.no_overlapping_hours() from public,anon;
grant execute on function org_private.no_overlapping_hours() to authenticated,service_role;
create trigger org_no_overlap before insert or update on public.org_work_entries for each row execute function org_private.no_overlapping_hours();
create trigger org_no_overlap before insert on public.org_weekly_hours for each row execute function org_private.no_overlapping_hours();
