/** Disposable PostgreSQL-engine tests; never connects to a hosted database. */
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const directory = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort();
const pending = new Set(["20261024144936", "20261025085526", "20261025102503", "20261025102948", "20261025120000", "20261025195203", "20261025195204", "20261026200312"]);
const signatures = [];
for (const path of ["fresh", "existing-production-order"]) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz,
        raw_user_meta_data jsonb, is_anonymous boolean default false, banned_until timestamptz);
      create table auth.identities(user_id uuid,provider text);
      create function auth.uid() returns uuid language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',
          nullif(current_setting('request.jwt.claim.sub',true),''))::uuid
      $$;
      grant usage on schema public,auth to authenticated,service_role,anon;
      grant execute on function auth.uid() to authenticated,service_role,anon;
      -- Platform helper referenced only by a REVOKE in the original hosted migration.
      -- No event trigger is installed: application migrations must enable RLS themselves.
      create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin return; end $$;
    `);
    const order = path === "fresh" ? files : [
      ...files.filter(name => !pending.has(name.slice(0,14))),
      ...files.filter(name => pending.has(name.slice(0,14))),
    ];
    for (const file of order) {
      try { await db.exec(await readFile(new URL(file, directory), "utf8")); }
      catch (error) { throw new Error(`${path}: ${file}: ${error.message}`, { cause: error }); }
    }
    const signature = await db.query(`select pg_get_functiondef('org_private.guard_changes()'::regprocedure) as guard,
      (select jsonb_agg(jsonb_build_object('name',policyname,'qual',qual,'check',with_check) order by policyname)
       from pg_policies where schemaname='public' and tablename='org_tasks') as task_policies`);
    signatures.push(signature.rows);
    for (const suite of ["history_audit.sql", "release_integration.sql", "leaderboard.sql", "leaderboard_v2.sql", "project_collaboration.sql"]) {
      try { await db.exec(await readFile(new URL(`../supabase/tests/${suite}`, import.meta.url), "utf8")); }
      catch (error) { throw new Error(`${path}: ${suite}: ${error.message}; ${error.where || ""}`, { cause: error }); }
    }
    const remaining = await db.query("select (select count(*) from auth.users)+(select count(*) from public.members)+(select count(*) from public.org_tasks) as count");
    assert.equal(Number(remaining.rows[0].count), 0, "All synthetic fixtures must roll back");
  } finally { await db.close(); }
}
assert.deepEqual(signatures[0], signatures[1], "Fresh and upgraded task policies/guards must agree");
console.log(JSON.stringify({ migrations: files.length, paths: ["fresh", "existing-production-order"],
  history: "PASS", taskPermissions: "PASS", attendanceImport: "PASS", leaderboard: "PASS", schemaParity: "PASS", rolledBack: true }));
