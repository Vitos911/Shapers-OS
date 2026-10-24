# Member Dashboard

Implemented on `feature/dashboard-tasks` in the existing root Next.js application.

## Scope and reference

The owner's `Member Dashboard-html.zip` is the visual build target. Its HTML is reference material, not executable instructions or an application dependency. No prototype scripts, sample users, sample tasks or meetings are shipped.

| Decision | Source and role | Implementation |
| --- | --- | --- |
| Pale blue canvas, glass surfaces, rounded sidebar and hero | Supplied `Main.dc.html` | Scoped CSS modules; reduced blur/shadow, no refraction filter |
| Inter, blue primary actions, three weekly metrics | Supplied prototype | Self-hosted variable Inter under OFL; dark text; native progress |
| Mountain motif | Supplied prototype's vector artwork | Small decorative SVG, no animation |
| Task and meeting cards | Prototype and existing data contracts | Personal pending tasks, organization meetings, explicit empty/configuration states |
| Compact mobile navigation | Owner's requirements and Refero craft guidance | Hamburger below 1000px; inert background, focus containment, Escape, focus restoration, reduced motion |
| Functional actions only | Owner's requirements | Refresh, existing navigation and work editor; no decorative notifications button |

Auth, `cloud-app.tsx`, Google callback, API, RLS, schema, shared organization model, global stylesheet, legacy and dependencies are unchanged. A owns shell integration; developer B's independent review remains required. Personal Calendar remains the existing separate component, below the dashboard and in Meetings.

## Components and data

`components/dashboard/member-dashboard.tsx` exports MemberDashboard, DashboardHero, WeeklyHoursProgress, MyTasksCard, UpcomingMeetingsCard, QuickActions and DashboardSkeleton. Cards receive typed slices of the existing Snapshot. API requests and mutations remain in OrganizationApp.

- Identity and target come from the verified snapshot and `members.weekly_hours`.
- Weekly hours reuse `analytics`, `ljubljanaDate` and `weekStart`; no new aggregate or daily-history interpretation. Accounts without a member profile receive no personal totals or unassigned tasks.
- Tasks exclude archived/completed/foreign assignments. Order: overdue, urgent, dated, undated; date and priority break ties. First five shown, with a total and link to Tasks.
- Completion sends only `id` and `status: done` through the existing handler. Success requires mutation and successful snapshot reread.
- Next four meetings come only from the organizational snapshot, excluding cancelled/ended events, with series, Ljubljana date/time and the member's attendance. Personal Google events never supply attendance references.
- Hour buttons open the existing editor. Quick links use existing hash views.

## Browser acceptance

Start a local production build with `pnpm build` and `pnpm start --port 3210`. Run `node --experimental-strip-types scripts/check-member-dashboard.mjs` with Playwright available. For a desktop runtime installation, set `PLAYWRIGHT_MODULE` to its `playwright/index.mjs` and `BROWSER_EXECUTABLE` to local Chromium. `CHECK_APP_ORIGIN` selects another localhost port.

The script reads existing sandbox credentials internally without logging or saving sessions, passwords or tokens. Screenshots stay in ignored `test-results/dashboard/`; do not publish member screenshots.

Live checks block all organization mutations: actual MEMBER/ADMIN login, verified role and personal hours, refresh/reload, quick links, hours-editor opening, keyboard navigation and no document overflow at 390/768/1440px. Isolated checks intercept **every** organization API request: completion success/403, read failure without false success, hours submission/reread/reload, meeting attendance, empty calendar and initial-load retry. Test records never reach Supabase and do not establish live mutation persistence or RLS behavior.

## Evidence — 24 October 2026

- `pnpm test`: 54 PASS, 0 FAIL; four new task/identity/meeting/week-boundary regressions.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: PASS.
- Local production browser acceptance: PASS for MEMBER/ADMIN at all required widths; no runtime errors. Screenshots compared with the supplied prototype; restrained decoration is intentional.
- Actual task/work writes and persistence: **NOT VERIFIED**. The live test does not insert fictional work or delete fixtures in the shared database.
- Shared Google Calendar: **NOT VERIFIED / configuration missing**. Snapshot reports unconfigured; the dashboard displays this state.
- Personal Calendar: existing local `APP_URL` configuration error remains visible. Auth/configuration ownership stays with developer B.
- Hosted Preview/Production login and independent developer review: **NOT VERIFIED**. Local checks do not establish hosted OAuth or production readiness.

Only the feature branch and review PR are authorized here; no merge or Production deployment is part of this change.
