# WemryOS for Business upgrade

## Audit and implementation plan

The 26 October 2026 baseline is `0ceac6f`, synchronized from origin/main onto
`feature/wemryos-platform-upgrade`. Existing collaboration, task claiming, timer,
history, leaderboard, Google PKCE, readonly calendars and Slack are retained.
The unrelated untracked `docs/ui-polish.md` belongs to earlier work.

The live project was confirmed as `xdzofggamwoywxwdduio`. Its organization tables
have RLS, but the authorization model is a single global access list. Production
does not yet have the collaboration migrations present in this checkout. Migration
versions differ for several earlier deployed changes: reconcile by SQL content,
not by replaying all local filenames against production.

1. Add organizations, trusted memberships, settings and invitation operations.
   Reuse existing organization tables and preserve their IDs and history.
2. Put existing records into Global Shapers. Add restrictive tenant policies and
   relationship checks; audit SECURITY DEFINER and service-client paths separately.
3. Add a remounted workspace boundary and explicit request scope, then member
   project/task ownership and configurable membership groups.
4. Add private connectivity presence, workspace onboarding, and Wemry branding.
5. Verify isolated SQL/API behavior, existing regressions, mobile/keyboard flows,
   typecheck, lint and build; deliver a reviewable PR without a production migration.

## Visual reference lock

Refero returned `NO_SUBSCRIPTION`; no live Refero references were available.
The supplied Wemry logo owns brand identity: charcoal mark and blue/violet accent.
The existing reviewed Liquid Glass top navigation owns structure and density.
The local Apple Web Design and Refero craft references supply readable surfaces,
native dialogs, focus states, reduced motion and solid transparency fallbacks.

| Decision | Source | Role |
| --- | --- | --- |
| Compact top navigation, no permanent sidebar | User brief, existing application | Navigation |
| White content surfaces, restrained floating glass | Apple Web Design skill | Readability and controls |
| Supplied raster logo | User attachment | Brand only; no generated replacement |
| Blue/violet accent with dark text | User logo | Primary actions and selected workspace |
| Remount all workspace content on selection | Tenant isolation requirement | Clear old state, requests and subscriptions |

## Release boundary

No production data/schema changes, production deployment, emails, Slack messages,
or merge are authorized by this implementation. A branch push creates the existing
Vercel Preview through the Git integration. Review the migration and staging
evidence before applying any production change.

## Migration and security design

New migration: `supabase/migrations/20261026200312_wemryos_workspaces.sql` (generated with Supabase CLI).
Prerequisites include the existing project collaboration and claimable-task migrations:
`20261025195203_project_collaboration.sql` and `20261025195204_claimable_tasks.sql`.
No existing migration bytes are edited.

The migration creates `organizations`, `organization_members`, `organization_settings`,
`organization_groups` and private invitation/presence tables. Existing `members` and
`org_*` entities gain `organization_id` without rewriting IDs or immutable log payloads.
The default workspace ID is `00000000-0000-4000-8000-000000000001`.

A constant-default metadata backfill preserves old records. Restrictive RLS intersects
existing project, role, attendance and personal-hours policies. Tenant relationship
triggers reject foreign projects, members, sessions and meetings even in privileged
writes. Selected workspace IDs never grant membership. The legacy verified access
list and approved demo aliases remain authoritative for existing Global Shapers users;
newly invited users use trusted workspace membership. Revoking a legacy alias also
revokes its workspace membership.

Privileged timer reads/writes, directory helpers, Calendar upserts, temporal leaderboard
evidence and finalized caches are explicitly scoped. Workspace owners cannot gain
platform SUPERADMIN. New project ownership is independent of workspace roles.

Every active membership transition atomically updates a guarded organization counter.
The same trigger covers INSERT, reactivation, deactivation and DELETE, including service
writes. A maximum of 50 is enforced in the database. The PostgreSQL CI race accepts two
invitations into the last available seat concurrently and requires exactly one winner.
PGlite tests exercise boundary/rollback behavior; PGlite is not evidence of independent
PostgreSQL transaction concurrency.

