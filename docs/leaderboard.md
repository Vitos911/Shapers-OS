# Shapers OS Leaderboard 2.0

Implemented in the existing organization app. The full view, overview widget and profile
share the authenticated `/api/org/leaderboard` endpoint. Existing work editors, tasks,
Calendar, Slack, Google login, access roles and source RLS policies are preserved.

## Scoring and evidence

Version **2** uses Ljubljana Monday–Sunday calendar weeks and server time. Scores remain
in the range 0–100 and use full precision for ranking, with one decimal displayed.

| Category | Maximum | Rule |
| --- | ---: | --- |
| Completed tasks | 50 | 10 per distinct legitimate completion in this week; cap at 5 |
| Logged hours | 30 | `30 * min(hours / members.weekly_hours, 1)` |
| Attendance | 20 | `20 * attended / relevant` |

The database currently has GO! 4h, Impact 10h and Core 70h targets. Custom positive targets
from the database are respected; invalid targets fail the response instead of guessing.
Tasks count by first completion date, regardless of their deadline. The task must still
be done, assigned to the credited member and not archived at the scoring cutoff. Reopening
removes current credit. Repeated completion events or moving a deadline never mint another
credit. Done timestamps without legitimate history do not establish completion credit.

Present and Remote count as attendance. Excused is removed from the denominator;
Unexcused or a missing attendance record is an absence. Only relevant, ended,
non-cancelled meetings count. A meeting crossing Sunday midnight belongs to the local
week of its end. With no relevant non-excused meetings, use `(tasks + hours) / 80 * 100`.
Tasks remain a 50-point category even when none have been assigned. Streaks and badges
never increase the score.

Hours reuse the existing `weeklyStreak` coverage accounting: imported weekly totals
replace daily entries within their inclusive coverage only. Later uncovered entries
still count. Daily work, task and meeting IDs are deduplicated defensively. Future,
deleted, foreign or covered work does not add hours. Imported totals are never distributed
across invented days.

The existing private temporal ledger reconstructs member targets, tasks, hours and
meeting eligibility at cutoff. Closed scores are immutable. The API automatically catches
up fully observed completed weeks using evidence immediately before the next local Monday.
Source tracking began on 24 October 2026; the first fully observed week starts 26 October.
Older historical rankings and rank movement remain unavailable. The first partial week is
provisional, and early meeting requirements in that week use the existing provisional
eligibility fallback.

## Activity streak and achievements

A successful week requires BOTH the target hours and at least one completed task OR
relevant attended meeting. Only completed, fully observed weeks count. The current week
cannot break or increment the run. A failed closed week resets current streak while the
longest verified run is retained. No observed closed week means no invented longest run.
The per-week target comes from that week's immutable score, preserving target changes.

The UI displays current/longest streak and next milestone (3, 4, 8, 10, 12, 26, 52 and
subsequent multiples of 52). Flame intensity distinguishes 0, 1–2, 3–5, 6–9 and 10+ weeks.
Counts always accompany colors. The existing dashboard's hours-only streak remains an
independent, explicitly explained legacy measure; its counting and editor behavior are
preserved.

| Badge | Evidence required |
| --- | --- |
| First Steps | First legitimate task completion |
| Task Master | First completions of 10 distinct tasks |
| On Fire | Best activity streak of 3 weeks |
| Unstoppable | Best activity streak of 8 weeks |
| Perfect Attendance | Perfect run of at least 3 observed relevant meetings |
| Goal Crusher | Target reached in the current or a finalized observed week |
| Consistency Champion | Best activity streak of 4 weeks |
| Always There | Existing badge: 5 consecutive observed relevant attended meetings |
| Perfect Week | Existing badge: finalized 100 with all three categories applicable |

Excused/cancelled meetings are skipped for attendance runs; missing/unexcused attendance
breaks them. Pre-tracking eligibility does not unlock attendance badges. The seven
requested badges plus the two existing badges are shown locked/unlocked without mock data.

