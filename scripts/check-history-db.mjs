/** PostgreSQL engine check. No network or live database writes.
 * Supabase Auth's UID lookup is reproduced; real Auth/API integration is tested separately.
 */
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz, raw_user_meta_data jsonb, is_anonymous boolean default false, banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
  `);
  for (const file of ["20261024093558_organization_backend.sql", "20261024095435_historical_weekly_hours.sql", "20261025085526_history_audit_hardening.sql"]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  await db.exec(await readFile(new URL("../supabase/tests/history_audit.sql", import.meta.url), "utf8"));
  const remaining = await db.query("select (select count(*) from public.org_task_history)+(select count(*) from public.org_audit)+(select count(*) from auth.users) as count");
  if (Number(remaining.rows[0].count) !== 0) throw new Error("SQL fixtures were not rolled back");
  console.log(JSON.stringify({ engine: "local PGlite PostgreSQL", migration: "PASS", taskWrites: "PASS", immutableLogs: "PASS", roles: ["MEMBER", "ADMIN", "SUPERADMIN", "anon", "service_role"], rolledBack: true }));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, detail: error.detail, where: error.where }));
  process.exitCode = 1;
} finally {
  await db.close();
}
