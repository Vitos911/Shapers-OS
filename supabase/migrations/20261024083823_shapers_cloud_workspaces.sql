-- Applied migration version: 20261024083823 (Supabase history).
-- Cloud documents preserve the existing versioned workspace format atomically.
-- ACLs are independent of the community's descriptive member records.
create schema if not exists shapers_private;
revoke all on schema shapers_private from public, anon;
grant usage on schema shapers_private to authenticated;

create function public.shapers_valid_payload(p jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare
  section text;
  item jsonb;
  required text[];
  field text;
begin
  if jsonb_typeof(p) <> 'object' or p->'version' is distinct from '1'::jsonb or octet_length(p::text) > 5000000 then return false; end if;
  foreach section in array array['projects','members','events','entries','tasks'] loop
    if jsonb_typeof(p->section) is distinct from 'array' or jsonb_array_length(p->section) > 10000 then return false; end if;
    required := case section
      when 'projects' then array['id','name','description','category','status','due','createdAt']
      when 'members' then array['id','name','role','createdAt']
      when 'events' then array['id','name','date','time','location','createdAt']
      when 'entries' then array['id','projectId','memberId','date','note','createdAt']
      else array['id','projectId','title','createdAt'] end;
    if (select count(*) <> count(distinct x->>'id') from jsonb_array_elements(p->section) x) then return false; end if;
    for item in select value from jsonb_array_elements(p->section) loop
      if jsonb_typeof(item) <> 'object' or length(btrim(item->>'id')) = 0 then return false; end if;
      foreach field in array required loop
        if jsonb_typeof(item->field) is distinct from 'string' or length(item->>field) > 5000 then return false; end if;
      end loop;
      if section in ('projects','members','events') and length(btrim(item->>'name')) = 0 then return false; end if;
      if section = 'projects' then
        if item->>'status' not in ('Načrtovanje','V teku','Zaključeno') or item->>'category' not in ('Skupnost','Izobraževanje','Trajnost','Zdravje','Drugo') then return false; end if;
        if item->>'due' <> '' and ((item->>'due') !~ '^\d{4}-\d{2}-\d{2}$' or ((item->>'due')::date)::text <> item->>'due') then return false; end if;
      end if;
      if section in ('events','entries') and ((item->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or ((item->>'date')::date)::text <> item->>'date') then return false; end if;
      if section = 'events' then
        if item->>'time' !~ '^([01]\d|2[0-3]):[0-5]\d$' or jsonb_typeof(item->'attendees') is distinct from 'array' then return false; end if;
        if (select count(*) <> count(distinct x) from jsonb_array_elements_text(item->'attendees') x) or exists (select 1 from jsonb_array_elements_text(item->'attendees') attendee where not exists (select 1 from jsonb_array_elements(p->'members') m where m->>'id' = attendee)) then return false; end if;
      end if;
      if section in ('tasks','entries') and not exists (select 1 from jsonb_array_elements(p->'projects') project where project->>'id' = item->>'projectId') then return false; end if;
      if section = 'tasks' and (jsonb_typeof(item->'done') is distinct from 'boolean' or length(btrim(item->>'title')) = 0) then return false; end if;
      if section = 'entries' then
        if jsonb_typeof(item->'hours') is distinct from 'number' or (item->>'hours')::numeric < 0.25 or (item->>'hours')::numeric > 24 or mod((item->>'hours')::numeric * 4, 1) <> 0 then return false; end if;
        if not exists (select 1 from jsonb_array_elements(p->'members') member where member->>'id' = item->>'memberId') then return false; end if;
      end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.shapers_valid_payload(jsonb) from public, anon;
grant execute on function public.shapers_valid_payload(jsonb) to authenticated;

create table public.shapers_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  payload jsonb not null default '{"version":1,"projects":[],"members":[],"events":[],"entries":[],"tasks":[]}'::jsonb check (public.shapers_valid_payload(payload)),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shapers_workspaces_owner_idx on public.shapers_workspaces(owner_id);
create table public.shapers_workspace_access (
  workspace_id uuid not null references public.shapers_workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email) <= 254),
  role text not null check (role in ('editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, email)
);
create index shapers_workspace_access_email_idx on public.shapers_workspace_access(email);

-- Private, non-API helpers read authoritative verified email addresses.
-- No user-editable metadata or stale JWT email claims authorize access.
create function shapers_private.verified_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null and u.is_anonymous is not true
  );
$$;
create function shapers_private.can_access(workspace uuid, editing boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.shapers_workspaces w join auth.users u on u.id = (select auth.uid())
    where w.id = workspace and u.email_confirmed_at is not null and u.is_anonymous is not true
      and (w.owner_id = u.id or exists (
        select 1 from public.shapers_workspace_access a
        where a.workspace_id = w.id and a.email = lower(u.email) and (not editing or a.role = 'editor')
      ))
  );
$$;
revoke all on function shapers_private.verified_user() from public, anon, authenticated;
revoke all on function shapers_private.can_access(uuid, boolean) from public, anon, authenticated;
grant execute on function shapers_private.verified_user() to authenticated;
grant execute on function shapers_private.can_access(uuid, boolean) to authenticated;

create function shapers_private.bump_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function shapers_private.bump_revision() from public, anon, authenticated;
create trigger shapers_workspace_revision before update on public.shapers_workspaces
for each row execute function shapers_private.bump_revision();

alter table public.shapers_workspaces enable row level security;
alter table public.shapers_workspace_access enable row level security;
revoke all on public.shapers_workspaces from public, anon, authenticated;
revoke all on public.shapers_workspace_access from public, anon, authenticated;
grant select on public.shapers_workspaces to authenticated;
grant insert (owner_id, name, payload) on public.shapers_workspaces to authenticated;
grant update (name, payload) on public.shapers_workspaces to authenticated;
grant select, insert, delete on public.shapers_workspace_access to authenticated;
grant update (role) on public.shapers_workspace_access to authenticated;

create policy shapers_workspace_read on public.shapers_workspaces for select to authenticated
using ((select shapers_private.can_access(id, false)));
create policy shapers_workspace_create on public.shapers_workspaces for insert to authenticated
with check (owner_id = (select auth.uid()) and (select shapers_private.verified_user()));
create policy shapers_workspace_update on public.shapers_workspaces for update to authenticated
using ((select shapers_private.can_access(id, true)))
with check ((select shapers_private.can_access(id, true)));
create policy shapers_access_read on public.shapers_workspace_access for select to authenticated
using (exists (select 1 from public.shapers_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy shapers_access_create on public.shapers_workspace_access for insert to authenticated
with check (exists (select 1 from public.shapers_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy shapers_access_update on public.shapers_workspace_access for update to authenticated
using (exists (select 1 from public.shapers_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
with check (exists (select 1 from public.shapers_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy shapers_access_delete on public.shapers_workspace_access for delete to authenticated
using (exists (select 1 from public.shapers_workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));

-- The project's pre-existing DDL event trigger needs no Data API execution grant.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