Member-created tasks are useful collaboration records but do not generate leaderboard
points or task badges. Existing historical scores retain their original eligibility.
Custom groups use `members.weekly_hours`; 0 disables hour requirements and excludes the
hours category from scoring. Renames/target changes produce new temporal evidence,
leaving previous history and finalized scores intact.

No Supabase Storage buckets existed during the read-only audit (count 0). This upgrade
adds no upload API or bucket. Workspace logos accept optional public HTTPS URLs; private
file uploads are not offered. No public or private Realtime channels are used.

### Presence transport

Presence uses per-tab, server-verified connection leases, not public Realtime Presence
payloads. Clients refresh every 30 seconds while mounted. Online/idle is based on a
server-timed connection lease and whether an application interaction occurred within
five minutes; it does not measure work. Multiple tabs aggregate by verified identity.
Disconnected leases expire after 90 seconds. Failed reads display unknown. A privacy
change deletes every lease for that identity and all subsequent readers receive unknown.
Only an interaction timestamp is retained; no keys, pointer positions or cross-app
activity are collected. This trades instant WebSocket disconnects for a documented
90-second grace period and one necessary heartbeat write per connected tab/30 seconds.

### API and environment compatibility

Existing `/api/org/*`, `/api/ask-shaper`, auth routes and provider variables retain their
names. New routes are `/api/workspaces`, `/api/workspaces/presence` and the
`/api/org/workspace-settings` resource. **No new environment variables are required.**
`x-workspace-id` is passed on scoped API and database requests. The preference is stored
per user and in the URL; it is never used as authorization.

Google Calendar stays readonly and all six legacy series are retained. New workspaces
use their own configured Calendar ID; the Global Shapers environment fallback is never
used for another workspace. Google service credentials and the AI provider remain
server-level configuration. Existing Slack testing remains restricted to platform
SUPERADMIN in Global Shapers; independent Slack installation per new workspace and
automatic reminders remain unimplemented. No messages were sent during verification.

## Staging and production instructions

1. Review the feature PR with the second owner of shared files. Inspect the actual
   deployed schema, grants, triggers and migration history for `xdzofggamwoywxwdduio`.
2. Take a complete backup/PITR recovery point. Restore it into an explicitly approved
   development/staging project. Record counts, IDs, aggregate hours and histories.
3. Reconcile the existing deployed migration SQL with local history: several earlier
   versions have different timestamps remotely. Apply only genuinely missing reviewed
   prerequisites, then the new workspace migration. Do not replay the whole directory
   against production. All changes are transactional and an error must abort deployment.
4. Configure the existing Vercel Preview with the staging Supabase project and its own
   correct origin, OAuth callbacks and server credentials. Do not reuse production writes
   for test fixtures. The current application fails closed with a migration-pending
   message when workspace RPCs are unavailable.
5. Run local/CI checks and the manual acceptance below against the authenticated Preview.
   Confirm SQL policies, persisted rows, rereads and unchanged legacy counts/aggregates.
6. Only after explicit owner approval, coordinate the production maintenance window:
   verified backup, reviewed migration, application release through the existing Git
   integration, authenticated smoke test and monitoring. This PR does not authorize that
   cutover, a main merge, or changes to remote protections.

### Recovery

Prefer a reviewed forward fix. Do not deploy the old single-organization application
against a database containing multiple tenants: old service queries are not tenant-aware.
Before cutover, restore the full backup to undo the rehearsal. After accepting new
production writes, a full restore would lose those writes; export/reconcile them first
and obtain explicit approval. Dropping tenant columns/tables is not a safe rollback.
No destructive rollback SQL is provided or executed.

## Manual acceptance

- Sign in, restore a session, sign out, and confirm private content is removed. Repeat
  Google and email/demo auth with actual authorized accounts in staging.
