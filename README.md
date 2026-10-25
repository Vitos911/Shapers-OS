Shapers OS — Hackathon Submission
Live application: https://shapers-os.vercel.app
Public source code: https://github.com/Vitos911/Shapers-OS
Submission date: 25 October 2026
What it does
Shapers OS is a coordination platform for the Global Shapers volunteer team. It brings together assigned tasks, project management, work-hour tracking, meeting attendance, and management analytics. The interface supports three roles: MEMBER, ADMIN, and SUPERADMIN, with server-side authorization and database row-level security.

Members can view and update their assigned tasks, track their weekly contribution against their membership tier (GO! 4 h, Impact 10 h, Core 70 h), and review meetings and attendance. Admins can coordinate projects, assign work, correct attendance and inspect organization-wide performance. The app also includes task history, a leaderboard and weekly streaks.

Ask Shaper (in development): An AI agent intended exclusively for internal use by authorized Global Shapers team members and administrators is being developed with Groq (or OpenAI when configured). Its purpose is to answer questions about authorized tasks, hours, attendance, meetings and organization statistics using server-side calculations and role-based access controls. It is not yet considered a finished or reliably operational feature in the deployed application.
Architecture
Layer	Technology	Responsibility
Web app & API	Next.js 16, React 19, TypeScript	Dashboard, API routes, server-side checks
Hosting	Vercel	Builds and serves the app from GitHub main
Database & identity	Supabase (PostgreSQL, Auth, RLS)	Users, roles, tasks, hours, attendance, history
Meetings	Google Calendar API	Read-only organizational meeting import/sync
AI (in development)	Groq API; optional OpenAI	Ask Shaper, an internal-use AI agent; not yet production-ready
Optional messaging	Slack Web API	Optional integration; not needed for core task flow


Data flow: Browser → Next.js API → authenticated Supabase queries/RLS → PostgreSQL. Next.js separately reads Google Calendar events and sends narrowly scoped, validated AI requests to the selected AI provider. Google Calendar remains the source of meeting schedules; the app does not create or edit Google Calendar events.
Deploy from scratch
1. Install Node.js ≥22.18, enable Corepack and use pnpm 11.25.0. Clone the repository:
   git clone https://github.com/Vitos911/Shapers-OS.git
   cd Shapers-OS
   corepack enable
   pnpm install --frozen-lockfile
   cp .env.example .env.local
2. Create your own Supabase project. Populate .env.local using your own keys; never commit it. Apply the versioned migrations in supabase/migrations/ using the Supabase CLI, reviewing the dry run before execution:
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref YOUR_PROJECT_REF
   pnpm dlx supabase db push --include-all --dry-run
   pnpm dlx supabase db push --include-all
   The --include-all flag is needed only when the migration history requires it; confirm the exact pending migration list before applying. Do not point these instructions at an existing production database without reviewing the migration and rollback plan.
3. Import the supplied fictional sandbox roster and records using the documented scripts in docs/infrastructure.md. Configure a Google OAuth client in Supabase Auth and register your actual application origin and callback/redirect URLs. Import the sandbox .ics into a Google Calendar and configure read-only access. Role provisioning and synthetic demo credentials are documented in the same file; never publish demo passwords.
4. Run the quality checks and the local server:
   pnpm check
   pnpm dev
   Open http://localhost:3000. The health endpoint is /api/health.
5. Import the GitHub repository into Vercel (framework: Next.js; root: repository root; production branch: main; Node.js 24.x). Copy the required environment variables to Vercel Project Settings → Environment Variables. Set APP_URL to the exact production HTTPS origin; configure matching Supabase redirects. Deploy and verify login and every role against the hosted database. Database migrations and sandbox imports are not run as part of Vercel builds.
Environment variables (names only)
Variable	Use
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY	Supabase URL and browser-safe key
SUPABASE_SECRET_KEY	Server-only provisioning and authorized operations
APP_URL, AUTH_COOKIE_SECRET	Canonical HTTPS origin and secure OAuth cookie secret
GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_TIMEZONE	Shared calendar and Europe/Ljubljana timezone
GOOGLE_CALENDAR_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON	Public-calendar key or private calendar service account
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN	OAuth/private-calendar configuration where required
SHAPER_AI_PROVIDER, SHAPER_AI_API_KEY, SHAPER_AI_MODEL	Optional AI provider, credential and model
GROQ_API_KEY	Optional Groq-specific alias for AI key
SLACK_BOT_TOKEN, SLACK_CHANNEL_ID	Optional Slack integration
SLACK_TEST_ENABLED, DEMO_AUTH_ENABLED	Explicit opt-in switches; leave false normally


Never put server secrets in NEXT_PUBLIC_* variables, documentation, commits or demo screenshots. See .env.example for the authoritative complete list and docs/release-integration.md for migration, test and rollout constraints.
Completion, limitations and AI — submission statement
Implemented in the repository: role-based member/admin/superadmin dashboards, project and task workflows with history, volunteer-hour and attendance tracking, tier targets, manager analytics, Google Calendar read-only integration, gamification (leaderboard/streaks). Ask Shaper remains in development and is not listed as a completed feature. The integration branch has documented automated checks and browser fixtures. Limitations: automated/local checks and a Vercel READY build are not proof that every deployed feature works end-to-end; production OAuth, live calendar sync, hosted permissions/RLS, task changes, attendance changes still need a real-account smoke test; Ask Shaper additionally needs further development and end-to-end verification after confirming migrations and environment configuration. Slack reminders are not presented as completed automatic functionality. AI: Ask Shaper is an AI agent being developed exclusively for internal use by authorized members and administrators of the organization. It is intended to use Groq or OpenAI to interpret supported questions. The implementation is designed to obtain factual answers from authenticated, role-restricted server-side queries rather than allowing the model to invent figures. It is not yet ready to be presented as a fully working production feature.
Suggested 10-minute live demo
Show a MEMBER's task list and update, weekly hours and attendance; switch to ADMIN to assign a task, inspect records and analytics; show the six Google Calendar meeting series, role restrictions, leaderboard and (only if operational) Ask Shaper. Reserve time for questions.
