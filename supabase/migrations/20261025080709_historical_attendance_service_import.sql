-- Repair the existing service-key importer without granting helper access,
-- changing RLS, or promoting any application user. Keep the trigger SECURITY INVOKER.
create or replace function org_private.guard_changes() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then new.updated_at=clock_timestamp(); new.created_at=old.created_at; end if;
 if tg_table_name='org_tasks' then
  if tg_op='UPDATE' and not org_private.admin() and
   (to_jsonb(new)-array['status','description','updated_at','completed_at']) is distinct from (to_jsonb(old)-array['status','description','updated_at','completed_at']) then
   raise exception 'Only administrators can assign, rename, archive or reprioritize tasks' using errcode='42501';
  end if;
  if tg_op='INSERT' then new.completed_at=case when new.status='done' then now() else null end;
  elsif new.status is distinct from old.status then new.completed_at=case when new.status='done' then now() else null end;
  else new.completed_at=old.completed_at; end if;
 end if;
 if tg_table_name='org_attendance' then
  -- Only the actual database service role may INSERT historical attendance.
  -- End-user JWT metadata cannot select this branch; UPDATE keeps its old guard.
  if current_user <> 'service_role' or tg_op <> 'INSERT' then
   if not org_private.admin() and not exists(select 1 from public.org_meetings e where e.id=new.meeting_id and not e.cancelled and not e.all_day and now() between e.starts_at-interval '30 minutes' and e.ends_at+interval '2 hours' and org_private.eligible(e.id)) then
    raise exception 'Self check-in is outside the permitted meeting window' using errcode='42501';
   end if;
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
