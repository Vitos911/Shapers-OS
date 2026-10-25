-- Supabase default privileges grant service_role ALL on public tables.
-- Explicitly narrow this cache to append-only SQL access; row guards also
-- reject changes, but TRUNCATE would otherwise bypass row-level triggers.
revoke all on public.org_leaderboard_weeks from service_role;
grant select,insert on public.org_leaderboard_weeks to service_role;
