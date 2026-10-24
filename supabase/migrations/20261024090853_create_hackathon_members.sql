-- Existing remote migration restored to source control for fresh-checkout parity.
create table if not exists public.members (
 id uuid primary key default gen_random_uuid(), name text not null, email text not null unique,
 tier text not null check(tier in ('GO!','Impact','Core')), weekly_hours numeric(7,2) not null check(weekly_hours>0),
 is_admin boolean not null default false, auth_user_id uuid unique references auth.users(id) on delete set null, series text not null default ''
);
alter table public.members enable row level security;
create or replace function public.current_member_id() returns uuid language sql stable security definer set search_path='' as $$ select id from public.members where auth_user_id=(select auth.uid()) limit 1 $$;
create or replace function public.current_is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select is_admin from public.members where auth_user_id=(select auth.uid()) limit 1),false) $$;
revoke all on function public.current_member_id(),public.current_is_admin() from public,anon;
grant execute on function public.current_member_id(),public.current_is_admin() to authenticated;
create policy "members read own or admin" on public.members for select to authenticated using(id=public.current_member_id() or public.current_is_admin());
grant select on public.members to authenticated;
