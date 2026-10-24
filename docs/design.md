# Shapers OS interface direction

Purpose: a Slovenian workspace for a community's projects, events, members and volunteer hours. First release is local to the browser; it starts empty and makes no claims about real community results.

Reference lock: Refero's bundled typography and craft-details guidance. Live Refero searches returned NO_SUBSCRIPTION, so no live screen or style is claimed as reviewed. Direct build follows the user's request to create a working application.

| Decision | Reference or requirement | Application |
| --- | --- | --- |
| Neutral system type | Typography: work tools need scanning clarity; one family | 12–14 px interface text; 27–34 px page heading; three weights |
| White surfaces and restrained blue | Product purpose: calm collaborative workspace | Blue is for primary actions, navigation and overview banner; semantic status colors stay in badges |
| Sidebar and actionable empty states | Projects, events, members and hours need separate views | Hash links support browser history; empty states lead to the relevant creation form |
| Labeled forms and native dialogs | Craft-details: focus, semantic controls, forms | Browser validation, keyboard focus, Escape dismissal, visible errors |
| No photos required | Working dashboard rather than presentation website | Lucide icons; globe as a code-native brand motif |
| Local save and backups | No supplied backend or credentials | Explicit local notice, JSON export/import, CSV hours export |

QA target: preserve the white/blue workspace, readable content and navigation at 390px and desktop widths. Verify form submission, persistence across reload, project tasks, event attendance and hours accounting.
