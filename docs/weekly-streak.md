# Weekly Streak

The member overview displays `WeeklyStreakCard` immediately below the welcome card.
`lib/weekly-streak.ts` computes it from the existing authenticated, paginated Supabase
snapshot (`members`, `org_work_entries`, `org_weekly_hours`). It adds no storage,
mutation endpoints, database objects, authentication changes, RLS changes or Calendar calls.
The existing dashboard clock updates the calculation every minute, including week rollover;
successful work saves and refreshes reread the authoritative snapshot.

## Counting rules

- The verified `identity.member_id` selects the member. Unlinked accounts have no personal card.
- Current tier targets are GO! **4h**, Impact **10h**, Core **70h**. There is no tier-history
  table, so the card explicitly describes all calculations as using the current tier.
- Weeks are Monday–Sunday in Europe/Ljubljana. Work dates are already calendar dates;
  instants use `ljubljanaDate`, then existing `weekStart` / `addDays` utilities.
- An imported aggregate is authoritative from `week_start` through `through_date`, inclusive.
  Individual entries within that coverage are excluded. Later entries in the same week count.
  This also protects the read path if overlapping data predates the database overlap triggers.
- Deleted entries, other members' records, future work dates and aggregates with future
  coverage end dates are excluded. Weekly imports are unique per member/week in the schema.
- A week succeeds once its hours reach the target. A successful current week counts
  immediately. Otherwise the current streak ends at the previous week; the open week does
  not break it. At local Monday, a missed closed week breaks the run.
- Missing closed weeks count as zero recorded hours and break consecutive runs. There is no
  invented membership start date or inferred success before the first available record.
- Personal best and earned 2/4/8/12-week milestones use all available records, not only the
  six displayed weeks. Best is hidden without usable records, and is labeled **in the records**,
  rather than an unverified lifetime claim. Milestones remain earned after a later missed week.
- **Approved pauses are not represented in the existing schema or snapshot.** No pause is
  inferred from absence, meeting excusal, an account's disabled access or missing hours.
  Supporting pause exemptions requires an authoritative approved-pause model first.

## Visual reference

Direct build against the existing member dashboard and its documented supplied prototype:
preserve white glass surfaces, 26px card radii, Inter, dark blue text, and blue progress.
Refero live research returned `NO_SUBSCRIPTION`; bundled craft guidance informed accessible
labels and responsive layout. No external design style is claimed as reviewed.

| Decision | Reference / role | Purpose |
| --- | --- | --- |
| Full-width card below welcome | User's prominent overview requirement; existing card system | Streak visible before tasks and meetings |
| Large blue count, six dated icons | Existing hero metric typography and semantic status icons | Scan current run and distinguish complete, incomplete and pending without color alone |
| Native progress and four milestone badges | Existing progress / badge treatments | Reuse dashboard language and accessible progress semantics |
| Stacked content below 700px | Existing mobile spacing and craft guidance | Keep six weeks readable without horizontal scroll |

## Verification

`pnpm test` includes tier thresholds, quarter-hour deficits, unfinished weeks, missing weeks,
both Ljubljana DST transitions at Monday boundaries, Sunday work, year rollover, full and
partial import overlap, future/deleted/foreign records, all milestones, unavailable profiles
and input immutability. Run `pnpm typecheck`, `pnpm lint`, `pnpm build` as well.

`scripts/check-member-dashboard.mjs` adds real MEMBER/ADMIN read checks for the card and
isolated browser fixtures for hours reread/reload, a preserved 12-week run, all milestone
badges, a completed 13th week, and 390/768/1440px screenshots. The live phase blocks all
organization writes; browser-only fixtures never reach Supabase. See `member-dashboard.md`
for runtime configuration. This does not establish hosted deployment or live write behavior.

Verified locally on 24 October 2026 on `codex/weekly-streak`:

- **PASS:** 70 unit tests (11 new streak tests), TypeScript, ESLint, production build and diff whitespace checks.
- **PASS:** production browser acceptance using real MEMBER/ADMIN Auth and Supabase reads;
  existing navigation, dialogs, tasks and meeting displays still work.
- **PASS:** browser-isolated hour submission/reread/reload, 12-week pending streak,
  all four milestone badges, completed 13th week and responsive screenshots at 390/768/1440px.
  Screenshots were visually inspected against the existing dashboard; no horizontal overflow.
- No live work entries or other organization records were created or changed by verification.
- Existing shared-calendar configuration and personal-calendar local `APP_URL` errors remain
  outside this change. Live Calendar operation, hosted deployment and live write persistence
  were not verified. No deployment or schema migration was performed.
