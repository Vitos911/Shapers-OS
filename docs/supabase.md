# Supabase setup

Project: `ShapersOS` (`xdzofggamwoywxwdduio`).

## Environment

Create **ignored** `.env.local` with these two variables:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Use a modern `sb_publishable_` key. Never use a secret key or a service-role JWT. No key values are committed. `/api/supabase-config` supplies only the intentionally public publishable key and URL at runtime; no build-time credential is needed. Restart the server after setting its environment. For another host, set the same environment in that host's settings.

## Database

`supabase/migrations/` contains the schema and policies already applied to the named project. New projects must apply them in order through the Supabase CLI or SQL editor. Tables:

- `shapers_workspaces`: owner, name, versioned document, server revision and timestamps.
- `shapers_workspace_access`: explicitly allowed verified email addresses, with viewer/editor roles.

The document preserves the existing projects/members/events/hours/tasks format. Changes are atomic and use optimistic revision checks. Concurrent stale writes fail instead of overwriting newer work. Click **Osveži iz baze** to load other users' changes, then repeat a conflicted action. This initial implementation uses one document per workspace (maximum 5 MB), not per-row realtime subscriptions. It is suitable for small community workspaces; high-volume use should normalize the records.

All exposed tables use RLS. Anonymous access is revoked. Private helper functions check the caller's authenticated user ID and current, confirmed email in `auth.users`; neither user-editable metadata nor stale email claims grant access. Only owners manage the allowlist. Editor access permits document changes; viewer access is read-only. Ownership and server revision cannot be reassigned through column writes.

The pre-existing `public.rls_auto_enable()` event trigger has its public Data API execution grants revoked. Its DDL trigger behavior is unchanged.

## Login and sharing

1. Open the application and enter your email address to request a sign-in link.
2. Open the emailed link in your browser. New email accounts are confirmed through this flow.
3. Create or select a workspace.
4. In Settings, the owner can allow a collaborator's email address and choose viewer/editor. This does not send an invitation. The collaborator signs in separately and refreshes their space list.

Supabase's default mail service restricts recipients and rate limits. For people outside the Supabase organization, configure a custom SMTP provider in the Supabase dashboard. No SMTP credentials are part of this repository. The current integration keeps email verification enabled.

Auth Site URL is the exact Codespaces application origin. Allowed redirects include that origin with `/` and `http://localhost:3000/`. Add exact callback URLs for additional hosts before testing sign-in there.

Descriptive community member records do not create Auth accounts or grant access. Existing local data stays in localStorage. After login, choose **Prenesi lokalne podatke v Supabase** in Settings to transfer it explicitly, or import a JSON backup. Both operations request confirmation before replacing shared data. Local mode remains available explicitly.

## Verification

```bash
pnpm test
pnpm build
node --env-file=.env.local scripts/check-supabase.mjs
```

`supabase/tests/rls.sql` tests owner/editor/viewer/outsider/anonymous/unverified access, allowlist management, payload validation and stale revisions in a transaction. All test users and documents roll back. Run it with an administrative database connection; it does not bypass RLS for the assertions.

The live check verifies Auth reachability and anonymous denial using the publishable key. Neither the SQL test nor that check proves email delivery and a real browser sign-in; those require the user's confirmed email session.
