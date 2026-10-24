# Hackathon P0 review · 24 October 2026

This branch starts from `Vitos911/Shapers-OS` commit `0f574c43a322dd452e4dc588a07250118aedb56f`. It retains native Next.js 16.4.3 / React 19.3.1 / Supabase Auth and Postgres. The separate Sites/Vinext/D1 application is not this deployment. No dual writes or identity translation between Sites and Supabase are introduced here.

## Changes ready for review

- Organization calendar sync checks Admin/Superadmin before any database lookup, Google fetch or service-key access. Matching uses exact email addresses; unresolved attendees retain the existing roster and produce a warning.
- One service-only, security-invoker RPC applies calendar references, roster changes and cancellations in a transaction. It never writes to Google and never deletes attendance. Requests without the new RPC fail closed.
- Proposed RLS permits project members to see peer tasks within an already accessible project. Other projects stay private. The directory returns only names/IDs for accessible project rosters, not private email, hours or role data.
- A current task assignee may edit status, description, priority, due date and reassign to another member of the same project. Protected title/project/archive fields remain Admin-only. The previous assignee loses edit rights after reassignment.
- Backlog / To Do / In Progress / Done, Kanban drag/drop, equivalent keyboard/touch forms, search and conditional task updates using `updated_at`. API stale writes return a conflict. Direct PostgREST callers still rely on RLS; conditional concurrency is enforced by this application API, not a mandatory database version argument.
- Historical totals remain weekly aggregates. Database overlap constraints remain; analytics also excludes conflicting daily records defensively. Partial aggregate coverage is disclosed and never prorated.
- Completion KPI and chart share the latest persisted transition to Done per task, its date and historical project/assignee attribution. A reopened task subsequently completed again belongs to its latest completion period. Unassigned completions are counted at organization/project scope.
- Weekly chart buckets cover the requested dates. Attendance rate is `(present + remote) / (present + remote + unexcused)`; excused and missing records are separate, with no-data when the denominator is empty. All-day/cancelled/future meetings are excluded. Project-filtered attendance is unavailable because meetings have no project mapping.
- Weekly goals are explicitly current-week snapshots; missing weekly evidence does not prove inactivity or a missed goal. Admin overview includes activity, open/overdue tasks, known below-goal members, missing attendance, current project progress and recent completions. Member overview includes priority tasks and future deadlines.
- The old smoke script now rejects remote databases, even if its application URL is localhost. It previously could write into a real database behind a local server.

## Proposed database change — NOT APPLIED

`database/planned/hackathon-p0.sql` is a review script, not a recorded migration. It changes the current task status constraint, maps current `in_review` to `in_progress`, adjusts two task policies, extends the existing guard and adds the minimal directory and service-only calendar RPC. Historical task history remains unchanged. It does not modify member UUIDs, weekly totals, access records, Auth accounts, Google settings or calendar data during installation.

The Supabase CLI in this restricted environment could not initialize its user configuration directory. Before release, use `supabase migration new hackathon_p0` in the deployment environment and put this reviewed transaction into the generated file. Do not invent a migration version or mark this script as already applied.

## Safest release sequence

