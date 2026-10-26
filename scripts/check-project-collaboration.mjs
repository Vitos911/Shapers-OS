/** Run only against a new, disposable local PostgreSQL database.
 * COLLABORATION_DATABASE_URL=postgres://postgres@127.0.0.1:55439/shapers_evolution_test
 * PG_MODULE can point to an externally installed pg module; no production dependency is needed.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
const url = new URL(
  process.env.COLLABORATION_DATABASE_URL ||
    "postgres://postgres@127.0.0.1:55439/shapers_evolution_test",
);
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    /^\/shapers_evolution_test(?:_[a-z0-9]+)?$/.test(url.pathname),
  "Only an isolated local test database is allowed",
);
const modulePath = process.env.PG_MODULE || "pg";
const pg = await import(
  isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath
);
const { Client } = pg.default || pg;
const connectionString = url.href;
const db = new Client({ connectionString });
await db.connect();
const clients = [];
try {
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from information_schema.tables where table_schema in ('public','auth')",
      )
    ).rows[0].n,
    0,
    "Database must be empty",
  );
  await db.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;
    create schema auth; grant usage on schema auth to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,banned_until timestamptz,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create table auth.identities(user_id uuid,provider text);
    create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin return; end $$;`);
  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrationDirectory)).filter(name => name.endsWith(".sql")).sort()) {
    await db.query(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  await db.query(
    await readFile(
      new URL("../supabase/tests/project_collaboration.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log(
    "PASS: migration, RLS, membership, privacy, history, hours and attendance scenarios",
  );
  const ids = {
    one: "11111111-1111-4111-8111-111111111111",
    two: "22222222-2222-4222-8222-222222222222",
    project: "33333333-3333-4333-8333-333333333333",
    task: "44444444-4444-4444-8444-444444444444",
  };
  for (const [key, id] of [
    ["one", ids.one],
    ["two", ids.two],
    ["admin", "55555555-5555-4555-8555-555555555555"],
  ]) {
    await db.query(
      "insert into public.members(id,name,email,tier,weekly_hours) values($1,$2,$3,'GO!',4)",
      [id, key, key + "@race.invalid"],
    );
    await db.query(
      "insert into org_private.access(email,role,member_id) values($1,$2,$3)",
      [key + "@race.invalid", key === "admin" ? "ADMIN" : "MEMBER", id],
    );
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [id, key + "@race.invalid"],
    );
  }
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: "55555555-5555-4555-8555-555555555555" }),
  ]);
  await db.query(
    "insert into public.org_projects(id,name,status,visibility,join_policy) values($1,'Race fixture','active','organization','open')",
    [ids.project],
  );
  await db.query(
    "insert into public.org_project_members(project_id,member_id) values($1,$2),($1,$3)",
    [ids.project, ids.one, ids.two],
  );
  const connect = async (id) => {
    const client = new Client({ connectionString });
    await client.connect();
    clients.push(client);
    await client.query("set role authenticated");
    await client.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: id }),
    ]);
    await client.query("set statement_timeout='10s'");
    return client;
  };
  const first = await connect(ids.one),
    second = await connect(ids.two);
  for (let i = 0; i < 10; i++) {
    await db.query(
      "insert into public.org_tasks(id,project_id,title,claimable) values($1,$2,'Concurrent claim',true) on conflict(id) do update set assignee_id=null,claimable=true,status='todo'",
      [ids.task, ids.project],
    );
    const results = await Promise.allSettled([
      first.query("select public.org_claim_task($1)", [ids.task]),
      second.query("select public.org_claim_task($1)", [ids.task]),
    ]);
    assert.equal(
      results.filter((r) => r.status === "fulfilled").length,
      1,
      "Exactly one claimant wins",
    );
    assert.equal(
      results.find((r) => r.status === "rejected").reason.code,
      "23514",
    );
    const row = (
      await db.query(
        "select assignee_id,claimable from public.org_tasks where id=$1",
        [ids.task],
      )
    ).rows[0];
    assert.ok([ids.one, ids.two].includes(row.assignee_id));
    assert.equal(row.claimable, false);
  }
  console.log(
    "PASS: 10 simultaneous claim races over two independent PostgreSQL sessions; one winner each",
  );
  // Hold a winning claim open while the member tries to leave from another session.
  await db.query(
    "update public.org_tasks set assignee_id=null,claimable=true,status='todo' where id=$1",
    [ids.task],
  );
  const sameMember = await connect(ids.one);
  await first.query("begin");
  await first.query("select public.org_claim_task($1)", [ids.task]);
  const leave = sameMember
    .query("select public.org_project_membership($1,'leave')", [ids.project])
    .then(
      () => ({ ok: true }),
      (e) => ({ code: e.code }),
    );
  await first.query("commit");
  assert.equal(
    (await leave).code,
    "23514",
    "Leave rechecks obligations after the winning claim commits",
  );
  console.log(
    "PASS: concurrent claim and leave preserve membership with outstanding obligations",
  );
} finally {
  for (const client of clients) await client.end();
  await db.end();
}
