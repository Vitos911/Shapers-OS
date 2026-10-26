# Project discovery, membership and task claiming

## Data and access model

`org_projects` gains `visibility` (`private` by default, or `organization`), `join_policy` (`closed` by default, `approval`, `open`) and a goal. Existing projects remain private and closed without a data rewrite. An administrator must explicitly make a project discoverable. Discoverability exposes the description, goal, member names and aggregate task progress; it does not grant access to private task details, other members' email addresses, hours or attendance.

Reuse `org_project_members`. Membership is distinct from task ownership. Legacy authorized access through assignment remains intact. Member-name and aggregate-progress RPCs expose only projects the caller may discover; private implementation functions use a fixed empty search path and verified database identity. Public wrappers are security invoker, with EXECUTE revoked from PUBLIC/anon. New tables have RLS, explicit SELECT grants and no authenticated direct mutation privileges.

`org_project_join_requests` keeps one current request per project/member. Rejected or cancelled requests can be resubmitted; every transition is appended to `org_project_membership_history`. Existing memberships are not assigned invented historical events. History is private to the affected member and administrators, subject to project visibility, and cannot be edited through the application or service-role table grants.

## Operations

- `POST /api/org/membership`: `project_id`, `action` (`join`, `leave`, `approve`, `reject`), optional admin-only `member_id`.
- Existing `POST /api/org/project-members` retains its request shape; administrators add/remove members through the same locked database operation after migration.
- `POST /api/org/claim-task`: `task_id` only. Caller identity comes from the verified session, never the submitted body.
- Existing project/task CRUD accepts the new validated fields; only administrators configure availability or project settings.

Joining locks the project row, rechecks visibility and project state, then inserts idempotently using the existing composite key. Approval-based joining creates a pending request without granting membership. Approvals, rejection, cancellation and removal use the same lock. Both self-leave and administrator removal reject outstanding nonarchived tasks whose status is not done. A completed task remains authorized through its existing assignment; leaving membership does not erase work, attendance, task history or hours.

Task claiming requires a linked profile, explicit project membership, active/planning project, `claimable=true`, unassigned task, `todo` status and nonarchived state. The project lock serializes claims with membership changes. A conditional UPDATE produces exactly one winner; the existing task-history trigger records the assignment. Invalid competing claims return 409, forbidden access 403. Admin assignment, status changes and archiving clear availability when the task no longer qualifies.

## Migrations and rollout

1. `20261025195203_project_collaboration.sql`
2. `20261025195204_claimable_tasks.sql`

Generated with Supabase CLI `migration new`. Neither migration was applied to the hosted database in this task. Deploy migrations in order before publishing the complete collaboration feature. A fully unmigrated database retains ordinary snapshot reads with `collaboration.ready=false`; the project screen explains that the new feature is pending. The legacy administrator membership API remains available when the RPC is absent. Partial migrations or unexpected errors fail visibly.

Live read-only inspection found task-guard permissions beyond the local migration baseline. Claim migration preserves the installed guard definition and inserts only the exact unassigned-to-self claim case. It also adds a SELECT policy rather than narrowing existing task visibility. It recognizes the known old/new guard families and fails closed on an unknown body. Review the migration against the target project's current schema before applying it. The existing trusted service-only historical attendance INSERT path remains in place.

Private projects can be open for authorized invitees while remaining undiscoverable by outsiders. Organization-visible closed projects can be viewed but require an administrator to add members. These are independent controls.

## Verification

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` exercise the existing application plus API authorization tests. `scripts/check-project-collaboration.mjs` requires a disposable empty PostgreSQL database named `shapers_evolution_test` (optional suffix) on loopback and an installed `pg` module via `PG_MODULE`. It bootstraps a minimal isolated auth schema, applies relevant real migrations, executes `supabase/tests/project_collaboration.sql`, runs ten two-session claim races and races claim against leave. It rejects remote hosts and populated databases. It never imports production users or data.

Example environment: `COLLABORATION_DATABASE_URL=postgres://postgres@127.0.0.1:55439/shapers_evolution_test`. CI adds a PostgreSQL 17 service job; its execution on GitHub is separate from local validation.

`scripts/check-collaboration-ui.mjs` uses `PLAYWRIGHT_MODULE`, optional `BROWSER_EXECUTABLE`, and `CHECK_APP_ORIGIN` (default localhost:3220). It uses synthetic sessions and intercepted APIs, exercises all three roles and 320/390/768/1440px layouts, and saves screenshots under ignored `test-results/collaboration`. These are UI transport tests. The existing check-work-timer-browser.mjs adapter also exercises join/claim/leave through the real Next API and a disposable PostgreSQL/RLS engine, verifying persistence across reload. Neither is hosted login or production database mutation evidence.

Google Calendar authentication, token handling, personal/shared event synchronization, existing leaderboard and Ljubljana/DST streak tests are retained. The current main Slack and Ask Shaper integrations are retained, including DeepSeek support. Their existing isolated tests run as regressions; no live Slack message or paid AI request is sent. Live external provider behavior is not certified by local tests.
