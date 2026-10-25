-- Reconcile task permissions with the existing historical attendance importer.
-- Apply after both historical migrations on fresh and upgraded databases.
-- No data rows are modified. Existing historical migration bytes stay unchanged.
begin;
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
  -- Preserve the already approved service-only historical INSERT path.
  -- UPDATE and all end-user operations retain the normal authorization guard.
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
commit;
