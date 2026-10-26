# Liquid Glass redesign — 26 October 2026

## Scope and design lock

The user's detailed brief is the primary visual source. Its attachment contains text only; no reference image was supplied, so exact screenshot matching is not claimed. Live Refero research returned `NO_SUBSCRIPTION`. Bundled Refero color/craft guidance and the local Apple Web Design skill inform the implementation. This is a CSS interpretation of frosted glass, not a claim to reproduce Apple's optical material.

| Decision | Source / purpose |
| --- | --- |
| Floating, centered capsule dock, 18px sticky inset | User brief; all six destinations, overflow, notifications, refresh/settings and profile remain |
| Static blue / violet / pink / apricot ambient gradients | User brief; depth comes from the backdrop rather than animated blurred blobs |
| 22px common surfaces, 28px timer, navy text | User tokens; reusable material, hierarchy and readable data |
| Red-pink primary actions; green hours, blue tasks, orange meetings, purple streak | User semantic palette; labels and values still carry meaning without color |
| Stronger fields and dialogs, outer glass around tables | User readability/performance requirement; no blur on each cell or input |
| Native elements, visible focus, reduced motion / transparency / increased contrast fallbacks | User accessibility requirement; existing keyboard, form and dialog behavior remains |

Reusable `GlassSurface`, `GlassCard`, `GlassButton`, `GlassInput`, `GlassBadge` and `GlassModal` are thin native-element wrappers in `components/ui/glass.tsx`. They forward props and refs and contain no business logic. Existing Card, editor, auth surface and timer consume the appropriate variants. Other views consume the same material tokens through their existing CSS Modules and global classes; there is no new UI library or parallel styling framework.

## Protected boundaries

No API, auth flow, provider, permission, calculation, database schema, RLS, environment variable or production configuration changes are part of this work. The previous collaboration migration files are preserved; this redesign does not apply them. `/legacy` implementation is unchanged and the new material is scoped to the organization/auth surface.

An ignored SHA-256 baseline covers the tracked backend, auth, Supabase, tests, dependency manifests, config and legacy component. A final comparison must match before handoff. Test-only transport fixtures are never production data or a replacement for Supabase.

## Verification

Validation on the final feature tree (the PR head identifies the tested commit):

- `pnpm test`: 174 passed; `pnpm test:db`: 27 passed in isolated PGlite.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed.
- Release browser acceptance: MEMBER, ADMIN and SUPERADMIN; every available view at 375, 768, 1024, 1440 and 1920px; no document overflow, inset capsule dock, task save/reload, hours navigation, admin correction, history, AI error, mobile keyboard and increased contrast passed. A 4x CPU simulation exercised opening/closing the mobile dock; this is not physical hardware certification.
- Full-stack local acceptance: production Next build and Chromium against isolated PostgreSQL/RLS; concurrent timer start, authenticated reload, pause/resume, offline recovery, lost stop response, admin correction/audit and project join/claim/completion/leave persistence passed.
- All 94 protected-file SHA-256 hashes match the pre-redesign baseline. API/auth/database/test contracts and dependencies are unchanged.
- Screenshot evidence: `docs/screenshots/liquid-glass-desktop.png` and `docs/screenshots/liquid-glass-mobile.png`. These show synthetic browser-test identities and records, not production data.

React review: native element semantics, forwarded refs, existing handlers/form names and role checks remain intact; no new state, effects, client fetches, packages or provider calls. Shared-file edits have automated evidence but no second human developer review is claimed.

Browser checks can establish local layout, interaction, database persistence in an isolated SQL/RLS environment, increased-contrast rendering, reduced motion and simulated CPU throttling. They cannot certify physical low-end hardware, every assistive technology, live Google/Slack/AI providers or hosted authentication.

The user explicitly requested merging the completed redesign into main. That instruction supersedes the attachment's generic “do not merge automatically” workflow. Use a PR and successful checks; do not change branch protections or mark an unperformed second-developer review as approved.
