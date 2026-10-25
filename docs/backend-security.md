# Backend security and metric definitions

Review branch update: [hackathon-rollout.md](hackathon-rollout.md) supersedes the task-edit and analytics rules below after the proposed migration. The existing production schema has not been changed by this branch. The earlier text is the baseline record.

## Trust boundaries

Every organization API request validates the bearer token through Supabase Auth `getUser()`, requires a verified, nonanonymous email, and resolves access from `org_private.access` against the actual `auth.users` record. Headers such as `x-user-id`, JWT email claims and editable `user_metadata.role` cannot grant a role. PostgreSQL policies repeat the checks; hiding a button is not authorization. Disabled trusted access invalidates organization access even while an old JWT has not expired.

Private access is in an unexposed schema, RLS enabled with no policy (intentional deny-all), no direct authenticated table grant. Narrow trusted helper functions use `SECURITY DEFINER`, empty search paths and fully qualified names. Exposed `current_member_id()`, `current_is_admin()` and context wrappers are SECURITY INVOKER. Anonymous grants are revoked. Service-role credentials inherently bypass RLS: protect that server environment and never give it to a client.

MEMBER sees only own profile, task assignments, hours, history and attendance, plus authorized project/meeting context. ADMIN manages organization projects, tasks, memberships and attendance but cannot read role-management data or grant roles. SUPERADMIN manages trusted access/settings, with a last-superadmin demotion/disable guard. Bootstrap is service-only and audited, never first-signup promotion. User-selected verified operator accounts have no invented member profile; own work logging requires a genuine member link. The original workspace owner was not silently made an organization admin.

Input fields are allowlisted, UUID/date/enums validated, body size capped at 20,000 bytes while reading. Work entries use quarter hours, no future dates, max 24 daily hours, immutable ownership, and soft deletion. Imported weekly aggregates prohibit overlapping daily entries. Task timestamps and history are generated in Postgres; current assignees may change status/description/priority/due date and reassign within the same project; title/project/archive remain administrator-only. Attendance has unique member/meeting keys, backend check-in windows and explicit admin override. Audit rows cover projects, tasks, work, attendance, settings and access changes; they are not a tamper-proof external SIEM.

All organization responses are no-store. Session tokens remain sensitive; existing browser Auth persistence is used, so avoid XSS and keep third-party scripts out. Email confirmation does not add an address to the trusted allowlist. Invites target already-approved real addresses only; fictitious addresses use the separate local opt-in provisioning process. Demo passwords are random and private, not shared public constants.

## Analytics

- Active member: has positive logged hours, a persisted task-completion transition, or present/remote attendance in the chosen interval.
- Completed tasks: distinct task IDs whose latest persisted transition to done lies in the interval. Repeated completion does not inflate the count; the latest completion period and its recorded assignee/project determine attribution. Earlier events remain visible in immutable history.
- Open/overdue tasks: current nonarchived, nondone tasks; overdue means due date before today's Ljubljana date. These are current-state counts, not a historical backlog reconstruction.
- Hours in interval: nondeleted daily work plus weekly source aggregates only when the interval contains their entire known coverage. Partial-week aggregates are omitted, not prorated. Project-filtered totals omit unallocated weekly aggregates. Imported zero totals are retained.
- Weekly progress: current Monday-start Ljubljana week, all projects, divided by member commitment (Core 70, Impact 10, GO! 4 h). The target is not prorated midweek. Member/tier filter applies; project/date filters do not redefine the current weekly commitment.
- Attendance: (present + remote) / (present + remote + unexcused). Missing attendance is unknown and disclosed separately; excused, all-day, cancelled and unfinished meetings are excluded from the rate. Zero denominator displays “—”, not a fabricated percentage. Project filter does not affect attendance because meetings have no project relationship.
- Cohorts: sums/counts of members in GO!, Impact and Core after member/tier/date filters. Chart buckets cover the selected date interval.

## Known security/operations items

Supabase still reports disabled leaked-password protection. Enable it in Auth settings before production, subject to your plan: [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This was not silently changed on the shared project. The private access table's “RLS enabled, no policy” informational notice is intentional deny-all, not an exposed-table exception.

Reference for the intentional private-table notice: [RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

ESLint is pinned to 9.39.5 to satisfy the installed Next config/plugins' peer ranges. Its registry support/deprecation warning is a dev-tooling lifecycle limitation; upgrading to ESLint 10 currently violates those plugin peer ranges. Do not treat the successful lint/build as proof of a complete independent penetration test or zero dependency vulnerabilities.

Missing foreign-key indexes and overlapping SELECT/write policies reported by the performance advisor were addressed in the policy/index migration; the remaining performance notices are unused-index INFOs on this small/new dataset. Indexes were retained for future workloads rather than removed from an unrepresentative usage sample. [Supabase index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