## Views and privacy

- Four current-week performance cards: rank and movement, completed tasks with daily chart
  and prior-week delta, actual hours/target/percentage, and activity streak/milestone.
- Desktop podium is silver–gold–bronze, with rank 1 larger in the center. Mobile uses rank
  order. Each shows initials, full name, tier, points, task count and exact streak length.
- Desktop table and mobile member cards share rank, tasks, hours, attendance, streak and
  points. Own row is marked. Rank numbers always refer to the full period ranking, even
  during search, sorting or tier filtering. Exact ties use stable member UUID ordering.
- Search by name, all/GO!/Impact/Core filters, and sorting by points, name, tasks, target
  fulfillment, attendance or streak. Historical/previous-week controls are retained.
- This Week scores the current partial week. This Month and All Time average observed
  weekly scores, including the provisional current week. The month view includes weeks
  overlapping the current Ljubljana calendar month; the UI states this explicitly.
  These are weekly comparisons, not an invented daily split of imported weekly totals.
- Aggregated period rows sum actual tasks/hours/targets/attendance and average weekly
  scores. Breakdown category points are weekly means; normalized final score is the
  mean of each independently normalized week, not a normalization of mean categories.
- Personal cards always describe the current week, regardless of the selected ranking
  period. Prior-week deltas are null when that week is unavailable. Rank changes additionally
  require the same member tier/target. All-time changes are not fabricated.
- Shared member rows expose only the specified aggregate summary and no source records,
  emails, auth IDs, task titles, descriptions or attendance reasons. Category breakdowns
  remain own-member or ADMIN/SUPERADMIN only. The server constructs the response allowlist.
- Admin Analytics adds top task contributors, target fulfillment by tier, members below
  their target, meeting attendance and up to 12 weekly trends. Below-target lists and
  trend payloads are excluded from MEMBER responses. The UI notes unfinished current weeks.
- The API rejects unknown/duplicate filters, arbitrary member IDs, invalid/future/non-Monday
  weeks, invalid periods and contradictory period+week requests. It authenticates before
  privileged source access and returns private no-store responses. No client point writes.

## Projects imported from the public website

