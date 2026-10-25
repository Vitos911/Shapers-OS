-- Keep the original immutable scores available while version 2 uses 50/30/20.
-- No activity records, source policies, or finalized rows are rewritten.
alter table public.org_leaderboard_weeks drop constraint org_leaderboard_weeks_version_check;
alter table public.org_leaderboard_weeks add constraint org_leaderboard_weeks_version_check check (version in (1,2));
alter table public.org_leaderboard_weeks drop constraint org_leaderboard_weeks_pkey;
alter table public.org_leaderboard_weeks add primary key (week_start,version);