1. Confirm this native repository is the target. Review this branch and keep the existing Sites public URL available. A GitHub push alone is not a deployment.
2. Create an isolated Supabase staging project. Recreate the current schema/migration history and use synthetic or approved copies of application data. Obtain fresh, platform-supported backup/export of Auth and database state before production work. The application-data snapshot captured at 14:16 UTC includes 55 calendar events and 430 roster links, but is not an Auth/password/session backup. Repeat it immediately before migration.
3. Compare production `pg_get_functiondef`, policies, constraints and grants with the baseline fixture. Stop on drift; do not overwrite newer guards or role mappings. Preserve all four Superadmin access entries, including the three not yet linked to Auth, until the owner explicitly resolves them.
4. Save exact current task IDs/statuses before mapping `in_review`, even if the table is currently empty. Apply the generated migration in staging, run `pnpm test:db`, then actual MEMBER/ADMIN/SUPERADMIN and anonymous HTTP tests against staging. Confirm roster privacy and persisted task/history/hour/attendance behavior after reload.
5. Use the GitHub ICS as the sandbox source; it contains 55 unique occurrences for six series. Check actual organizational Google readonly credentials separately. Do not import into Google or invent events. Do not use personal calendar tokens for the shared organization calendar. Resolve unknown participant emails before replacing any existing roster. Historical attendance remains pending until exact event references are matched.
6. Deploy the application to a protected staging Next.js Node runtime. Configure `APP_URL`, Supabase publishable key, encrypted cookie secret, approved callback URLs and server-only Google credentials there. Test real Google consent manually, mobile layout and fresh sessions for each role. No server secret belongs in browser chunks or Git.
7. Present staging evidence, fresh backup checksum/restore result, exact migration, deployment/config diff and rollback decision to the owner. Production data migrations, secrets/settings and repository visibility require explicit approval in the supplied production prompt. These approvals have not been granted by this branch.
8. After approval, freeze writes, back up again, apply the transaction, deploy the matching code, verify login → project → task → member completion → history → hours → attendance → analytics on the real URL, then reopen writes. New code requires the new directory/RPC; deploying code first would return 503.

## Rollback

Before reopening writes: restore the exact pre-migration schema/functions/policies and task statuses captured in step 4, then redeploy the previous app commit. Restore application data only if necessary from the verified fresh backup, with platform-supported Auth restoration handled separately. Recheck member UUIDs, weekly count/sum, event IDs, rosters and access aliases.

After new writes: do not blindly restore the old snapshot or drop the new objects. Preserve/export new rows first and prefer a forward fix. Backlog cannot be losslessly represented by the previous status constraint; any mapping to To Do needs review. Do not rewrite historical audit/history entries to manufacture reversibility.

## Evidence and limits

Baseline: 50 unit tests. This branch: 54 unit tests, 27 isolated Postgres/PGlite assertions, TypeScript, lint and production Next build. `pnpm audit --json` reports zero known advisories for this lockfile. These checks do not prove an exploit is impossible or establish live Google consent.

Local production HTTP: `/` and `/api/health` return 200; anonymous `/api/org/snapshot` returns 401/no-store. Existing public Sites API still returns 200 with `anonymous:true`. No signed-in production mutations, settings changes, schema migrations or deployment promotion were performed in this review.

Read-only Supabase recheck: 20 members, 120 weekly aggregates totaling 1705.5 hours, 0 projects/tasks/attendance, 55 meetings across six series, 430 meeting-member links. Calendar source matches the configured database Calendar ID. A configured ID and stored events do not by themselves prove a fresh successful Google fetch or private OAuth renewal. There are 24 access records: 17 Member, 3 Admin, 4 Superadmin; three Superadmin records lack Auth linkage and all four lack member linkage. An operator account without a member profile may administer but cannot log personal hours.

The security advisor warns that leaked-password protection is disabled. Private access-table RLS without direct policies is intentional: reviewed privileged helpers mediate access. Do not open it with a blanket policy.

## Ten-minute demo after staging is ready

0–1 min: explain staging, actual Supabase data and separately labelled sandbox calendar/hours. 1–3 min: Admin creates a project, adds two members, creates and assigns a Backlog task. 3–5 min: Member sees its project/peer task, edits priority/deadline and moves its task to Done; refresh and show persisted history as Admin. 5–6 min: log a daily entry outside historical coverage; show rejection inside a covered week and retained weekly totals. 6–8 min: readonly calendar, cancelled-event rejection, duplicate prevention and an Admin attendance correction. 8–9 min: change analytics dates/member/project filters; explain no-data and missing evidence. 9–10 min: Superadmin access/audit and show anonymous/Member denial of privileged operations. Do not present mock transport tests as a live Google demo.
