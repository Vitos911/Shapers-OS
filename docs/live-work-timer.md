# Live work timer and audited corrections

`feature/live-work-timer` replaces member-entered daily hours with server-authoritative
START / PAUSE / RESUME / STOP. The timer is visible on the overview and hours views.
The existing authentication, `org_private.access`, members, daily ledger, weekly imports,
analytics and leaderboard remain the sources of truth. No historical rows are rewritten.

## Storage and permission boundary

- `org_work_sessions` stores the server start/stop instants, verified user/member, state,
  version and final `duration_seconds`. `org_work_segments` stores running intervals.
- A partial unique index allows one running **or paused** session per user. Commands use
  a database transaction, user/import advisory locks and version checks. START uses a
  client-generated UUID only for retry identity; it accepts no client timestamp or duration.
- STOP closes the running segment, excludes pauses, persists exact duration and inserts
  daily `org_work_entries` in the same transaction. A failed insert rolls the whole STOP
  back. Repeating START with the same ID or repeating STOP cannot duplicate work.
- Intervals split at **Europe/Ljubljana midnight**, including 23/25-hour DST days and
  Monday boundaries. Seconds become numeric hours without quarter-hour rounding.
- Authenticated and service roles have no direct INSERT/UPDATE/DELETE/TRUNCATE access to
  the daily ledger or session tables. Members can invoke the checked timer RPC only for
  their own linked profile. SELECT RLS limits members to their own records.
- Only database-verified ADMIN/SUPERADMIN can invoke `org_admin_work`. A nonblank reason
  is mandatory. Edits require the existing row's exact `updated_at` and cannot change its
  member or session identity. Removal is an audited soft delete through the same form.
- The existing `org_audit` writer captures actor, server timestamp, complete before/after
  values and `adjustment_reason` transactionally. Its existing append-only guards remain.
  ADMIN can read only work audit rows; broader audit access stays SUPERADMIN-only.

## Display and totals

The browser reads `org_work_state()` after login/mount, every 15 seconds, on focus and
reconnection, and after commands. Only the display advances each second, using monotonic
elapsed browser time anchored to the server's elapsed value. No duration is posted.
Timeouts or lost connectivity disable commands until a successful state read. Offline
commands are never queued. A lost write response triggers a fresh read, including when
STOP committed before the response was lost. Browser receipt latency can slightly lag
SQL time; the database remains authoritative.

`org_work_state()` reads permanent entries and active interval projections in **one SQL
snapshot**, so a concurrent STOP cannot count both forms. Provisional rows are labelled
and cannot be edited. The existing dashboard, weekly history and analytics consume this
same work list. The leaderboard's existing temporal source adds interval projections
only for sessions without a persisted ledger representation at its cutoff. Stopping or
correcting work therefore does not double-count; past cutoffs can reconstruct intervals.
Previously finalized leaderboard weeks remain immutable under the existing policy.

Goals come from `members.weekly_hours`, including the dashboard/streak; tier defaults
cannot overwrite a stored member goal. Historical `hours.csv` totals remain in
`org_weekly_hours`. Covered dates cannot receive daily entries. Timer start/resume and
weekly imports also prevent overlap with an active interval under the existing import
lock. Imported totals are never split into invented daily records or edited by this UI.

## Verification on 25 October 2026

- Unit/SQL: `tests/work-timer.test.mjs` runs the full migration chain on disposable
  PGlite PostgreSQL with synthetic verified MEMBER/ADMIN/SUPERADMIN identities.
  It exercises start/stop, fresh reads, pause/resume, stale commands, concurrent starts,
  the independent unique index, forbidden direct writes/RPCs, audited corrections,
  history preservation, DST, week splitting, import overlap and leaderboard replacement.
- `scripts/check-release-db.mjs` applies the chain both fresh and in the previously
  documented production/pending order and runs existing task/history/leaderboard suites.
- `scripts/check-work-timer-browser.mjs` runs Chromium against the production Next build
  and **actual Next HTTP handlers and SQL RLS/RPCs**. Only Supabase Auth/PostgREST transport
  is replaced by a local adapter. It tests two tabs, reload and a new authenticated
  browser context, offline/reconnect, pause/resume, loss of the STOP response after SQL
  commit, MEMBER API/direct-table rejections, ADMIN creation, SUPERADMIN correction and
  audit, exact weekly analytics and 390/768/1440-pixel layouts.
- The existing release browser suite still exercises all views and three roles. No
  hosted writes, users, invitations or external messages are part of these tests.
- Hosted REST OpenAPI was read successfully using the supplied server credential. The
  target is `xdzofggamwoywxwdduio`; the existing daily ledger matches the reviewed contract.
  No SQL-execution RPC is exposed and timer objects are not yet present there.
  A separate read-only comparison confirmed all **20 source members**, **120 imported
  weekly rows** and **1,705.5 hours** match the committed source seeds. No hosted writes.
- Final local results: **170/170 tests**, **27/27 base database assertions**, typecheck,
  lint and production build pass. Both browser suites pass: the existing 31 role/view
  combinations and the timer's actual Next/SQL scenarios at all three viewport widths.

**NOT VERIFIED:** hosted SQL catalog/RLS/migration history, application of the new
migration, real hosted Auth sessions, simultaneous separate PostgreSQL connections,
Vercel Preview and Production smoke. PGlite serializes engine commands even though the
browser sends concurrent requests. Local synthetic Auth is not a hosted login test.

## Rollout through the existing Supabase / Vercel setup

1. Inspect the live SQL catalog (constraints, grants, triggers, policies and applied
   migration versions) for `xdzofggamwoywxwdduio`. REST OpenAPI alone cannot establish RLS.
   Reconcile any outstanding migrations under the existing release process; never replay
   applied files or silently bundle unrelated task/auth changes into this release.
2. Review and apply `supabase/migrations/20261025120000_live_work_timer.sql` as a single
   transaction using the existing migration workflow or SQL Editor. Verify dependencies
   on `org_private.identity/admin`, the audit hardening and leaderboard temporal source.
   A server API secret is **not a PostgreSQL connection or management credential** and
   cannot execute this DDL through the currently exposed API. Record the migration in
   the normal migration history and refresh the PostgREST schema cache.
3. Verify existing member/import counts and totals, role grants and the RPCs on the
   approved test deployment. Confirm old member direct writes are denied. Run the seven
   requested scenarios with designated hosted test identities; do not impersonate users.
4. Obtain the repository-required second-developer review. The user explicitly requested
   publication, so no additional owner approval is being requested. Merge the reviewed
   PR only after the database is ready: the existing `main` → Vercel Git integration
   publishes Production. Publishing code before the RPC exists would fail snapshots.
5. Verify the resulting Vercel commit/status and authenticated save/reload on its actual
   URL. Keep the migration on rollback; use a forward fix. Reverting to the old app while
   retaining closed member-write grants safely rejects manual writes. Never reopen member
   backdating or delete timer/audit/history data as a rollback shortcut.
