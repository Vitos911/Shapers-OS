# Shapers OS interface direction

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
