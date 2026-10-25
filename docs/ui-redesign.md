# UI redesign audit and reference lock — 25 October 2026

## Baseline and scope

Working branch: `codex/shapers-leaderboard`. The worktree already contained leaderboard/streak changes, migrations, server changes and `.env.example` edits. These are pre-existing, not part of this redesign. UI copies and SHA-256 hashes for 51 protected files were recorded in ignored `test-results/redesign/` before editing.

Next.js 16.4.3 App Router, React 19, TypeScript, plain global CSS plus CSS Modules, Lucide icons, self-hosted Inter. No component framework. Read installed Next.js `01-app/01-getting-started/11-css.md` before implementation; keep global tokens in root stylesheet and component styles locally scoped.

OrganizationApp owns navigation, snapshot requests, refresh and editor mutations. Existing hash views: overview, leaderboard, tasks, projects, hours, meetings, attendance, members, analytics, profile, settings. MEMBER navigation omits members/analytics and deep links remain denied. ADMIN sees those views and project/task/attendance management. SUPERADMIN additionally manages trusted access and organization settings. Keep every conditional and handler. `/legacy` retains JSON/local workspaces. Login, callback completion, personal calendar and profile remain existing components.

Reuse: Card/Stat/Empty, native dialog Editor, filters, tables, task/meeting cards, WeeklyHoursProgress, WeeklyStreakCard, Leaderboard, PersonalCalendar, UserProfile and existing logo. UI states include loading, initial failure/retry, stale-refresh error, busy controls, no member link, no tasks/projects, calendar not configured, no meetings, role denial and successful reread feedback. Supabase snapshot/CRUD, personal calendar and organization calendar routes stay untouched. No service calls, schemas, migrations, RLS, roles, goals or calculations are changed.

## Research and reference lock

Primary reference, inspected in browser: https://www.globalshapers.si/sl/ on 25 October 2026. Computed root tokens: blue `#0b3ae0`, ink `#14130f`, secondary ink `#4a4740`, line `#dbdad7`, ice `#fbfaf9`, well `#ebebe9`. Actual type: Clash Display 600 for headings, Satoshi 400/500/700 body; decorative Instrument Serif is marketing-only. Numbered section labels, bold compact headings, fine dividers and clear blue accents carry the identity. Marketing imagery and animated hero are inappropriate to this work surface.

Live Refero style/screen searches returned NO_SUBSCRIPTION; no live Refero results are claimed. Bundled typography/craft-details guidance supports neutral scanning typography, labels, native controls, visible focus, touch targets and honest async states. The user's explicit secondary reference is Linear-style productivity density and quiet navigation.

Direct-build target: the user's named Global Shapers visual source, adapted to existing application, no additional design-selection gate.

| Decision | Source | Role / reason |
| --- | --- | --- |
| Exact blue and ink | Official computed CSS tokens | Blue: primary controls, active navigation, numbered labels; status colors remain semantic |
| White workspace and neutral sidebar | User brief plus official line/neutral palette | Functional, dense canvas; no decorative gradients or blur |
| Existing self-hosted Inter | Bundled work-tool typography guidance | Explicit substitute for Clash Display/Satoshi; no unverified license or new third-party font request |
| Numbered section labels | Official `01 — Kaj počnemo` rhythm | Subtle orientation for existing views; never new routes |
| 32px headings, 18px sections, 14px body, 12px metadata | User scale and craft references | Scanable hierarchy; KPI 28–32px |
| 8px corners, thin borders, minimal shadows | User requirement | Shared cards, forms, modals and notifications |
| Compact greeting, KPI row, then tasks and meetings | User dashboard brief | Real existing task/meeting/streak helpers; no invented data or new counting rules |
| Keep detailed streak and leaderboard below main work | Existing implementation plus user preserve-functionality rule | Retain milestones, achievements, filters and request flow |
| Existing focus-trapped drawer below 1000px | Existing accessible navigation | Preserve Escape, inert background and focus restoration |

## Incremental implementation

1. Central tokens and shared controls; preserve legacy layout contracts.
2. Scoped organization shell, compact brand, grouped existing navigation, current-week label, profile footer.
3. Compact dashboard, existing progress and summary values, dense task/meeting lists; detailed streak and leaderboard retained.
4. Apply same tokens to profile, leaderboard, all organization tables/forms, personal calendar, auth and legacy shared controls.
5. Lint/typecheck/unit tests/build; browser checks of real sandbox login and read-only views, responsive geometry, keyboard drawer and editor opening. Report external integration and untested mutation boundaries explicitly.

## Files changed by this redesign

- `app/globals.css`: central tokens, self-hosted font declaration, shared controls, tables, statuses, dialogs, calendar/auth styling and mobile fixes.
- `components/dashboard/organization-shell.module.css`: neutral shell, compact navigation/brand/profile, topbar and responsive drawer styling.
- `components/organization-app.tsx`: presentational wordmark/profile/week/breadcrumb, view descriptions, status attributes, keyboard-scrollable table regions and editor accessible name. Existing navigation IDs, access conditions, handlers and requests retained.
- `components/dashboard/member-dashboard.tsx`: compact welcome, real existing KPI summaries, date tiles, task/meeting ordering, clearer unlinked-profile empty state. Existing callbacks retained.
- `components/dashboard/member-dashboard.module.css`: dashboard cards/lists/progress, detailed streak, responsive density and empty/loading styling.
- `components/user-profile.module.css`: shared surfaces, color tokens, borders and compact profile hierarchy.
- `components/leaderboard.module.css`: same tokens, neutral surfaces and table scroll containment. The leaderboard existed before this redesign.
- `scripts/check-member-dashboard.mjs`: update the existing browser acceptance heading assertion and retain the personalized greeting assertion. The browser script itself was not executed in this session; browser QA used the in-app browser tools.
- `docs/design.md`, `docs/member-dashboard.md`: pointers to the current visual direction while preserving earlier feature records.
- `docs/ui-redesign.md`: baseline, audit, source tokens, reference lock, changed-file inventory and QA evidence.

