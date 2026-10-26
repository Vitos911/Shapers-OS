# UI evolution delivery and verification

Completed 26 October 2026 on origin/main afbd9af. See [research and design decisions](ui-evolution-research.md) and [membership architecture / rollout](project-collaboration.md).

## Delivered changes

| Area | Files | Result |
| --- | --- | --- |
| Navigation | `components/top-navigation.tsx`, `components/dashboard/organization-shell.module.css`, `components/organization-app.tsx` | Horizontal six-tab navigation, role-aware overflow, mobile disclosure, real overdue-task notifications, profile/settings utilities; no permanent sidebar |
| Visual refresh | `app/globals.css`, `components/dashboard/member-dashboard.module.css` | Exact brand and semantic accent tokens, neutral surfaces, restrained glass, colored KPI edges, labeled status/priority badges |
| Project collaboration | `components/project-discovery.tsx`, `components/project-discovery.module.css`, `lib/organization.ts`, `lib/org-validation.ts`, `app/api/org/[resource]/route.ts` | Search and scope filters, goals, aggregate progress, member names, personal projects, self-join/leave, approval, independent admin membership controls and history |
| Task claiming | Same API/types/editor, discovery availability section, claim migration | Explicit availability, linked-member validation, atomic conditional assignment, existing history, conflict response, administrator controls |
| Verification | `tests/project-api.test.mjs`, `supabase/tests/project_collaboration.sql`, `scripts/check-project-collaboration.mjs`, `scripts/check-collaboration-ui.mjs`, `scripts/check-member-dashboard.mjs`, `.github/workflows/ci.yml` | API tests, executable isolated SQL / races, all-role responsive browser acceptance, updated navigation expectations and PostgreSQL CI job |
| Documentation | Two `docs/*evolution*.md` files and `docs/project-collaboration.md` | Reference/license audit, deployment order, access model, evidence and limitations |

Database files: `supabase/migrations/20261025195203_project_collaboration.sql` and `20261025195204_claimable_tasks.sql`. New tables: `org_project_join_requests` and `org_project_membership_history`. Existing membership table and unique key are reused. No existing production records were updated or removed.

## Verified locally

- `pnpm test`: **174 passed, 0 failed** (170 existing plus four API tests).
- `pnpm lint`: passed without diagnostics.
- `pnpm typecheck`: passed.
- `pnpm build`: successful optimized Next.js 16.4.3 build.
- PostgreSQL **17.10**, disposable local database: migration execution, private/organization discovery, MEMBER/ADMIN/SUPERADMIN privileges, approval/cancellation, idempotent joining, direct-write denial, immutable history grants, disabled/unlinked/anonymous denial, task conflicts, handoff requirements, task history, hours overlap protection and trusted historical attendance import passed.
- Ten simultaneous claims over two independent PostgreSQL sessions: exactly one winner each. A winning claim held open while the same member leaves through another connection correctly blocks leave after commit.
- Browser acceptance: MEMBER, ADMIN, SUPERADMIN; 1440/768/390/320 px; primary/overflow navigation, no sidebar, project goals/progress, joining, claiming, handoff notice, admin editor, mobile close-on-selection / Escape / focus restoration, no horizontal document overflow and no browser runtime errors. Screenshots were inspected visually for desktop and mobile.
- Existing Google OAuth, personal-calendar, leaderboard, historical-hours, timer, weekly-streak, Slack, Ask Shaper and DST tests are retained. Production provider code is unchanged; six inherited Groq test fixtures were updated to use the gsk_ prefix required by the current provider validator.

Browser results and synthetic screenshots are in ignored `test-results/collaboration/`. They contain fixture data, not proof of a production mutation. SQL fixtures live exclusively in disposable local databases.

One local PostgreSQL rerun was interrupted when a shared Windows console terminated a background worker (`0xC000013A`); an immediately following recovery connection was not yet accepted. A fresh database with the server launched in an independent hidden process passed the full expanded suite, including both concurrency checks. Earlier terminal interruptions are not counted as application failures or silently used as passing evidence.

## Limits and rollout risks

No migration was applied to hosted Supabase, no deployment was requested, and no PR was merged into main. Live read-only inspection confirmed the existing membership schema and revealed target task permissions beyond the local baseline. The claim migration preserves the installed guard and existing SELECT policy; review this schema drift before applying. Unknown guard families fail visibly.

The fully unmigrated database keeps existing snapshot reads with an explicit feature-pending state. Apply both migrations in order before publishing the complete feature. New projects remain private / closed unless an administrator changes them. Historical membership events begin at installation; earlier events are not invented.

Live Google Calendar reconnection/sync and hosted role acceptance were not repeated. Slack and Ask Shaper implementation is retained from current main; live Slack delivery and live paid-provider calls remain unverified. GitHub CI results require the remote jobs to finish; local passing checks are recorded separately.

Native disclosure and dialogs, labeled controls, progress semantics, focus indicators and reduced-motion behavior are implemented and exercised. This is not a full WCAG audit with assistive technology.

## PR structure

Four ordered changes: navigation, visual system, project discovery/membership, task claiming plus acceptance/CI. The first PR targets current main afbd9af; each following PR targets the preceding branch. Existing local unfinished files were preserved in ignored snapshots and are not bundled into a prerequisite PR. All four PRs require review by the other developer under CONTRIBUTING.md; no approval, merge or Production release is claimed.

Integration revalidation: current main includes a timer, history, Slack, Ask Shaper/DeepSeek and Aurora. These were merged by intent, preserving both sides of the affected shared components. Updated release database tests apply the two new migrations after the earlier pending migrations in the upgrade path, and exercise the new SQL suite in both paths.
