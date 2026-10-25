# Historical attendance import — 2026-10-25

All 258 source records from `supabase/seed/attendance-pending-calendar.json` are stored in project `xdzofggamwoywxwdduio`, using the existing importer and `public.org_attendance`. Source dates cover 14 September–22 October 2026, interpreted in Europe/Ljubljana. No source identifiers or statuses were changed.

## ATTENDANCE IMPORT

| Check | Result |
| --- | --- |
| Dry-run | PASS: `dryRun: true`, `planned: 258`, `conflicts: []` |
| Actual import | PASS after the required trigger repair |
| Source records stored | 258, each with its expected import key, member, meeting, status and note |
| Total attendance rows | 259 at verification |
| Duplicate meeting/member pairs | 0 |
| Rerun | PASS: second `--apply` completed; total remained 259 |

The initial snapshot contained zero attendance rows. During this task an independent ADMIN inserted one non-imported `present` record for a 5 November Shapers Voice meeting, at 09:06:38 Europe/Ljubljana (08:06:38 UTC). Its audit actor is the ADMIN account and its `import_key` is null. It is outside the historical source and was preserved. The final total is therefore 258 imported + 1 preserved independent record.

Imported status counts: `present` 198, `remote` 22, `excused` 26, `unexcused` 12. Full-table counts differ only by that extra `present` record (199).

## INTEGRITY

| Check | Result |
| --- | --- |
| Member mapping | PASS: all 258 mapped by normalized email to the existing 20 UUIDs |
| Meeting mapping | PASS: 33 unique existing meetings, each matched by series and Ljubljana date |
| Synced references | PASS: all 55 meetings have Google event IDs and `synced_at` |
| Dates/timezone | PASS: every mapped date and meeting timezone checked |
| Foreign keys | PASS: zero missing members or meetings |
| Statuses | PASS: source `state` equals stored `status` for every source record |
| Idempotency | PASS: unique pairs, safe apply rerun, and rollback test preserving an ADMIN correction |

| Series | Imported rows | Imported meetings |
| --- | ---: | ---: |
| Community | 60 | 3 |
| Summer School | 36 | 6 |
| Grants | 36 | 6 |
| Shapers Tech | 54 | 6 |
| Shape Talks | 30 | 6 |
| Shapers Voice | 42 | 6 |

Private pre-import snapshots were compared with live rows. The 20 members, 55 meetings, 430 meeting-member links, 120 historical weekly totals (1,705.5 hours), settings, original tasks/history and both legacy workspaces were unchanged. Other concurrent activity added work entries, a project and project membership; the importer only writes attendance and those independent records were preserved. Snapshot data remains in ignored `.private/`, outside this commit.

## APPLICATION

| Check | Result and scope |
| --- | --- |
| MEMBER | PASS: real existing Auth account, API privacy, all 15 source records, status labels, resolved meetings/dates, no correction buttons, persistence after reload |
| ADMIN | PASS: real existing Auth account, all 258 source records, all six series filters, correction dialog; correction permission separately exercised in rollback SQL |
| SUPERADMIN | PASS in SQL/RLS using an existing confirmed identity; browser NOT TESTED because operator credentials were not available |
| Attendance analytics | PASS: six series checked independently against source status totals; aggregate UI shows 94.83% for 14 September–23 October (220 present/remote divided by 258 minus 26 excused) |
| Anonymous access | PASS: snapshot returns 401; direct table read denied |
| Legacy | PASS: local `/legacy` responds successfully; saved workspace rows unchanged |

MEMBER sees 16 total attendance rows (15 source + the independent ADMIN entry); ADMIN sees 259. Browser acceptance blocks every organization mutation. No attendance correction is committed by tests. `supabase/tests/attendance_import.sql` checks service INSERT, MEMBER historical-edit rejection even with spoofed metadata, ADMIN correction, correction preservation on rerun, unchanged service UPDATE restrictions, SUPERADMIN visibility and anonymous denial. All changes in that test roll back. Existing `supabase/tests/organization_rls.sql` also passed in a rollback transaction.

## REGRESSION

| Command | Result |
| --- | --- |
| `pnpm test` | PASS: 92 passed, 0 failed, 0 skipped |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm build` | PASS: Next.js 16.4.3 production build, including `/legacy` |
| New attendance SQL acceptance | PASS before import and after import |
| Existing organization RLS integration | PASS |
| Local production browser/API acceptance | PASS for MEMBER and ADMIN |

## CHANGES

The first apply stopped with `42501` before inserting any source rows. The existing SECURITY INVOKER attendance guard tried to invoke identity/eligibility helpers that are intentionally unavailable to `service_role`, and treated the service importer as a self-check-in. A single necessary migration, `20261025080709_historical_attendance_service_import.sql`, skips that self-check-in branch only for INSERT by the actual database service role. It does not trust JWT user metadata. It preserves all UPDATE guards, immutable identity, constraints, audit/history triggers and RLS policies. The function remains SECURITY INVOKER and its existing ACL is preserved.

Added `supabase/tests/attendance_import.sql` and the read-only `scripts/check-attendance-import.mjs`; updated README and relevant documentation. The existing importer, source JSON, authentication, application roles and UI were not edited. Existing uncommitted dashboard/leaderboard work is excluded from this task's commit. Development branch: `codex/historical-attendance-import`.

Files in the attendance commit:

- `README.md`
- `docs/attendance-import.md`
- `docs/google-calendar.md`
- `docs/infrastructure.md`
- `docs/verification.md`
- `scripts/check-attendance-import.mjs`
- `supabase/migrations/20261025080709_historical_attendance_service_import.sql`
- `supabase/tests/attendance_import.sql`

Reproduce after starting the local production app:

```powershell
$env:CHECK_APP_ORIGIN='http://127.0.0.1:3102'
# Set PLAYWRIGHT_MODULE / BROWSER_EXECUTABLE if using a bundled browser runtime.
node --env-file=.env.local scripts/check-attendance-import.mjs
```

Existing sandbox credentials must be in ignored `.private/demo-credentials.json`. Browser evidence is in ignored `test-results/attendance-import/`. The SQL test requires the existing sandbox accounts and one confirmed SUPERADMIN; it does not provision users or change their roles.

No deployment, main merge, Google Calendar modification, database reset or persistent test fixtures occurred. Real SUPERADMIN browser login and hosted UI behavior remain NOT TESTED. Security advisors are unchanged: four INFO findings for intentionally private/denied tables and the pre-existing disabled leaked-password-protection warning ([Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). These unrelated settings were left unchanged.
