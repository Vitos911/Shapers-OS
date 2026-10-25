-- Private operational counters only; no organization activity is fabricated/changed.
create table org_private.ai_usage (
 bucket text not null, window_start timestamptz not null, requests integer not null check(requests>=0),
 primary key(bucket,window_start)
);
alter table org_private.ai_usage enable row level security;
revoke all on org_private.ai_usage from public,anon,authenticated,service_role;

create function org_private.reserve_ai_budget() returns boolean
language plpgsql security definer set search_path='' as $$
declare
 actor uuid=auth.uid(); at_time timestamptz=clock_timestamp();
 minute_start timestamptz; day_start timestamptz; bucket_names text[]; bucket_times timestamptz[]; caps integer[]=array[6,60,1000]; i integer;
begin
 if actor is null or org_private.role() is null then
  raise exception 'Approved organization identity required' using errcode='42501';
 end if;
 minute_start=date_trunc('minute',at_time);
 day_start=date_trunc('day',at_time at time zone 'UTC') at time zone 'UTC';
 bucket_names=array['user-minute:'||actor::text,'user-day:'||actor::text,'global-day'];
 bucket_times=array[minute_start,day_start,day_start];
 -- One transaction-wide lock prevents overspending across instances and users.
 perform pg_advisory_xact_lock(171358,1);
 for i in 1..3 loop
  if coalesce((select requests from org_private.ai_usage where bucket=bucket_names[i] and window_start=bucket_times[i]),0)>=caps[i] then
   return false;
  end if;
 end loop;
 for i in 1..3 loop
  insert into org_private.ai_usage(bucket,window_start,requests) values(bucket_names[i],bucket_times[i],1)
  on conflict(bucket,window_start) do update set requests=org_private.ai_usage.requests+1;
 end loop;
 delete from org_private.ai_usage where window_start<day_start-interval '2 days';
 return true;
end $$;
revoke all on function org_private.reserve_ai_budget() from public,anon,authenticated,service_role;
grant execute on function org_private.reserve_ai_budget() to authenticated;
create function public.org_reserve_ai_budget() returns boolean
language sql security invoker set search_path='' as $$ select org_private.reserve_ai_budget() $$;
revoke all on function public.org_reserve_ai_budget() from public,anon,authenticated,service_role;
grant execute on function public.org_reserve_ai_budget() to authenticated;
