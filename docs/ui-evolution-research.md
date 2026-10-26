# UI evolution: architecture, references and design lock

Completed 26 October 2026; references inspected 25 October 2026. Scope: incremental changes to the existing Next.js / React / TypeScript / Supabase organization application.

## Architecture and preservation

OrganizationApp owns authenticated snapshot reads and mutations. Extract horizontal navigation into TopNavigation and project discovery into ProjectDiscovery. Retain hash navigation, existing editors, PersonalCalendar, UserProfile, Leaderboard, weekly streak helpers and the isolated `/legacy` workspace. Reuse `org_project_members` and its composite primary key; never infer membership from task assignment. Existing assignment-based project access remains authorized.

Before this task, the checkout already contained uncommitted leaderboard, streak, style, import and documentation work. The ignored `.private/evolution-baseline` snapshot preserves those files. The completed changes were integrated onto origin/main afbd9af after fetching on 26 October. Existing timer, history, Slack, Ask Shaper and Aurora features are retained. PRs are stacked directly above that main revision; the earlier local baseline is not published.

Installed Next.js guides read: App Router CSS, route handlers and Playwright. Dynamic route params remain promises. No new application dependencies, framework, authentication provider or scoring formula.

## Public repository comparison and licenses

Sources were read through GitHub on 25 October 2026. No source code was copied.

| Repository / inspected source | License metadata | Finding and bounded adaptation |
| --- | --- | --- |
| [AI-weekend-solution](https://github.com/NejcBohinjc/AI-weekend-solution/blob/main/src/app/(app)/projects/actions.ts) | MIT; LICENSE exists | Server-side admin checks and explicit mutation feedback. Keep authority at the server and database. The inspected actions do not establish self-join. |
| [shapers-hub](https://github.com/CommanderC0dy/shapers-hub/blob/master/server/src/modules/tasks/assign.ts) | No license declared in repository metadata | Acceptance is distinct from assignment; conditional mutations and transactional history. Use only the concept of an explicit task acceptance action. No copying. |
| [shapers-platform](https://github.com/ota-cyber/shapers-platform/blob/main/src/app/tasks/page.tsx) | MIT; LICENSE exists | Mine/all task scope, project organization and clear task controls. Retain familiar task list with personal filtering and add a separate available-task section. |
| [Team-coordination-platform](https://github.com/bernardkucina/Team-coordination-platform/blob/main/frontend/src/components/projects/ProjectsOverview.tsx) | No license declared in repository metadata | Discovery cards with goals, progress, members and scope filtering. Its team is inferred from tasks; this implementation deliberately uses explicit membership as required by the brief. No copying. |

These files provide bounded references, not evidence that all four repositories implement secure self-join or atomic claiming.

## Reference lock and decision ledger

Live Refero search returned `NO_SUBSCRIPTION`; no Refero style, screenshot or flow is claimed as reviewed. Use the existing product as the primary direct-build target, the user's exact brief, and bundled Refero color / craft-details guidance.

| Decision | Source | Role |
| --- | --- | --- |
| Horizontal primary navigation with compact mobile disclosure | User brief | Six named destinations; overflow views retain role checks; utilities at right |
| Existing self-hosted Inter and restrained card geometry | Existing application | Preserve readable density and a recognizable workspace |
| Brand `#BC3046` | User palette | Active navigation, project identity, primary organization actions |
| Tasks `#2563EB`, hours `#16A34A`, warning `#F59E0B`, gamification `#8B5CF6`, error `#DC2626` | User palette | Semantic data accents; use darker text on pale backgrounds for contrast |
| Neutral canvas, white cards, glass only on header / existing panels | User brief and bundled color guidance | Avoid competing colored surfaces |
| Progress with numeric completion label | Discovery reference and accessibility brief | Color is accompanied by values, labels and native progress semantics |
| Labeled native forms, visible focus, 44px navigation targets, reduced motion | Bundled craft-details and user brief | Keyboard and touch access; browser handles dialogs and disclosure semantics |

No bitmap assets are needed. Icons communicate functional destinations and always have adjacent text or an accessible name. Existing calendar, scoring and streak calculations remain untouched.
