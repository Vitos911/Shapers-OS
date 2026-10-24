-- Run with an administrative SQL connection. All fixtures roll back.
begin;
do $$
declare
  owner uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  editor uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  unverified uuid := gen_random_uuid();
  workspace uuid;
  changed integer;
  rev bigint;
  email_suffix text := gen_random_uuid()::text || '@example.invalid';
begin
  insert into auth.users (id, email, email_confirmed_at, is_anonymous)
  values (owner, 'owner-' || email_suffix, now(), false),
         (viewer, 'viewer-' || email_suffix, now(), false),
         (editor, 'editor-' || email_suffix, now(), false),
         (outsider, 'outsider-' || email_suffix, now(), false),
         (unverified, 'unverified-' || email_suffix, null, false);

  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner,'role','authenticated')::text, true);
  set local role authenticated;
  assert shapers_private.verified_user(), 'verified fixture must be recognized';
  insert into public.shapers_workspaces (owner_id,name) values (owner,'RLS test fixture') returning id into workspace;
  assert public.shapers_workspace_can_edit(workspace), 'owner must edit';
  insert into public.shapers_workspace_access (workspace_id,email,role) values
    (workspace,'viewer-' || email_suffix,'viewer'), (workspace,'editor-' || email_suffix,'editor');
  update public.shapers_workspaces set name='Updated' where id=workspace and revision=1 returning revision into rev;
  assert rev=2, 'server must increment revision';
  update public.shapers_workspaces set name='Stale write' where id=workspace and revision=1;
  get diagnostics changed = row_count;
  assert changed=0, 'stale writes must affect zero rows';
  begin
    update public.shapers_workspaces set owner_id=outsider where id=workspace;
    raise exception 'ownership update unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.shapers_workspaces set payload='{"version":1}'::jsonb where id=workspace;
    raise exception 'invalid payload unexpectedly allowed';
  exception when check_violation then null; end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',viewer,'role','authenticated')::text, true);
  assert (select count(*)=1 from public.shapers_workspaces where id=workspace), 'viewer must read';
  assert not public.shapers_workspace_can_edit(workspace), 'viewer must not edit';
  update public.shapers_workspaces set name='Viewer edit' where id=workspace;
  get diagnostics changed = row_count;
  assert changed=0, 'viewer write must be denied';

  perform set_config('request.jwt.claims', jsonb_build_object('sub',editor,'role','authenticated')::text, true);
  update public.shapers_workspaces set name='Editor update' where id=workspace and revision=2 returning revision into rev;
  assert rev=3, 'editor must be able to save';
  begin
    insert into public.shapers_workspace_access(workspace_id,email,role) values(workspace,'unauthorized-' || email_suffix,'editor');
    raise exception 'editor unexpectedly allowed to grant access';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',outsider,'role','authenticated','email','viewer-' || email_suffix)::text, true);
  assert (select count(*)=0 from public.shapers_workspaces where id=workspace), 'outsider must not read even with a spoofed JWT email';
  update public.shapers_workspaces set name='Outsider edit' where id=workspace;
  get diagnostics changed = row_count;
  assert changed=0, 'outsider must not write';

  perform set_config('request.jwt.claims', jsonb_build_object('sub',unverified,'role','authenticated')::text, true);
  begin
    insert into public.shapers_workspaces(owner_id,name) values(unverified,'Unverified');
    raise exception 'unverified account unexpectedly allowed';
  exception when insufficient_privilege then null; end;

  set local role anon;
  begin
    perform * from public.shapers_workspaces;
    raise exception 'anonymous read unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  reset role;
  assert public.shapers_valid_payload('{"version":1,"projects":[],"members":[],"events":[],"entries":[],"tasks":[]}'::jsonb), 'empty document must be valid';
end;
$$;
rollback;
select 'PASS: owner/editor/viewer/outsider/unverified/anon isolation, ACL ownership, validation and revision conflicts; all fixtures rolled back' as result;