## Verification — 25 October 2026

- `pnpm test`: **92 PASS, 0 FAIL, 0 skipped**, before and after the UI changes. Existing tests cover task/meeting selection, roles/profile isolation, hours/import/streak accounting, leaderboard, auth, calendar transport and storage. These are source/unit/transport tests, not proof of live Google authorization or live CRUD persistence.
- `pnpm typecheck`: **PASS**. A first attempt discovered the baseline `.tsx` copies under `test-results/` (included by the existing TypeScript glob); renamed those audit copies to `.txt` and reran successfully. No tsconfig change.
- `pnpm lint`: **PASS**, no warnings. `node --check scripts/check-member-dashboard.mjs` and `git diff --check`: **PASS**.
- `pnpm build`: **PASS**, including Next.js compilation and its TypeScript check. Local production runtime used for browser checks; no deployment.
- SHA-256 comparison of **51 protected files**: **all unchanged**. Covers `lib/`, API/auth routes, Supabase migrations/tests, environment files, package/lock/config files, CloudApp, PersonalCalendar and dashboard-data helpers. The initial dirty worktree and existing leaderboard/server/migration edits are preserved.
- AST-based comparison: all **52 OrganizationApp + 6 dashboard event handlers** match the pre-edit working tree exactly. This is evidence of preserved handler code, not a claim that every live write was exercised.
- Actual sandbox MEMBER and ADMIN password login, logout, reload, Supabase snapshot and leaderboard reads: **PASS**. MEMBER sees own hours/profile; analytics/member navigation is absent and direct hashes show access denied. ADMIN sees analytics/member tables and existing forms. No changes to trusted access or user roles.
- Browser views inspected: overview, tasks, projects, hours, meetings, attendance, members, analytics, profile, leaderboard and settings. Desktop 1440px, tablet 768px and mobile 390px layouts inspected across representative views; all MEMBER views inspected on mobile. Long tables remain within their own scroll regions.
- Mobile keyboard: drawer focuses its close button, Shift+Tab wraps to logout, Tab returns to close, Escape dismisses and restores focus to the opener. Native editors for hours/project/task/attendance opened and closed without saving. Visible focus and reduced-motion rules retained.
- Read-only inspection does not write task, project, work, attendance, profile or access records. Existing data was never replaced with fixtures; no mock transport was shipped.

### Remaining verification boundaries

- Live CRUD submission/persistence, actual Google OAuth consent and real SUPERADMIN browser session: **NOT VERIFIED**. No disposable destination or actual SUPERADMIN login was used; original permission conditions and protected code remain intact.
- Organizational Calendar reports unconfigured, while stored meeting references are displayed. Personal Calendar reports the existing `APP_URL` configuration error. Neither service configuration was changed; setup/error states remain visible, with no false connection success.
- No new third-party fonts: existing OFL Inter is the explicit functional substitute for Satoshi/Clash Display. No claim of pixel-identical marketing typography.
- No hosted deployment or full automated WCAG audit. Desktop browser screenshots from the in-app browser can be cropped by the host surface; DOM geometry was checked separately. Mobile screenshots provide an uncut visual artifact.

## Liquid Glass refinement — 25 October 2026

Latest user direction supersedes the earlier no-glass constraint: retain the Global Shapers palette, type and layout, with restrained glass on sidebar/header/KPIs and stronger glass on dialogs/pickers. Apple-web-design skill contributes selective materials, solid content surfaces and accessible fallbacks; this is a CSS approximation, with no refraction shader or animated effects. Reference: existing Global Shapers lock above plus the user's explicit Apple/Linear direction.

Central `--glass-*` tokens provide opacity, edge, reflection, shadow and blur values. Unsupported backdrop-filter gets solid surfaces. Reduced transparency/increased contrast request opaque materials; existing reduced-motion rules stay in force. Native desktop single-select pickers progressively adopt glass via CSS `base-select`/`::picker(select)` only where supported; mobile and unsupported browsers retain native menus. See [MDN picker documentation](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::picker).

The sidebar profile now appears once, in its footer, with active state. The existing `#profile` route, header shortcut and settings link remain. The raster logo uses multiply blending to remove its white rectangle visually, without changing the supplied artwork. Only global CSS, the two dashboard CSS modules, the presentational navigation filter and this documentation changed in this refinement.

Glass QA: 92/92 source tests PASS; lint PASS; final production build and its TypeScript check PASS. First sandbox build compiled successfully but hit filesystem EPERM during prerender; normal-permission retry passed. 51 protected-file hashes match. Browser confirms sidebar/header blur 16px, KPI blur 8px, opaque task panel, dialog/picker blur 24px and multiply logo blending. Native filter selection still updates to Impact. At 1440/768/390px no document overflow; populated mobile task table containment also passes. Sidebar has exactly one profile link; Shift+Tab wraps to logout and Escape restores focus to menu opener. Reduced motion/transparency/contrast fallbacks verified in CSS; OS preference emulation and a full accessibility audit were not run. No live CRUD writes, auth changes or service configuration changes. Screenshots are local in ignored `test-results/glass/`.
