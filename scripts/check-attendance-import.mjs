/** Read-only acceptance against the existing sandbox accounts and imported source.
 * Start the local production app first. Never log credentials or response bodies.
 * All organization mutations are blocked in the browser; corrections use rollback SQL.
 */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { analytics, ljubljanaDate } from "../lib/organization.ts";
import { planImport } from "../lib/imports.ts";

const origin = process.env.CHECK_APP_ORIGIN || "http://127.0.0.1:3102";
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.equal(new URL(process.env.SUPABASE_URL).hostname, "xdzofggamwoywxwdduio.supabase.co");
const credentials = JSON.parse(await readFile(new URL("../.private/demo-credentials.json", import.meta.url), "utf8"));
const source = JSON.parse(await readFile(new URL("../supabase/seed/attendance-pending-calendar.json", import.meta.url), "utf8"));
const modulePath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const results = [];
await mkdir("test-results/attendance-import", { recursive: true });
const labels = { present: "Prisoten", remote: "Na daljavo", excused: "Opravičeno", unexcused: "Neopravičeno" };
try {
  assert.equal((await fetch(`${origin}/api/org/snapshot`)).status, 401);
  assert.equal((await fetch(`${origin}/legacy`)).status, 200);
  for (const [role, email] of [["MEMBER", "ziga.krajnc@sandbox.example"], ["ADMIN", "ana.kovac@sandbox.example"]]) {
    const credential = credentials.find((c) => c.email === email);
    assert.ok(credential);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.route("**/api/org/**", (route) => route.request().method() === "GET" ? route.continue() : route.abort());
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("pageerror", () => runtimeErrors.push("runtime error"));
    await page.goto(origin);
    await page.getByText("Demo prijava z osebnim geslom", { exact: true }).click();
    await page.getByLabel("Demo e-pošta").fill(credential.email);
    await page.getByLabel("Osebno geslo").fill(credential.password);
    const loaded = page.waitForResponse((r) => r.url() === `${origin}/api/org/snapshot` && r.status() === 200);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    const snapshot = await (await loaded).json();
    assert.equal(snapshot.identity.role, role);
    const own = snapshot.identity.member_id;
    const expectedSource = role === "MEMBER" ? source.filter((r) => r.email === email) : source;
    const plan = planImport("attendance", expectedSource, snapshot.members, snapshot.meetings);
    assert.deepEqual(plan.conflicts, []);
    assert.equal(plan.rows.length, expectedSource.length);
    assert.equal(new Set(snapshot.attendance.map((a) => `${a.meeting_id}/${a.member_id}`)).size, snapshot.attendance.length);
    for (const row of plan.rows) {
      const actual = snapshot.attendance.find((a) => a.meeting_id === row.meeting_id && a.member_id === row.member_id);
      assert.ok(actual, "Every source row appears in the role-scoped API");
      assert.equal(actual.status, row.status);
      assert.equal(actual.import_key, row.import_key);
    }
    if (role === "MEMBER") {
      assert.ok(snapshot.attendance.every((a) => a.member_id === own));
      assert.equal(snapshot.members.length, 1);
    } else {
      assert.equal(snapshot.members.length, 20);
      assert.equal(snapshot.attendance.filter((a) => a.import_key?.startsWith("sandbox:attendance:")).length, 258);
      const metric = analytics(snapshot, { from: "2026-09-14", to: "2026-10-23" });
      assert.ok(Math.abs(metric.attendanceRate - 220 / 232) < 1e-12);
      for (const series of new Set(source.map((r) => r.series))) {
        const subset = source.filter((r) => r.series === series);
        const present = subset.filter((r) => ["present", "remote"].includes(r.state)).length;
        const excused = subset.filter((r) => r.state === "excused").length;
        const filtered = { ...snapshot, meetings: snapshot.meetings.filter((e) => e.series === series) };
        assert.ok(Math.abs(analytics(filtered, { from: "2026-09-14", to: "2026-10-23" }).attendanceRate - present / (subset.length - excused)) < 1e-12, series);
      }
    }
    await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: "Prisotnost", exact: true }).click();
    await page.getByRole("heading", { name: "Prisotnost", exact: true }).waitFor();
    const rows = page.locator("tbody tr");
    assert.equal(await rows.count(), snapshot.attendance.length);
    assert.equal(await page.getByRole("button", { name: "Popravi", exact: true }).count(), role === "ADMIN" ? snapshot.attendance.length : 0);
    for (const [status, label] of Object.entries(labels)) {
      const count = snapshot.attendance.filter((a) => a.status === status).length;
      assert.equal(await page.locator(`.status-badge[data-status="${status}"]`).count(), count);
      if (count) assert.equal(await page.locator(`.status-badge[data-status="${status}"]`).first().innerText(), label);
    }
    assert.ok(!(await page.locator("tbody").innerText()).includes("Zgodovinski sestanek"), "Meeting titles and dates resolve");
    const seriesCounts = {};
    for (const series of new Set(expectedSource.map((r) => r.series))) {
      await page.getByRole("combobox", { name: /^Serija/ }).selectOption(series);
      const expected = snapshot.attendance.filter((a) => snapshot.meetings.find((e) => e.id === a.meeting_id)?.series === series).length;
      assert.equal(await rows.count(), expected);
      seriesCounts[series] = expected;
    }
    await page.getByRole("combobox", { name: /^Serija/ }).selectOption("");
    if (role === "ADMIN") {
      await page.getByRole("button", { name: "Popravi", exact: true }).first().click();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "Zapri obrazec", exact: true }).click();
      await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: "Analitika", exact: true }).click();
      await page.getByLabel("Od", { exact: true }).fill("2026-09-14");
      await page.getByLabel("Do", { exact: true }).fill("2026-10-23");
      const attendanceStat = page.locator(".stats-grid").getByText("Udeležba", { exact: true }).locator("..");
      assert.ok((await attendanceStat.innerText()).includes("94,83 %"));
      await page.screenshot({ path: "test-results/attendance-import/admin-analytics.png", fullPage: true });
      await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: "Prisotnost", exact: true }).click();
    }
    await page.reload();
    await page.getByRole("heading", { name: "Prisotnost", exact: true }).waitFor();
    assert.equal(await rows.count(), snapshot.attendance.length);
    await page.screenshot({ path: `test-results/attendance-import/${role.toLowerCase()}-attendance.png`, fullPage: true });
    assert.deepEqual(runtimeErrors, []);
    results.push({ role, sourceRows: plan.rows.length, visibleRows: snapshot.attendance.length, api: "PASS", privacy: "PASS", browser: "PASS", statuses: "PASS", reload: "PASS", seriesCounts });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile("test-results/attendance-import/results.json", JSON.stringify({ checkedAt: new Date().toISOString(), date: ljubljanaDate(), results, superadminBrowser: "NOT TESTED: no operator credentials", organizationWrites: 0 }, null, 2));
console.log(JSON.stringify(results, null, 2));