- Create two workspaces; verify OWNER in the database and 1/50 members. Switch repeatedly
  while requests/AI dialogs are open. Reload direct `?workspace=...#tasks` links and
  verify previous-workspace projects, tasks, history and AI answers never remain visible.
- Invite the intended email, accept as that email, reject another email, leave, and
  confirm records remain. Verify MEMBER cannot change roles; OWNER can assign ADMIN
  and transfer ownership; the current owner cannot leave or be removed.
- As MEMBER, create/edit a project, create/assign/complete a task and reload. Exercise
  open joins, approval requests and creator approval. Try foreign-workspace IDs in
  every relevant endpoint and directly through the Data API; require rejection.
- Run the PostgreSQL last-seat race and verify both the counter and membership count
  remain 50. Check reactivation and failed invitation rollback.
- Open two accounts and two tabs in one workspace. Verify online, five-minute idle,
  tab disconnect aggregation, 90-second expiry, hidden presence and unknown on failure.
  A different workspace must never return that roster.
- Change/rename membership groups and assign a zero-hour target. Confirm historical
  aggregates, task/audit history and finalized leaderboards are unchanged.
- Verify the persisted timer, attendance, all six Google series, personal readonly
  Calendar, administrator analytics and existing platform Slack/Ask Wemry configuration.
- Check 390/768/1440px, keyboard navigation, dialog focus/Escape, reduced motion,
  transparency fallback, contrast and document overflow.

## Verification status

Local evidence is recorded in `test-results/wemry/` (ignored, synthetic data only).
The first Windows build attempt was interrupted by an EBUSY lock on its log inside
`.next`; moving the log outside the build directory allowed the retry to complete.
The Playwright browser package was absent; browser verification uses installed Chrome.
Hosted staging/production OAuth, SMTP, Calendar, Slack and AI acceptance are separate
from local checks. No hosted database migration, production write, message, deployment
or merge was performed. The source upgrade is not a claim that the production service
already has multi-workspace behavior. Production migration-history reconciliation,
second-developer review and authenticated staging acceptance remain release gates.

### Local acceptance evidence, 27 October 2026

- Automated suite: 177 tests passed, including new tenant lifecycle, ownership,
  membership capacity, privacy and pre-existing-data migration scenarios.
- Isolated SQL regression: 27 checks passed. Fresh and upgraded migration order,
  immutable task/audit history, historical imports, task permissions and leaderboard
  schema parity passed. No hosted database is used by these tests.
- Typecheck, ESLint and production Next build passed.
- All three browser suites passed using installed Chrome. The existing MEMBER / ADMIN /
  SUPERADMIN suite covers 375/768/1024/1440/1920px, keyboard/focus, contrast, AI failure,
  task save/reload and administrator hours. Timer acceptance covers concurrent starts,
  restored sessions, offline/reconnect, pause/resume, lost STOP response, corrections,
  immutable audit and persisted project membership/task claiming.
- Wemry acceptance exercises real Next HTTP routes and isolated SQL for creating and
  switching workspaces, creator ownership, task/project save and reload, MEMBER project
  creation, cross-tenant rejection, logout and 390/768/1440px overflow checks. Auth and
  public config transport are synthetic; this is not hosted Supabase/OAuth acceptance.
- The extended two-client acceptance passed 279 SQL-backed HTTP requests, including
  live presence from two browser contexts, suppression of hidden presence for another
  client, and removal of private content on logout. The privacy control updates
  immediately, rolls back on failure, and ignores older in-flight presence responses.
- The independent PostgreSQL-session capacity race is included in the existing CI SQL
  job. Its GitHub result must be checked for the final PR head; local PGlite tests do not
  replace that concurrency result.
  The initial upgrade commit `8624286` passed that job, including ten independent
  task-claim races, a claim/leave race and simultaneous last-seat invitation acceptance.

Design review used local screenshots of synthetic records, not production member data.
The initial browser pass exposed a workspace deep-link reset and header overflow; both
were repaired and the browser suites repeated successfully.

Supabase implementation references: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), and
[explicit Data API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
