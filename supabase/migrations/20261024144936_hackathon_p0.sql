-- Generated with Supabase CLI migration new; rehearsed on an isolated restored snapshot.
-- Not applied to Supabase until the matching deployment is ready for release.
-- Apply as one transaction after a fresh backup and schema-drift check.
begin;

-- Retain review history; map only the current workflow state to In Progress.
alter table public.org_tasks drop constraint org_tasks_status_check;
update public.org_tasks set status='in_progress' where status='in_review';
alter table public.org_tasks add constraint org_tasks_status_check check(status in ('backlog','todo','in_progress','done'));

drop policy tasks_read on public.org_tasks;
create policy tasks_read on public.org_tasks for select to authenticated
using(org_private.project_access(project_id));
drop policy tasks_update on public.org_tasks;
create policy tasks_update on public.org_tasks for update to authenticated
using(assignee_id=(select org_private.member_id()) or (select org_private.admin()))
with check(org_private.project_access(project_id));

-- Private lookup exposes only the roster of a project the caller can already see.
create function org_private.task_directory() returns table(id uuid,name text,project_id uuid)
language sql stable security definer set search_path='' as $$
 select m.id,m.name,pm.project_id from public.org_project_members pm join public.members m on m.id=pm.member_id
 where org_private.role() is not null and org_private.project_access(pm.project_id)
$$;
create function public.org_task_directory() returns table(id uuid,name text,project_id uuid)
language sql stable security invoker set search_path='' as $$ select * from org_private.task_directory() $$;
revoke all on function org_private.task_directory(),public.org_task_directory() from public,anon;
grant execute on function org_private.task_directory(),public.org_task_directory() to authenticated;

create or replace function org_private.guard_changes() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then new.updated_at=clock_timestamp(); new.created_at=old.created_at; end if;
 if tg_table_name='org_tasks' then
  if tg_op='UPDATE' and not org_private.admin() then
   if old.assignee_id is distinct from org_private.member_id() or org_private.member_id() is null then
    raise exception 'Only the current assignee may edit this task' using errcode='42501';
   end if;
   if (to_jsonb(new)-array['status','description','priority','due_date','assignee_id','updated_at','completed_at']) is distinct from
      (to_jsonb(old)-array['status','description','priority','due_date','assignee_id','updated_at','completed_at']) then
    raise exception 'Task identity, title, project and archive state require an administrator' using errcode='42501';
   end if;
   if new.assignee_id is distinct from old.assignee_id and (new.assignee_id is null or not exists(
    select 1 from public.org_task_directory() d where d.project_id=old.project_id and d.id=new.assignee_id
   )) then raise exception 'Assignee must belong to this project' using errcode='42501'; end if;
  end if;
  if tg_op='INSERT' then new.completed_at=case when new.status='done' then now() else null end;
  elsif new.status is distinct from old.status then new.completed_at=case when new.status='done' then now() else null end;
  else new.completed_at=old.completed_at; end if;
 end if;
 if tg_table_name='org_attendance' then
  if not org_private.admin() and not exists(select 1 from public.org_meetings e where e.id=new.meeting_id and not e.cancelled and not e.all_day and now() between e.starts_at-interval '30 minutes' and e.ends_at+interval '2 hours' and org_private.eligible(e.id)) then
   raise exception 'Self check-in is outside the permitted meeting window' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (new.meeting_id<>old.meeting_id or new.member_id<>old.member_id) then raise exception 'Attendance identity is immutable'; end if;
  new.recorded_by=auth.uid();
 end if;
 if tg_table_name='org_work_entries' then
  if new.date>(now() at time zone 'Europe/Ljubljana')::date then raise exception 'Future work entries are not permitted'; end if;
  if tg_op='UPDATE' and new.member_id<>old.member_id then raise exception 'Work owner is immutable'; end if;
 end if;
 return new;
end $$;

-- One transaction for event references, roster replacement and cancellations.
-- Service-only invoker: no public function that bypasses RLS for user sessions.
create function public.org_apply_calendar(p_calendar_id text,p_events jsonb,p_cancelled text[]) returns void
language plpgsql security invoker set search_path='' as $$
declare e jsonb; meeting uuid;
begin
 if nullif(btrim(p_calendar_id),'') is null or length(p_calendar_id)>500 or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>25000 then
  raise exception 'Invalid calendar payload';
 end if;
 perform pg_advisory_xact_lock(hashtext('org-calendar:'||p_calendar_id));
 for e in select value from jsonb_array_elements(p_events) loop
  insert into public.org_meetings(calendar_id,google_event_id,ical_uid,recurring_event_id,original_start,title,description,series,starts_at,ends_at,timezone,all_day,location,meeting_url,cancelled,synced_at)
  values(p_calendar_id,e->>'google_event_id',e->>'ical_uid',e->>'recurring_event_id',e->>'original_start',e->>'title',e->>'description',e->>'series',(e->>'starts_at')::timestamptz,(e->>'ends_at')::timestamptz,e->>'timezone',(e->>'all_day')::boolean,e->>'location',e->>'meeting_url',(e->>'cancelled')::boolean,(e->>'synced_at')::timestamptz)
  on conflict(calendar_id,google_event_id) do update set ical_uid=excluded.ical_uid,recurring_event_id=excluded.recurring_event_id,original_start=excluded.original_start,title=excluded.title,description=excluded.description,series=excluded.series,starts_at=excluded.starts_at,ends_at=excluded.ends_at,timezone=excluded.timezone,all_day=excluded.all_day,location=excluded.location,meeting_url=excluded.meeting_url,cancelled=excluded.cancelled,synced_at=excluded.synced_at
  returning id into meeting;
  -- Missing/redacted/unresolved Google attendees must not erase a known roster.
  if jsonb_typeof(e->'member_ids')='array' then
   delete from public.org_meeting_members where meeting_id=meeting;
   insert into public.org_meeting_members(meeting_id,member_id)
   select meeting,value::uuid from jsonb_array_elements_text(e->'member_ids') group by value;
  end if;
 end loop;
 update public.org_meetings set cancelled=true,synced_at=clock_timestamp() where calendar_id=p_calendar_id and google_event_id=any(p_cancelled);
end $$;
revoke all on function public.org_apply_calendar(text,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.org_apply_calendar(text,jsonb,text[]) to service_role;
commit;
