# Infrastructure and reproducible setup

Next.js App Router runs UI and Node route handlers. Supabase provides Auth and Postgres. Browser requests carry the current Auth access token; each organization request calls Auth `getUser()` and trusted `org_context()`. Regular operations use the user's token and RLS, not the service key. Service access is limited to explicit provisioning/imports, approved invitations and validated Google synchronization.

## Fresh checkout and empty Supabase database

1. Create/select a Supabase project you own. Do not reset the existing project or delete its members/workspaces. Install Node 22.18+, Corepack and pnpm 11.25.0. Clone this repository and run `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to untracked `.env.local`. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and server-only `SUPABASE_SECRET_KEY` from that project. Never prefix the latter with `NEXT_PUBLIC_`.
3. Initialize and link the CLI locally, then apply migrations. Commands prompt for your Supabase login/database credentials; do not put credentials in shell arguments or Git:

   ```bash
   pnpm dlx supabase init
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref YOUR_PROJECT_REF
   pnpm dlx supabase db push --dry-run
   pnpm dlx supabase db push
   ```

   Review the dry-run first. Migrations are ordered in `supabase/migrations/`: three original JSON workspace migrations, restored existing members migration, organization backend, provisioning, historical weekly hours, policy/index refinement. Never replay applied migrations manually. The restored members migration matches the existing project's recorded version.
4. Populate the supplied fictional members, preserving any existing normalized-email matches and UUIDs:

   ```bash
   node --env-file=.env.local scripts/seed-members.mjs
   node --env-file=.env.local scripts/seed-members.mjs --apply --allow-create
   ```

5. For a sandbox only, explicitly set `DEMO_AUTH_ENABLED=true` in local `.env.local`, then:

   ```bash
   node --env-file=.env.local scripts/provision-users.mjs --demo
   node --env-file=.env.local scripts/provision-users.mjs --demo --apply
   node --env-file=.env.local scripts/provision-users.mjs --demo --apply
   ```

   The second apply must create no extra accounts or password rotations. Credentials are written before account creation to `.private/demo-credentials.json`. Keep a protected backup: rerunning does not recover a lost existing password. Real addresses cannot use demo auto-confirmation. Set the opt-in back to false afterwards; it guards provisioning, not an authentication bypass.
6. Bootstrap only owner-approved real operator emails. Privately create `.private/superadmins.json` containing an explicit JSON array of those emails (no passwords), then:

   ```bash
   node --env-file=.env.local scripts/provision-users.mjs --bootstrap-file .private/superadmins.json
   node --env-file=.env.local scripts/provision-users.mjs --bootstrap-file .private/superadmins.json --apply
   ```

   This is a service-only, audited operation. It grants trusted access to configured verified-email operators without inventing member records. They must complete their own normal email verification. The running project has the three addresses explicitly selected by its owner, not an arbitrary first signup. Existing sandbox admins remain ADMIN. Never put real operator addresses in shared seed data for a different deployment.
7. Import hours (dry-run then apply). Repeat apply to check idempotency:

   ```bash
   node --env-file=.env.local scripts/import-sandbox.mjs --type weekly-hours --file supabase/seed/weekly-hours.json
   node --env-file=.env.local scripts/import-sandbox.mjs --type weekly-hours --file supabase/seed/weekly-hours.json --apply
   ```

   Other supported types: `projects`, `work`, `attendance`; JSON or CSV. Conflicts stop the plan before writes. An interrupted apply may have saved earlier rows; deterministic keys allow safe reruns. Existing corrections are never silently overwritten. A weekly total has explicit `week_start` and `through_date`; daily entries in its covered period are blocked to prevent double-counting. No source project names were available; none were synthesized.
8. Configure Google following [Google Calendar setup](google-calendar.md), then import pending attendance only after real meeting references exist. Missing IDs/multiple same-series dates produce conflicts, not guessed matches.
9. Configure Supabase Auth Site URL and exact redirect allowlist for your app origin; enable email/password for sandbox passwords and email links for real operators. Configure your own SMTP for production and enable leaked-password protection if supported by your plan. Restrict public registration/invitations as appropriate. Email verification alone does not create organization access.
10. Run the checks below, then deploy as a Node service or compatible Next.js host. Configure env vars in the host secret store, never the frontend build output. `pnpm build` then `pnpm start` serves port 3000 (or host `PORT`). HTTPS and a private sandbox deployment are recommended. No additional hosting service is provisioned automatically.

## Environment contract

| Variable | Purpose / exposure |
| --- | --- |
| `SUPABASE_URL` | Required; project URL, safe public configuration |
| `SUPABASE_PUBLISHABLE_KEY` | Required `sb_publishable_` key; safe for browser, protected by RLS |
| `SUPABASE_SECRET_KEY` | Server only; provisioning/imports/invites/Google reference sync; never returned by config API |
| `GOOGLE_CALENDAR_ID` | Calendar source; takes precedence over SUPERADMIN setting |
| `GOOGLE_CALENDAR_API_KEY` | Server-only public-calendar API access; restrict to Calendar API |
| `GOOGLE_CALENDAR_TIMEZONE` | Fixed deployment value `Europe/Ljubljana`; app/database enforce this zone, not arbitrary host time |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Alternative private-calendar JSON credential, single-line escaped JSON in dotenv; Reader access only |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Alternative private-calendar OAuth credentials, readonly Calendar events scope |
| `DEMO_AUTH_ENABLED` | Provisioning safety gate; true only when deliberately creating fictional demo accounts |
| `APP_URL` | Canonical origin for Google login; exact HTTPS origin in production |
| `AUTH_COOKIE_SECRET` | Independent random server-only secret (32+ characters) for temporary encrypted OAuth cookies |
| `CHECK_APP_ORIGIN` | Optional smoke-test origin, default `http://127.0.0.1:3000`; mutating smoke test rejects remote hosts |

Google needs one credential mechanism, not all three. Browser config returns only the Supabase URL and publishable key. The original JSON workspace API remains compatible at `/legacy`; organization imports are explicit, never inferred from legacy JSON. Existing legacy spaces were inspected and left untouched.

## Verification commands

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

In another terminal, with demo accounts provisioned:

```bash
node --env-file=.env.local scripts/check-organization.mjs
```

The smoke test creates uniquely identified temporary project/task/work records and cleans up only its own records; run on the designated sandbox, not an unrelated production tenant. Run `supabase/tests/organization_rls.sql` in Supabase SQL Editor as one transaction: all fixtures roll back, including Auth test users. GitHub CI runs tests, lint and a credential-free build; it does not mutate your database or prove hosted Google access. An empty-database deployment has instructions but has not been separately executed against another project.