Verified against [the official homepage](https://www.globalshapers.si/sl/) and
[the live NVO catalog](https://www.globalshapers.si/subvencije/) on 25 October 2026:

1. Shapers Academy — active
2. Poletna šola Pot do uspeha — active
3. Shape Talks — active
4. Predavanja in delavnice — active
5. Obiski šol — active
6. Mreža mentorjev — planning (the website says Kmalu)
7. Programska oprema za NVO — active

Six source-linked projects already existed when this request started; they were verified
and preserved. The missing NVO catalog was inserted. Existing test projects were retained.
`scripts/import-website-projects.sql` reproduces the seven-project import idempotently,
using existing import keys/name matching and no generated hardcoded IDs. Existing records
are not overwritten. All seven now exist in Supabase. Running the script twice inside a
rollback-only transaction left every project row unchanged. No assignments, tasks, hours
or attendance were fabricated. Existing RLS still limits ordinary members to assigned
projects; administrators can manage all seven and assign members through the existing UI.

## Design reference lock

Build target: the current Shapers OS, documented in `docs/ui-redesign.md`, plus the owner's
Leaderboard 2.0 brief. Keep existing Inter, white/blue workspace, thin borders, compact
labels, native controls and scoped CSS. Live Refero research returned NO_SUBSCRIPTION;
no live Refero style results are claimed. Bundled craft/color guidance informs keyboard
focus, readable semantic accents, touch targets and reduced-motion handling.

| Choice | Source and role |
| --- | --- |
| Existing shell, typography, blue controls and 8px corners | Current Shapers design system |
| Four KPI cards and desktop 2–1–3 podium | Owner's attached prompt |
| Blue tasks, green hours, orange flames and medal colors | Owner's semantic color hierarchy |
| Limited gradients on rank, flame and winner cards | Owner's subtle-gradient requirement |
| Native progress, visible text, labeled search/sort and mobile cards | Owner brief + craft accessibility guidance |
| Short earned-badge entrance and 10+ flame pulse, with reduced-motion override | Owner brief + restrained motion guidance |

No new imagery, font requests, dependencies or dark theme were introduced; the existing
application has a light theme. Screenshot QA at 390/768/1440px checks the implemented
layout against this target, including long real names, the full member roster and badges.

## Changed files for this request

- `lib/leaderboard.ts`: version 2 scoring, aggregate summaries, closed-week streaks, badges,
  stable privacy projection, and period aggregation.
- `lib/leaderboard-server.ts`: current personal metrics, immutable version-aware cache,
  month/all aggregation, comparisons and role-limited analytics.
- `app/api/org/leaderboard/route.ts`: period validation and loading.
- `lib/org-server.ts`: deterministic version ordering when paginating cached weeks.
- `components/leaderboard.tsx`, `components/leaderboard.module.css`: full UI, widget and profile.
- `supabase/migrations/20261025095028_leaderboard_v2_scoring.sql`: version 1/2 check and
  composite `(week_start, version)` cache key. Applied to ShapersOS. Version 1 rows remain
  immutable; no source table, authentication, grants or RLS policies were changed.
- `scripts/import-website-projects.sql`: repeatable website project import.
- `tests/leaderboard.test.mjs`, `scripts/check-leaderboard.mjs`,
  `supabase/tests/leaderboard.sql`, `supabase/tests/leaderboard_v2.sql`: updated verification.
- `docs/leaderboard.md`: this contract and evidence.

Other pre-existing dirty/untracked work in the checkout was preserved. No new environment
variable is required. Continue using the existing server-only `SUPABASE_SECRET_KEY`.
The migration and version-aware app belong together: older cache writers using
`onConflict: week_start` must be updated before closed-week finalization.

## Verification — 25 October 2026

- 100 deterministic tests pass, 0 fail/skip. Includes all tiers, custom targets, invalid
  targets, reopening, duplicate evidence, 50/30/20 caps and normalization, first completions,
  coverage overlaps, both DST transitions, unavailable history, immutable finalization,
  streak hours+activity rules, stable ranks, role-shaped summaries and period aggregation.
- TypeScript, ESLint and optimized production build pass.
- Live local-production MEMBER/ADMIN browser + HTTP acceptance passes: authentication,
  shared summaries, breakdown privacy, source/cache/point-write denial, unknown-filter
  rejection, podium, seven columns, name sorting/search, tier/week/month/all filters,
  own highlight, mobile cards, badges and 390/768/1440px overflow checks.
- Isolated browser-only fixtures verify finalized history, empty/error/retry, earned-badge
  display and widget reload. Synthetic data never reaches Supabase.
- Existing dashboard regression acceptance passes: MEMBER/ADMIN login, own hours, role
  navigation, keyboard drawer behavior, editor opening, tasks, attendance and read failures.
- Rollback-only SQL suites `leaderboard.sql`, `leaderboard_v2.sql` and `organization_rls.sql`
  pass against the configured Supabase. Version coexistence, duplicate/unknown version
  rejection, immutable scores and direct cache/source denial are verified without retained
  activity fixtures. The idempotent project-import check also passes.
- Supabase security advisor reports existing intentional RLS-without-policy notices for
  private/server-only tables and the pre-existing Auth leaked-password protection warning.
  No access policy or Auth setting was broadened. See the official
  [password-security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

No hosted deployment was performed. Live SUPERADMIN browser access, real future wall-clock
week rollover and live Google/Slack operations are not established by these checks. Existing
Calendar configuration errors remain outside this change. Historical ranks before tracking
are intentionally unavailable. No functionality from the requested local implementation
is left as a mock or placeholder.
