-- Keep write policies disjoint from SELECT while preserving the same authorization.
create index org_projects_created_by on public.org_projects(created_by);
create index org_tasks_created_by on public.org_tasks(created_by);
create index org_history_actor on public.org_task_history(actor_id);
create index org_attendance_recorded_by on public.org_attendance(recorded_by);
create index org_audit_actor on public.org_audit(actor_id);

drop policy projects_write on public.org_projects;
create policy projects_insert on public.org_projects for insert to authenticated with check((select org_private.admin()));
create policy projects_update on public.org_projects for update to authenticated using((select org_private.admin())) with check((select org_private.admin()));

drop policy project_members_write on public.org_project_members;
create policy project_members_insert on public.org_project_members for insert to authenticated with check((select org_private.admin()));
create policy project_members_delete on public.org_project_members for delete to authenticated using((select org_private.admin()));

drop policy attendance_write on public.org_attendance;
create policy attendance_insert on public.org_attendance for insert to authenticated with check((select org_private.admin()) or (member_id=(select org_private.member_id()) and status in ('present','remote') and org_private.eligible(meeting_id)));
create policy attendance_update on public.org_attendance for update to authenticated using(member_id=(select org_private.member_id()) or (select org_private.admin())) with check((select org_private.admin()) or (member_id=(select org_private.member_id()) and status in ('present','remote') and org_private.eligible(meeting_id)));
