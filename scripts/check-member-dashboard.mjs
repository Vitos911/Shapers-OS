/** Optional local browser acceptance check. Reads existing sandbox credentials without logging them.
 * Live phase is read-only. Mutation phase intercepts every /api/org request in the browser;
 * its task/hour records exist only in this process and never reach Supabase.
 * PLAYWRIGHT_MODULE / BROWSER_EXECUTABLE may point to the host's bundled runtime.
 */
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { analytics, ljubljanaDate, weekStart, addDays } from "../lib/organization.ts";
import { weeklyStreak } from "../lib/weekly-streak.ts";

const origin = process.env.CHECK_APP_ORIGIN || "http://127.0.0.1:3210";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error("Only a local app is allowed.");
const modulePath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const credentials = JSON.parse(await readFile(new URL("../.private/demo-credentials.json", import.meta.url), "utf8"));
await mkdir(new URL("../test-results/dashboard/", import.meta.url), { recursive: true });
const checks = [];
async function visible(locator) { await locator.waitFor({ state: "visible" }); }
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Page overflows horizontally");
}
try {
  for (const [role, email] of [["MEMBER", "ziga.krajnc@sandbox.example"], ["ADMIN", "ana.kovac@sandbox.example"]]) {
    const credential = credentials.find((item) => item.email === email);
    assert.ok(credential, "Existing sandbox credential is required");
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
    // No live organization writes are permitted by this test.
    await context.route("**/api/org/**", (route) => route.request().method() === "GET" ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", () => errors.push("browser runtime error"));
    await page.goto(origin);
    await page.getByText("Demo prijava z osebnim geslom", { exact: true }).click();
    await page.getByLabel("Demo e-pošta").fill(credential.email);
    await page.getByLabel("Osebno geslo").fill(credential.password);
    const response = page.waitForResponse((r) => r.url() === `${origin}/api/org/snapshot` && r.status() === 200);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    const live = await (await response).json();
    assert.equal(live.identity.role, role);
    const me = live.members.find((member) => member.id === live.identity.member_id);
    assert.ok(me);
    await visible(page.getByRole("heading", { name: "Tvoj teden. Tvoj vpliv.", exact: true }));
    await visible(page.getByText(`Pozdravljen/a, ${me.name.split(" ")[0]}. Pregled nalog, ur in dogajanja v organizaciji.`, { exact: true }));
    const today = ljubljanaDate();
    const weekly = analytics(live, { from: weekStart(today), to: today, member: me.id }, today).weeklyHours;
    const format = (n) => new Intl.NumberFormat("sl-SI", { maximumFractionDigits: 2 }).format(n);
    assert.match(await page.locator("dl").innerText(), new RegExp(format(weekly).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const streakCard = page.getByRole("region", { name: "Weekly Streak", exact: true });
    await visible(streakCard);
    const streak = weeklyStreak(live);
    assert.ok(streak);
    assert.ok((await streakCard.innerText()).includes(`${streak.current}\nzaporednih`));
    assert.equal(await streakCard.getByRole("list", { name: "Zadnjih 6 tednov" }).getByRole("listitem").count(), 6);
    assert.equal(Number(await streakCard.getByRole("progressbar").getAttribute("value")), Math.min(100, streak.hours / streak.target * 100));
    assert.equal(await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: "Analitika", exact: true }).count(), role === "ADMIN" ? 1 : 0);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.evaluate(() => document.fonts.ready);
      await noOverflow(page);
      assert.equal(await page.evaluate(() => document.fonts.check('14px "Shapers Inter"')), true);
      await page.screenshot({ path: `test-results/dashboard/${role.toLowerCase()}-${width}.png`, fullPage: true });
      if (width <= 1000) {
        const trigger = page.getByRole("button", { name: "Odpri navigacijo" });
        await trigger.click();
        await visible(page.getByRole("navigation", { name: "Glavna navigacija" }));
        assert.equal(await trigger.getAttribute("aria-expanded"), "true");
        await page.keyboard.press("Shift+Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Odjava");
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Zapri navigacijo");
        await page.keyboard.press("Escape");
        assert.equal(await trigger.getAttribute("aria-expanded"), "false");
        assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
        await trigger.click();
        await page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: "Moje naloge", exact: true }).click();
        await visible(page.getByRole("heading", { name: "Moje naloge", exact: true }));
        await page.goto(origin);
        await visible(page.locator("#dashboard-welcome"));
      }
    }
    await page.getByRole("button", { name: "Beleži ure", exact: true }).click();
    await visible(page.getByRole("dialog"));
    await page.getByRole("button", { name: "Zapri obrazec" }).click();
    const refreshed = page.waitForResponse((r) => r.url() === `${origin}/api/org/snapshot` && r.status() === 200);
    await page.getByRole("button", { name: "Osveži podatke iz baze" }).click();
    assert.equal((await (await refreshed).json()).identity.member_id, me.id);
    await page.reload();
    await visible(page.locator("#dashboard-welcome"));
    for (const [link, heading] of [["Moje naloge", "Moje naloge"], ["Sestanki", "Sestanki"], ["Moja prisotnost", "Prisotnost"]]) {
      await page.getByRole("region", { name: "Hitri dostop" }).getByRole("link", { name: link, exact: true }).click();
      await visible(page.getByRole("heading", { name: heading, exact: true }));
      await page.goto(origin);
      await visible(page.locator("#dashboard-welcome"));
    }
    checks.push(`${role}: real login, snapshot, own hours, role navigation, reload; 390/768/1440; mobile focus trap/Escape/navigation; hours form opened`);

    if (role === "MEMBER") {
      await context.unroute("**/api/org/**");
      const fixture = structuredClone(live);
      const project = { id: "11111111-1111-4111-8111-111111111111", name: "Browser test project", description: "", status: "active" };
      fixture.projects = [project];
      fixture.tasks = [{ id: "22222222-2222-4222-8222-222222222222", project_id: project.id, title: "Browser test task", description: "", assignee_id: me.id, status: "todo", priority: "urgent", due_date: addDays(today, -1), archived: false }];
      fixture.work = [];
      fixture.weeklyHours = [];
      fixture.meetings = [];
      fixture.calendar = { configured: false, syncReady: false };
      let failMutation = false, failRead = false;
      const writes = [];
      await context.route("**/api/org/**", async (route) => {
        const request = route.request(), resource = new URL(request.url()).pathname.split("/").at(-1);
        if (request.method() === "GET" && resource === "snapshot") return route.fulfill({ status: failRead ? 503 : 200, json: failRead ? { error: "Browser test refresh failure" } : fixture });
        if (request.method() === "PATCH" && resource === "tasks") {
          const body = request.postDataJSON();
          writes.push(body);
          if (failMutation) return route.fulfill({ status: 403, json: { error: "Browser test denied" } });
          assert.deepEqual(Object.keys(body).sort(), ["id", "status"]);
          fixture.tasks[0].status = body.status;
          return route.fulfill({ json: fixture.tasks[0] });
        }
        if (request.method() === "POST" && resource === "work") {
          const body = request.postDataJSON();
          writes.push(body);
          assert.equal(body.hours, 1.25);
          assert.equal("member_id" in body, false);
          fixture.work.push({ ...body, id: "test-work", member_id: me.id, deleted: false });
          return route.fulfill({ status: 201, json: fixture.work.at(-1) });
        }
        return route.fulfill({ status: 500, json: { error: "Unhandled isolated browser test request" } });
      });
      await page.reload();
      await visible(page.getByRole("button", { name: "Zaključi nalogo: Browser test task" }));
      await visible(page.getByText(/Organizacijski Google koledar še ni povezan/));
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        await noOverflow(page);
        await page.screenshot({ path: `test-results/dashboard/isolated-populated-${width}.png`, fullPage: true });
      }
      const start = new Date(Date.now() + 86400000).toISOString();
      fixture.meetings = [{ id: "test-meeting", title: "Browser test meeting", starts_at: start, ends_at: new Date(Date.parse(start) + 3600000).toISOString(), series: "Community", cancelled: false, all_day: false }];
      fixture.attendance = [{ id: "test-attendance", meeting_id: "test-meeting", member_id: me.id, status: "remote" }];
      fixture.calendar.configured = true;
      await page.getByRole("button", { name: "Osveži podatke iz baze" }).click();
      await visible(page.getByRole("heading", { name: "Browser test meeting" }));
      await visible(page.getByText("Prisotnost: Na daljavo", { exact: true }));
      await page.screenshot({ path: "test-results/dashboard/isolated-meeting.png", fullPage: true });
      fixture.meetings = [];
      fixture.calendar.configured = false;
      failMutation = true;
      await page.getByRole("button", { name: "Zaključi nalogo: Browser test task" }).click();
      await visible(page.getByRole("alert").filter({ hasText: "Browser test denied" }));
      await visible(page.getByRole("button", { name: "Zaključi nalogo: Browser test task" }));
      failMutation = false;
      failRead = true;
      await page.getByRole("button", { name: "Zaključi nalogo: Browser test task" }).click();
      await visible(page.getByRole("alert").filter({ hasText: "Browser test refresh failure" }));
      assert.equal(await page.getByRole("status").filter({ hasText: "Sprememba je shranjena" }).count(), 0);
      failRead = false;
      await page.getByRole("button", { name: "Osveži podatke iz baze" }).click();
      await visible(page.getByRole("heading", { name: "Vse je urejeno." }));
      fixture.tasks[0].status = "todo";
      await page.getByRole("button", { name: "Osveži podatke iz baze" }).click();
      await visible(page.getByRole("button", { name: "Zaključi nalogo: Browser test task" }));
      await page.getByRole("button", { name: "Zaključi nalogo: Browser test task" }).click();
      await visible(page.getByRole("status").filter({ hasText: "Sprememba je shranjena" }));
      await visible(page.getByRole("heading", { name: "Vse je urejeno." }));
      await page.getByRole("button", { name: "Beleži ure", exact: true }).click();
      await page.getByRole("dialog").getByLabel("Ure", { exact: true }).fill("1.25");
      await page.getByRole("dialog").getByLabel("Opis", { exact: true }).fill("Isolated transport test, never stored in Supabase");
      await page.getByRole("dialog").getByRole("button", { name: /Shrani/ }).click();
      await visible(page.getByRole("status").filter({ hasText: "Sprememba je shranjena" }));
      assert.ok((await page.locator("dl").innerText()).includes("1,25"));
      await page.reload();
      await visible(page.locator("#dashboard-welcome"));
      assert.ok((await page.locator("dl").innerText()).includes("1,25"));
      assert.equal(writes.length, 4);
      assert.ok((await streakCard.innerText()).includes("1,25 /"), "Streak rereads hours after an isolated work submission");
      // All subsequent snapshots remain browser-only; no invented hours reach Supabase.
      const goal = weeklyStreak(fixture).target;
      const monday = weekStart(today);
      fixture.weeklyHours = Array.from({ length: 12 }, (_, i) => {
        const start = addDays(monday, -(i + 1) * 7);
        return { member_id: me.id, week_start: start, through_date: addDays(start, 6), hours: goal };
      });
      await page.getByRole("button", { name: "Osveži podatke iz baze" }).click();
      await visible(streakCard.locator('[data-achieved="true"]').nth(3));
      assert.equal(await streakCard.locator('[data-achieved="true"]').count(), 4);
      assert.ok((await streakCard.innerText()).includes("12\nzaporednih"));
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        await noOverflow(page);
        await page.screenshot({ path: `test-results/dashboard/streak-milestones-${width}.png`, fullPage: true });
      }
      fixture.work.push({ id: "streak-test-completion", member_id: me.id, date: today, hours: goal - 1.25, deleted: false });
      await page.getByRole("button", { name: "Osveži podatke iz baze" }).click();
      await visible(streakCard.getByText("Cilj tega tedna je dosežen.", { exact: true }));
      assert.ok((await streakCard.innerText()).includes("13\nzaporednih"));
      await page.reload();
      await visible(streakCard.getByText("Cilj tega tedna je dosežen.", { exact: true }));
      assert.equal(Number(await streakCard.getByRole("progressbar").getAttribute("value")), 100);
      failRead = true;
      await page.reload();
      await visible(page.getByRole("alert").filter({ hasText: "Browser test refresh failure" }));
      failRead = false;
      await page.getByRole("button", { name: "Poskusi znova" }).click();
      await visible(page.locator("#dashboard-welcome"));
      checks.push("ISOLATED transport: completion authorization error/success, refresh failure without false success, task PATCH allowlist, hours POST, reread/reload, empty disconnected calendar, meeting/attendance, initial-load retry; no live database mutations");
      checks.push("WEEKLY STREAK: real snapshot-derived total and six indicators; isolated hours reread/reload, unfinished 12-week run, four earned milestones, 13-week completion, responsive 390/768/1440");
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ status: "PASS", checks, notVerified: ["Live task completion and work-entry persistence", "Live shared Google Calendar", "Hosted Preview/Production login", "Independent developer review"] }, null, 2));
} finally { await browser.close(); }
