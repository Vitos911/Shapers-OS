# Activity history and audit

Implementation branch: `codex/history-audit-20261025`. This builds on the isolated visual-polish branch/PR #6. The shared checkout's uncommitted dashboard, profile, weekly-streak and leaderboard work is preserved and excluded. No production deployment, database migration application, merge or live organization data mutation is performed by this change.

## Existing functionality verified first

- `org_task_history` already records each task INSERT/UPDATE through `org_private.audit_change()`, in the same transaction as the task write. It stores `actor_id`, `occurred_at`, `old_status`, `new_status` and complete `changes.before` / `changes.after` JSON. This already captures creation, status, priority, deadline, assignment, completion and reopening. The existing `org_audit` records general organization changes, and `/api/org/audit` is SUPERADMIN-only.
- The existing authenticated `/api/org/snapshot` already loads task history under RLS. No new activity table, duplicate writer, privileged read API or history mutation endpoint is needed.
- Hours already use `org_work_entries` and `org_weekly_hours`. Existing RLS allows MEMBER to read their own rows and ADMIN/SUPERADMIN to read authorized member rows. Existing database overlap guards prevent daily entries inside imported coverage. Daily rows and imported aggregates already have separate UI tables.
- Attendance already stores `present`, `remote`, `excused`, `unexcused`, with member/series filters and existing correction controls. There was no date-range/past-only filter.
- Read-only inspection of connected ShapersOS project `xdzofggamwoywxwdduio` confirmed the task trigger, enabled RLS and three existing history rows. Ordinary authenticated users already lacked history write privileges; the service role still had broad table privileges.

## Additions

Task table → **Podrobnosti in zgodovina** opens native, keyboard-accessible task details with an Activity Timeline. Each event shows actor, Ljubljana timestamp, event type and old/new values. Creation, completion and reopening have distinct labels. Existing history is reused without backfill or invented events. Older records retain their actor UUID if no historical name was saved.

Hours → **Tedenska zgodovina ur in cilji** expands a weekly table using the existing member/date/project filters. It shows whole Monday–Sunday Ljubljana weeks intersecting the selected interval, daily/imported sources and comparison with the member's **current** weekly target. Imported coverage replaces covered daily rows defensively; uncovered later daily entries still count. Future weeks are excluded. Unknown targets and missing records are explicit. A range over 104 weeks asks for a narrower interval rather than silently truncating. Project-only hours exclude unallocated aggregates and do not imply comparison with a whole-member target.

There is no stored history of target changes or completeness/pauses. The UI does not invent historical targets, absence of work or definitive success/failure for incomplete records. Empty weeks say **Ni vnosov**; the current week is labeled in progress.

Attendance retains its existing table, role controls and correction handlers. Additional optional date bounds and **Pretekli sestanki** filter use meeting-local start dates and actual end timestamps. Default empty dates / all records preserve the existing record set. Date bounds are inclusive; invalid ranges have an inline error. Missing meeting metadata remains visible without filters, but cannot satisfy date/series/past filters. Missing attendance is never fabricated as `unexcused`.

The existing white/blue UI, native details/forms, typography, cards and table containment are the reference lock. No separate redesign, generated artwork or new runtime UI library is introduced. Task details and weekly history have their own small CSS module.

## Migration and permissions

`20261025085526_history_audit_hardening.sql` was generated with Supabase CLI 2.122.0 and is **prepared, not applied to the connected production database**.

- Add nullable `actor_name` to the existing history table. A private trigger stamps the author's member name when a new log row is inserted and rejects an actor ID that differs from `auth.uid()`. Attribution remains in the original transactional audit writer. Historical rows are untouched.
- Preserve the original member-history rule for past assignments, which feeds existing completion analytics. Extend SELECT to the current task assignee so reassigned tasks have earlier history. ADMIN/SUPERADMIN retain their existing history access; unrelated members remain excluded. The global audit remains SUPERADMIN-only for authenticated users.
- Revoke direct INSERT/UPDATE/DELETE/TRUNCATE privileges on task/general audit logs from application roles, including service role. Grant only SELECT. Existing private SECURITY DEFINER writers still append as their owner; no function or role elevation is exposed.
- Reject UPDATE/DELETE and TRUNCATE with guards on both logs. Routine application/service operations cannot rewrite history. A database administrator can still explicitly alter/disable schema guards; this is not claimed as tamper-proof against the database owner.

Apply only this reviewed migration through the normal release process after reconciling the repository's separate, already-applied migrations from other branches. Do not blindly replay or push unrelated migrations. Existing clients tolerate the extra nullable field; the UI also reads old records before migration. Production name stamping and strengthened permissions require this migration to be applied.

Current official guidance reviewed: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Postgres row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) and the Supabase changelog. Authorization uses the existing trusted organization context, not user-editable JWT metadata.

## Verification

- `pnpm test`: **65/65 PASS**, including 14 activity-history cases and an actual PostgreSQL-engine migration/RLS test. `@electric-sql/pglite@0.5.11` is a pinned development-only dependency, not a browser/runtime dependency.
- `node scripts/check-history-db.mjs`: applies the original organization/hours schema and the new migration to a fresh local PostgreSQL engine. SQL assertions cover exact old/new changes and actors, completion/reopening, no duplicate events, actor-name retention, reassignment visibility, preserved historical analytics access, hours/attendance role boundaries, spoofed metadata, denied writes and truncation. A deliberately failed log insert proves the task write and audit append roll back atomically. All fixtures are rolled back.
- Supabase Auth's UID lookup is reproduced in the local engine; this is not a hosted Supabase Auth/PostgREST test. No Docker/local Supabase stack or live elevated account was used.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: PASS.
- `scripts/check-history-browser.mjs`: development and local production build PASS; real existing MEMBER/ADMIN sign-in and read-only Supabase snapshots; task timeline, weekly hours and attendance filters at 390/768/1440px. Browser-only fixtures verify all event kinds, old/new values, author, deduplicated 7.5h, four attendance statuses, date/series filters, invalid intervals and SUPERADMIN member selection. Zero live organization writes.
- Existing `scripts/check-visual-polish.mjs` regression: login/reload, main views, keyboard navigation/table scrolling, hours dialog, isolated hours submission/task status changes and error states PASS. Source comparison confirms all 53 existing callback/handler attributes are preserved; three date/period filter handlers are added. The analytics implementation is identical, with a separate test confirming reassignment history cannot inflate completion counts.
- Browser screenshots and JSON results remain ignored in `test-results/history/`. Set `PLAYWRIGHT_MODULE`, optionally `BROWSER_EXECUTABLE`, and a local `CHECK_APP_ORIGIN` to rerun; existing `.private/demo-credentials.json` is required and must not be committed.

The previously observed local personal-calendar `APP_URL` setup error is unchanged and outside this work. A hosted SUPERADMIN session, production migration execution and Google OAuth flow are not claimed as verified. Baseline security advisors also reported existing password-protection configuration and intentionally policy-free private tables; these settings were not changed ([password configuration](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).
