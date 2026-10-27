# WemryOS for Business

**Your team. One workspace.**

Wemry is the parent brand; WemryOS is the platform; WemryOS for Business is the collaboration product. This repository upgrades the existing Next.js App Router application in place. The repository and existing API identifiers retain their compatibility names.

The upgrade adds multiple workspaces, OWNER / ADMIN / MEMBER membership, a server-enforced 50 active-member limit, workspace switching, member-created projects and tasks, configurable membership groups, and privacy-aware connection presence. Global Shapers is the default workspace containing existing organization records. Legacy JSONB spaces remain at `/legacy` with their existing access rules.

Existing functionality includes project discovery/join requests, Kanban and task history, a persisted work timer, attendance, readonly Google Calendar, leaderboard/streaks, Google/email/demo authentication and the existing Slack integration. Ask Wemry uses the existing `/api/ask-shaper` endpoint and provider configuration; hosted AI operation still requires independent verification. Automatic Slack reminders are not claimed as implemented.

## Run locally

Use Node 22.18+ and the pinned pnpm version in package.json.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Copy `.env.example` to the ignored `.env.local` and supply credentials for your development environment. Never commit credentials or point mutating tests at production.

## Verify

```sh
pnpm test
pnpm test:db
pnpm typecheck
pnpm lint
pnpm build
pnpm test:browser
node scripts/check-wemry-browser.mjs
```

The browser harness uses real Next.js HTTP handlers and an isolated PostgreSQL engine with synthetic Auth/config transport. It is separate from hosted Supabase, Google, SMTP and Vercel acceptance. On Windows, `BROWSER_EXECUTABLE` can select installed Chrome if the Playwright browser package is unavailable.

## Upgrade and deployment

Read [the upgrade audit, migration and verification guide](docs/wemryos-upgrade.md), [data contracts](docs/DATA_CONTRACTS.md), [contributing](CONTRIBUTING.md) and [infrastructure](docs/infrastructure.md). The feature branch is `feature/wemryos-platform-upgrade`.

The migration is prepared for staging; it is not applied to production by a Git push or preview build. The production migration history uses different version numbers for several existing changes, so reconcile migration contents before cutover. Review and production approval remain required. No automatic merge or second deployment pipeline is introduced.

The existing Vercel project remains linked to `Vitos911/Shapers-OS`: `main` is Production and feature PRs are Preview. A READY deployment alone does not prove authenticated writes or data persistence.
