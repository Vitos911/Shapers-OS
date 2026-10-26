import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = (
  await readFile(
    new URL("../app/api/org/[resource]/route.ts", import.meta.url),
    "utf8",
  )
).replaceAll(/"@\/lib\/([^"\n]+)"/g, (_, path) =>
  JSON.stringify(new URL(`../lib/${path}.ts`, import.meta.url).href),
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const route = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const one = "11111111-1111-4111-8111-111111111111",
  two = "22222222-2222-4222-8222-222222222222";
async function scenario(role, run, rpcError = null) {
  const fetcher = globalThis.fetch,
    previousUrl = process.env.SUPABASE_URL,
    previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://project-fixture.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === "/auth/v1/user")
      return Response.json({
        id: one,
        email: "fixture@example.invalid",
        email_confirmed_at: "2026-01-01",
        is_anonymous: false,
      });
    if (path.endsWith("/org_context"))
      return Response.json({
        user_id: one,
        member_id: one,
        email: "fixture@example.invalid",
        role,
      });
    if (path.endsWith("/org_work_state")) return Response.json({ server_now: new Date().toISOString(), sessions: [], work: [] });
    if (path.endsWith("/org_task_directory")) return Response.json([]);
    if (!path.includes("/rpc/")) return Response.json([]);
    calls.push({ path, body: JSON.parse(options.body || "null") });
    if (rpcError) return Response.json(rpcError, { status: 400 });
    return Response.json(path.endsWith("/org_claim_task") ? two : "joined");
  };
  const request = (resource, body, method = "POST") =>
    route[method](
      new Request(`http://localhost/api/org/${resource}`, {
        method,
        headers: { Authorization: "Bearer fixture" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ resource }) },
    );
  try {
    await run(request, calls);
  } finally {
    globalThis.fetch = fetcher;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
}
test("membership endpoint binds MEMBER joins to caller and rejects forged identities/actions before RPC", async () => {
  await scenario("MEMBER", async (request, calls) => {
    const ok = await request("membership", { project_id: two, action: "join" });
    assert.equal(ok.status, 200);
    assert.deepEqual(calls[0].body, {
      p_project: two,
      p_action: "join",
      p_member: null,
    });
    assert.equal(
      (
        await request("membership", {
          project_id: two,
          member_id: one,
          action: "join",
        })
      ).status,
      403,
    );
    assert.equal(
      (await request("membership", { project_id: two, action: "approve" }))
        .status,
      403,
    );
    assert.equal(
      (
        await request("membership", {
          project_id: two,
          action: "join",
          role: "ADMIN",
        })
      ).status,
      400,
    );
    assert.equal(
      (await request("membership", { project_id: "bad", action: "leave" }))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "membership",
          { project_id: two, action: "join" },
          "PATCH",
        )
      ).status,
      400,
    );
    assert.equal(calls.length, 1);
  });
});
test("an unmigrated database keeps the existing snapshot available with explicit collaboration readiness", async () => {
  await scenario(
    "MEMBER",
    async () => {
      const result = await route.GET(
        new Request("http://localhost/api/org/snapshot", {
          headers: { Authorization: "Bearer fixture" },
        }),
        { params: Promise.resolve({ resource: "snapshot" }) },
      );
      assert.equal(result.status, 200);
      const snapshot = await result.json();
      assert.equal(snapshot.collaboration.ready, false);
      assert.deepEqual(snapshot.projects, []);
      assert.deepEqual(snapshot.membershipHistory, []);
    },
    { code: "PGRST202", message: "Function not in schema cache" },
  );
});
test("ADMIN and SUPERADMIN approve requests; legacy membership API routes through atomic RPC", async () => {
  for (const role of ["ADMIN", "SUPERADMIN"])
    await scenario(role, async (request, calls) => {
      assert.equal(
        (
          await request("membership", {
            project_id: two,
            member_id: one,
            action: "approve",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request("project-members", {
            project_id: two,
            member_id: one,
            remove: true,
          })
        ).status,
        200,
      );
      assert.deepEqual(
        calls.map((c) => c.body.p_action),
        ["approve", "remove"],
      );
      assert.ok(calls.every((c) => c.path.endsWith("/org_project_membership")));
    });
});
test("task claim endpoint sends only validated task ID and translates competing claim into 409", async () => {
  await scenario("MEMBER", async (request, calls) => {
    assert.equal((await request("claim-task", { task_id: two })).status, 200);
    assert.deepEqual(calls[0].body, { p_task: two });
    assert.equal(
      (await request("claim-task", { task_id: two, assignee_id: one })).status,
      400,
    );
    assert.equal((await request("claim-task", { task_id: "bad" })).status, 400);
    assert.equal(calls.length, 1);
  });
  await scenario(
    "MEMBER",
    async (request) => {
      assert.equal((await request("claim-task", { task_id: two })).status, 409);
    },
    { code: "23514", message: "Internal constraint detail must not leak" },
  );
  await scenario(
    "MEMBER",
    async (request) => {
      const response = await request("claim-task", { task_id: two });
      assert.equal(response.status, 403);
      assert.ok(!(await response.text()).includes("Internal"));
    },
    { code: "42501", message: "Internal private project title" },
  );
});
