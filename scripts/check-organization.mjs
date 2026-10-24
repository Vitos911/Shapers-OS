import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { analytics, ljubljanaDate, weekStart } from "../lib/organization.ts";
const origin = process.env.CHECK_APP_ORIGIN || "http://127.0.0.1:3000";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error("This mutating smoke test only targets a local app.");
const credentials = JSON.parse(
  await readFile(
    new URL("../.private/demo-credentials.json", import.meta.url),
    "utf8",
  ),
);
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function signIn(email) {
  const credential = credentials.find((c) => c.email === email);
  if (!credential) throw new Error("Provision demo accounts first");
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const result = await client.auth.signInWithPassword(credential);
  if (result.error) throw new Error("Demo auth failed");
  return { client, token: result.data.session.access_token };
}
async function call(actor, resource, method = "GET", body, expected = 200) {
  const r = await fetch(origin + "/api/org/" + resource, {
    method,
    headers: {
      Authorization: "Bearer " + actor.token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.equal(r.status, expected, `${resource}: ${data.error || r.status}`);
  return data;
}
const a = await signIn("ana.kovac@sandbox.example"),
  m = await signIn("ziga.krajnc@sandbox.example"),
  run = "SMOKE " + randomUUID();
let project, task, entry;
try {
  assert.equal(
    (
      await fetch(origin + "/api/org/snapshot", {
        headers: { "x-user-id": "forged" },
      })
    ).status,
    401,
  );
  const own = await call(m, "snapshot"),
    organization = await call(a, "snapshot");
  assert.equal(own.identity.role, "MEMBER");
  assert.equal(own.members.length, 1);
  assert.equal(organization.identity.role, "ADMIN");
  assert.equal(organization.members.length, 20);
  assert.equal(organization.weeklyHours.length, 120);
  await call(
    m,
    "calendar",
    "POST",
    { from: "2026-02-30", to: "2026-03-10" },
    400,
  );
  await call(m, "calendar", "POST", { unexpected: true }, 400);
  if (!organization.calendar.configured)
    await call(m, "calendar", "POST", {}, 503);
  await call(
    a,
    "project-members",
    "POST",
    {
      project_id: "11111111-1111-4111-8111-111111111111",
      member_id: own.identity.member_id,
      role: "SUPERADMIN",
    },
    400,
  );
  await call(m, "access", "GET", undefined, 403);
  await call(a, "access", "GET", undefined, 403);
  await call(m, "profile", "PATCH", { name: "Not saved", is_admin: true }, 400);
  project = await call(
    a,
    "projects",
    "POST",
    { name: run, description: "Disposable smoke test", status: "active" },
    201,
  );
  await call(a, "project-members", "POST", {
    project_id: project.id,
    member_id: own.identity.member_id,
  });
  task = await call(
    a,
    "tasks",
    "POST",
    {
      project_id: project.id,
      title: run,
      assignee_id: own.identity.member_id,
      priority: "high",
      status: "todo",
    },
    201,
  );
  const assigned = await call(m, "snapshot");
  assert.ok(assigned.tasks.some((t) => t.id === task.id));
  await call(m, "tasks", "PATCH", { id: task.id, status: "done" });
  const completed = await call(m, "snapshot");
  assert.ok(
    completed.history.some(
      (h) => h.task_id === task.id && h.new_status === "done",
    ),
  );
  assert.ok(completed.tasks.find((t) => t.id === task.id).completed_at);
  await call(m, "tasks", "PATCH", { id: task.id, priority: "urgent" }, 403);
  entry = await call(
    m,
    "work",
    "POST",
    {
      date: ljubljanaDate(),
      hours: 1.25,
      project_id: project.id,
      description: run,
    },
    201,
  );
  const updated = await call(m, "snapshot");
  const before = analytics(own, { from: weekStart(), to: ljubljanaDate() }),
    after = analytics(updated, { from: weekStart(), to: ljubljanaDate() });
  assert.equal(after.weeklyHours - before.weeklyHours, 1.25);
  await call(m, "work", "PATCH", { id: entry.id, hours: 1.5 });
  const reloaded = await call(a, "snapshot");
  assert.equal(Number(reloaded.work.find((w) => w.id === entry.id).hours), 1.5);
  await call(m, "work", "POST", { date: "2026-10-20", hours: 1 }, 409);
  await call(
    m,
    "access",
    "PATCH",
    {
      email: m.email || "ziga.krajnc@sandbox.example",
      role: "SUPERADMIN",
      disabled: false,
    },
    403,
  );
  console.log(
    "PASS: real Auth sessions, API RBAC, assignment, status/history, hour writes/edits/reload, historical overlap rejection, and role escalation prevention.",
  );
  console.log(
    "SUPERADMIN live browser login and Google Calendar require the real operator/Google credentials; transaction-level role tests are separate.",
  );
} finally {
  // Delete only newly-created, unchanged smoke fixtures. Never touch sandbox source/import data.
  if (project) {
    const proof = await admin
      .from("org_projects")
      .select("name")
      .eq("id", project.id)
      .single();
    if (proof.error || proof.data.name !== run)
      throw new Error("Cleanup guard failed; no deletion performed");
    const ids = [project.id, task?.id, entry?.id].filter(Boolean);
    if (entry) {
      const r = await admin
        .from("org_work_entries")
        .delete()
        .eq("id", entry.id)
        .eq("description", run);
      if (r.error) throw new Error("Smoke work cleanup failed");
    }
    if (task) {
      const r = await admin
        .from("org_task_history")
        .delete()
        .eq("task_id", task.id);
      if (r.error) throw new Error("Smoke history cleanup failed");
      const d = await admin
        .from("org_tasks")
        .delete()
        .eq("id", task.id)
        .eq("title", run);
      if (d.error) throw new Error("Smoke task cleanup failed");
    }
    const pm = await admin
      .from("org_project_members")
      .delete()
      .eq("project_id", project.id);
    if (pm.error) throw new Error("Smoke membership cleanup failed");
    const p = await admin
      .from("org_projects")
      .delete()
      .eq("id", project.id)
      .eq("name", run);
    if (p.error) throw new Error("Smoke project cleanup failed");
    const audit = await admin
      .from("org_audit")
      .delete()
      .in("record_id", ids)
      .in("entity", ["org_projects", "org_tasks", "org_work_entries"]);
    if (audit.error) throw new Error("Smoke audit cleanup failed");
    console.log(
      "Temporary smoke fixtures removed; original members, hours and workspaces preserved.",
    );
  }
  await a.client.auth.signOut({ scope: "local" });
  await m.client.auth.signOut({ scope: "local" });
}
