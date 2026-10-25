# Shapers OS interface direction

> Current visual direction (25 October 2026): [Global Shapers UI redesign](ui-redesign.md). This supersedes the earlier glass/blue visual target below; original feature and verification records are retained.

Purpose: a Slovenian workspace for a community's projects, meetings, tasks, members and volunteer hours. The main organization app reads Supabase; the earlier local/JSON application remains isolated at `/legacy`.

Reference lock: Refero's bundled typography and craft-details guidance. Live Refero searches returned NO_SUBSCRIPTION, so no live screen or style is claimed as reviewed. Direct build follows the user's request to create a working application.

| Decision | Reference or requirement | Application |
| --- | --- | --- |
| Neutral system type | Typography: work tools need scanning clarity; one family | 12–14 px interface text; 27–34 px page heading; three weights |
| White surfaces and restrained blue | Product purpose: calm collaborative workspace | Blue is for primary actions, navigation and overview banner; semantic status colors stay in badges |
| Sidebar and actionable empty states | Projects, events, members and hours need separate views | Hash links support browser history; empty states lead to the relevant creation form |
| Labeled forms and native dialogs | Craft-details: focus, semantic controls, forms | Browser validation, keyboard focus, Escape dismissal, visible errors |
| No photos required | Working dashboard rather than presentation website | Lucide icons; globe as a code-native brand motif |
| Real persistence and role boundaries | Supabase backend; preserve existing design | Same sidebar, blue actions, native labeled dialogs and white cards; save/error/loading feedback from API |
| Historical weekly totals | Source has no daily allocation | Separate aggregate table and coverage notes; never invent daily dates |
| Missing integrations | Google credentials not supplied | Explicit setup state and sync errors; no fake meetings or attendance rates |
| Legacy compatibility | Preserve existing JSON workspaces | Separate `/legacy` route retains original save and backup features |

QA target: preserve the white/blue workspace, readable content and navigation at 390px and desktop widths. Verify form submission, persistence across reload, project tasks, event attendance and hours accounting.

Personal calendar reference lock: existing organization white panels/blue primary actions, current meeting cards and bundled craft-details async/semantic control guidance. Refero lookup again returned NO_SUBSCRIPTION. Direct-build addition, not a redesign: chronological agenda in overview/meetings, date before title, explicit private/primary-calendar label, inline loading/error/empty states, eight rows initially and progressive disclosure. No generated assets. Personal events stay visibly separate from organization attendance and shared calendar.

Google login addition: the existing login card/button system is the reference lock; preserve blue email CTA, white surfaces, typography and labeled forms. Google is a full-width secondary action with disabled/busy state and inline actionable errors; callback recovery uses the same card. Refero again returned NO_SUBSCRIPTION; bundled craft guidance informed semantic buttons, visible focus and status announcements. No visual redesign or generated imagery was needed.

## Visual polish — 25 October 2026

Scope: `codex/visual-polish-20261025`, based on verified `origin/main` at `0f574c4`. The shared checkout already contained unrelated, uncommitted dashboard, profile, leaderboard and weekly-streak work, plus commits ahead of main. Work is isolated in a separate checkout so those changes are preserved and excluded from this PR. The newer `components/dashboard/member-dashboard.tsx` is not on main; this refinement targets main's existing `OrganizationApp` instead. No production deployment or merge is part of this change.

Findings from the original MEMBER and ADMIN screens: personal-calendar setup/loading appeared ahead of core work information; weekly progress and the tasks action required substantial scrolling; large single-column meeting surfaces, 9–12px labels, inconsistent controls and mobile table-label overflow weakened scanning. SUPERADMIN uses the same shell, tables and forms, with extra access-management controls.

Reference lock: preserve the existing Shapers white/blue identity, system font and logo. Live Refero research returned `NO_SUBSCRIPTION`; its bundled typography and craft-details references were reviewed, not live product examples. The user's existing-product target authorizes a direct, limited implementation.

| Decision | Source / role | Implementation |
| --- | --- | --- |
| Work before setup | User P0 and original dashboard screenshots | Compact welcome, unchanged four metrics, task preview and weekly progress before the full upcoming meeting and personal calendar |
| Restrained materials | User's white/blue and glass requirements | Opaque data cards; translucent sidebar/topbar and dialog, 16/24px blur with opaque unsupported/reduced-transparency/high-contrast fallbacks |
| Readable, consistent controls | Bundled typography and craft-details | 14px content, 12–13px supporting labels, 18px sections; 44px controls, 10px control radii, 16px panels, 12–20px gaps |
| Clear state | User P1/P2 and craft-details | Blue active navigation, semantic labeled status/priority badges, visible hover/focus/disabled states, named native dialog |
| Mobile containment | User's 390/768/1440px targets | Responsive dashboard/sidebar, wrapping forms, focusable horizontally scrolling tables; relative table container keeps absolute screen-reader labels inside it |
| Preserve contracts | User's strict scope and local Next.js CSS guide | One scoped CSS module plus presentational JSX; global CSS and `/legacy` are untouched; no dependency changes |

The preview uses the existing `shownTasks` visibility and status rules, renders up to three open tasks and links to the unchanged full task view. Hours, goals, meeting eligibility, role gates, handlers and all calendar integration behavior retain their original code. No task-completion shortcut or new mutation path was added.

Validation and limits:

- Baseline and final source tests: 50/50 passed; `pnpm typecheck`, `pnpm lint` and `pnpm build` passed. The main branch has fewer tests than the separate unmerged feature checkout.
- TypeScript AST comparison, excluding JSX and the CSS import, found identical program code. All 53 existing event-handler/callback attributes are identical. API, library, migration, RLS, auth, dependency and legacy files are unchanged.
- Local Chrome acceptance script: real existing MEMBER/ADMIN login and reload; all available main views at 390/768/1440px; navigation and focus, keyboard table scrolling, hours dialog; browser-only fixtures for populated/empty/error states, hours submission and task status update. All organization mutations are intercepted. No live organization writes.
- SUPERADMIN settings/access-table rendering is checked only with an intercepted browser fixture, not a real elevated account. This does not establish live SUPERADMIN authorization.
- The local personal-calendar response already reported `APP_URL mora biti varen naslov aplikacije.` before changes. Full Google OAuth/Calendar verification is outside this UI change; no auth or integration configuration was changed. Actual production and hosted-device behavior are not verified.
- Screenshots and machine-readable results remain private in ignored `test-results/visual-polish/`. `scripts/check-visual-polish.mjs --before` captures baseline; without the flag it checks the result. Set `CHECK_APP_ORIGIN` to a local dev/production server, `PLAYWRIGHT_MODULE` to an existing Playwright module and optionally `BROWSER_EXECUTABLE` to installed Chrome. Existing `.private/demo-credentials.json` is required and must never be committed. No browser dependency is added.

Use the existing global reduced-motion rule; this refinement adds only short color/border/shadow transitions. OS contrast/transparency fallbacks are checked in code; this is not a full accessibility audit. Layout and interactions are reviewed against the existing-product reference lock, not presented as a redesign.
