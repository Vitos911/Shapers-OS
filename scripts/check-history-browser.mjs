/** Local read-only acceptance; fixture responses never reach Supabase. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const origin = process.env.CHECK_APP_ORIGIN || "http://localhost:3230";
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const modulePath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const credentials = JSON.parse(await readFile(new URL("../.private/demo-credentials.json", import.meta.url), "utf8"));
const output = new URL("../test-results/history/", import.meta.url);
await mkdir(output, { recursive: true });
const checks = [];
const openView = async (page, view) => {
  await page.goto(`${origin}/#${view}`);
  await page.locator(`nav a[href="#${view}"][aria-current="page"]`).waitFor({ state: "attached" });
};
async function screenshot(page, name) {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: overflow at ${width}`);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, output)), fullPage: false });
  }
}
try {
  for (const [role, email] of [["MEMBER", "ziga.krajnc@sandbox.example"], ["ADMIN", "ana.kovac@sandbox.example"]]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    await context.route("**/api/org/**", (route) => route.request().method() === "GET" ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page.getByText("Demo prijava z osebnim geslom", { exact: true }).click();
    const credential = credentials.find((entry) => entry.email === email);
    assert.ok(credential);
    await page.getByLabel("Demo e-pošta").fill(credential.email);
    await page.getByLabel("Osebno geslo").fill(credential.password);
    const response = page.waitForResponse((r) => r.url() === `${origin}/api/org/snapshot` && r.status() === 200);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    const live = await (await response).json();
    assert.equal(live.identity.role, role);
    await page.locator("#org-main").waitFor();
    await openView(page, "hours");
    await page.getByText("Tedenska zgodovina ur in cilji", { exact: true }).click();
    await page.getByRole("heading", { name: "Zgodovina ur po tednih", exact: true }).waitFor();
    await screenshot(page, `${role.toLowerCase()}-live-hours`);
    await openView(page, "attendance");
    await page.getByLabel("Obdobje sestankov").selectOption("past");
    await screenshot(page, `${role.toLowerCase()}-live-attendance`);
    await openView(page, "tasks");
    if (live.tasks.length) {
      const summary = page.getByText("Podrobnosti in zgodovina", { exact: true }).first();
      await summary.focus(); await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "Activity Timeline · zgodovina naloge", exact: true }).first().waitFor();
      await screenshot(page, `${role.toLowerCase()}-live-timeline`);
    }
    checks.push(`${role}: real login, existing snapshot, weekly/attendance history and accessible task details; 390/768/1440`);

    // Simulated records are browser-only; existing live data remains unchanged.
    const fixture = structuredClone(live);
    const me = fixture.members.find((m) => m.id === fixture.identity.member_id);
    assert.ok(me);
    const other = { ...me, id: "11111111-1111-4111-8111-111111111111", name: "Other fixture member", auth_user_id: null };
    fixture.members = [me, other];
    const project = fixture.projects[0]; assert.ok(project);
    const task = { id: "22222222-2222-4222-8222-222222222222", project_id: project.id, title: "History browser fixture", description: "Existing task details", assignee_id: me.id, status: "todo", priority: "urgent", due_date: null, archived: false };
    fixture.tasks = [task];
    const created = { ...task, status: "todo", priority: "medium", due_date: null };
    const changed = { ...created, status: "in_progress", priority: "urgent", due_date: "2026-10-26", assignee_id: other.id };
    const done = { ...changed, status: "done" };
    const states = [[null, created], [created, changed], [changed, done], [done, task]];
    fixture.history = states.map(([before, after], i) => ({ id: String(i), task_id: task.id, member_id: me.id, actor_id: me.auth_user_id, actor_name: "Testna administratorka", occurred_at: `2026-10-24T1${i}:00:00Z`, old_status: before?.status ?? null, new_status: after.status, changes: { before, after } }));
    fixture.weeklyHours = [{ id: "aggregate", member_id: me.id, week_start: "2026-10-19", through_date: "2026-10-21", hours: 5, source: "Fixture" }];
    fixture.work = [{ id: "covered", member_id: me.id, date: "2026-10-20", hours: 5, project_id: project.id, deleted: false }, { id: "later", member_id: me.id, date: "2026-10-22", hours: 2.5, project_id: project.id, deleted: false }];
    fixture.meetings = ["present", "remote", "excused", "unexcused"].map((status, i) => ({ id: `m${i}`, title: `History ${status}`, starts_at: `2026-10-${20 + i}T12:00:00Z`, ends_at: `2026-10-${20 + i}T13:00:00Z`, series: i < 2 ? "Community" : "Grants", cancelled: false }));
    fixture.meetings.push({ ...fixture.meetings[0], id: "future", title: "Future fixture", starts_at: "2026-10-26T12:00:00Z", ends_at: "2026-10-26T13:00:00Z" });
    fixture.attendance = fixture.meetings.map((meeting, i) => ({ id: `a${i}`, meeting_id: meeting.id, member_id: me.id, status: ["present", "remote", "excused", "unexcused", "excused"][i], note: "Browser-only fixture" }));
    await context.unroute("**/api/org/**");
    await context.route("**/api/org/**", (route) => route.request().method() === "GET" && new URL(route.request().url()).pathname.endsWith("/snapshot") ? route.fulfill({ json: fixture }) : route.fulfill({ status: 405, json: { error: "No live writes permitted" } }));
    await openView(page, "tasks"); await page.reload();
    const summary = page.getByText("Podrobnosti in zgodovina", { exact: true });
    await summary.focus(); await page.keyboard.press("Enter");
    for (const text of ["Naloga ustvarjena", "Naloga zaključena", "Naloga ponovno odprta", "Spremembe naloge"]) await page.getByText(text, { exact: true }).waitFor();
    assert.equal(await page.getByText("Testna administratorka", { exact: false }).count(), 4);
    await screenshot(page, `${role.toLowerCase()}-fixture-timeline`);
    await openView(page, "hours");
    await page.getByLabel("Od", { exact: true }).fill("2026-10-19");
    await page.getByLabel("Do", { exact: true }).fill("2026-10-25");
    const region = page.getByRole("region", { name: "Tedenska zgodovina ur", exact: true });
    await region.getByText("Tedenska zgodovina ur in cilji", { exact: true }).click();
    assert.ok((await region.innerText()).includes("7,5 h"));
    const rowCount = await region.locator("tbody tr").count();
    assert.equal(rowCount, role === "MEMBER" ? 1 : 2);
    await screenshot(page, `${role.toLowerCase()}-fixture-hours`);
    await openView(page, "attendance");
    await page.getByLabel("Obdobje sestankov").selectOption("past");
    assert.equal(await page.locator("tbody tr").count(), 4);
    for (const status of ["present", "remote", "excused", "unexcused"]) assert.equal(await page.locator(`[data-status="${status}"]`).count(), 1);
    await page.getByLabel("Prisotnost od").fill("2026-10-21");
    await page.getByLabel("Prisotnost do").fill("2026-10-22");
    assert.equal(await page.locator("tbody tr").count(), 2);
    await page.getByLabel("Serija").selectOption("Grants");
    assert.equal(await page.locator("tbody tr").count(), 1);
    await screenshot(page, `${role.toLowerCase()}-fixture-attendance`);
    await page.getByLabel("Prisotnost od").fill("2026-10-25");
    await page.getByRole("alert").filter({ hasText: "Izberi veljavno obdobje prisotnosti." }).waitFor();
    checks.push(`${role}: timeline create/update/complete/reopen and actor/values; 7.5h deduplicated; all attendance statuses/date/series and invalid ranges`);
    if (role === "ADMIN") {
      fixture.identity.role = "SUPERADMIN";
      await openView(page, "hours"); await page.reload();
      const region = page.getByRole("region", { name: "Tedenska zgodovina ur", exact: true });
      await region.getByText("Tedenska zgodovina ur in cilji", { exact: true }).click();
      await page.getByLabel("Član").selectOption(me.id);
      await screenshot(page, "superadmin-fixture-hours");
      checks.push("SUPERADMIN: browser-only fixture; member-filtered weekly history, responsive rendering");
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(new URL("results.json", output), JSON.stringify({ checks, liveOrganizationWrites: 0 }, null, 2));
  console.log(JSON.stringify({ checks, liveOrganizationWrites: 0 }));
} finally { await browser.close(); }
