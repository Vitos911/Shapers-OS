/** Local, read-only browser QA. Credentials and screenshots remain ignored.
 * PLAYWRIGHT_MODULE can point to an existing Playwright installation.
 * Run with --before to capture the unchanged main branch before editing.
 */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const origin = process.env.CHECK_APP_ORIGIN || "http://localhost:3225";
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const modulePath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const credentials = JSON.parse(await readFile(new URL("../.private/demo-credentials.json", import.meta.url), "utf8"));
const phase = process.argv.includes("--before") ? "before" : "after";
const output = new URL(`../test-results/visual-polish/${phase}/`, import.meta.url);
await mkdir(output, { recursive: true });
const results = [];
const flowChecks = [];

try {
  for (const [role, email] of [["MEMBER", "ziga.krajnc@sandbox.example"], ["ADMIN", "ana.kovac@sandbox.example"]]) {
    const credential = credentials.find((entry) => entry.email === email);
    assert.ok(credential, "Existing sandbox credential required");
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    await context.route("**/api/org/**", (route) => route.request().method() === "GET" ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.getByText("Demo prijava z osebnim geslom", { exact: true }).click();
    await page.getByLabel("Demo e-pošta").fill(credential.email);
    await page.getByLabel("Osebno geslo").fill(credential.password);
    const response = page.waitForResponse((r) => r.url() === `${origin}/api/org/snapshot` && r.status() === 200);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    const snapshot = await (await response).json();
    assert.equal(snapshot.identity.role, role);
    await page.locator("#org-main").waitFor();
    await page.locator(".personal-calendar[aria-busy=false]").waitFor();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: fileURLToPath(new URL(`${role.toLowerCase()}-${width}.png`, output)), fullPage: true });
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      results.push({ role, width, ...dimensions });
      if (phase === "after") assert.ok(dimensions.scrollWidth <= width, `${role} overflows at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Zabeleži ure", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "Zapri obrazec" }).click();
    await page.reload();
    await page.locator("#org-main").waitFor();
    if (phase === "after") {
      for (const view of ["tasks", "hours", "meetings", "attendance", "projects", ...(role === "ADMIN" ? ["members", "analytics", "settings"] : [])]) {
        await page.goto(`${origin}/#${view}`);
        await page.locator("#org-main").waitFor();
        await page.locator(`nav a[href="#${view}"][aria-current="page"]`).waitFor();
        for (const width of [390, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("main > *, main > * > *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).map((el) => ({ tag: el.tagName, className: el.className, width: el.getBoundingClientRect().width })) }));
          if (overflow.scrollWidth > width) {
            console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].filter(el => el.scrollWidth > el.clientWidth + 5).map(el => ({ tag: el.tagName, className: el.className, client: el.clientWidth, scroll: el.scrollWidth, overflow: getComputedStyle(el).overflow, left: el.getBoundingClientRect().left })))));
            console.log(JSON.stringify({ role, view, ...overflow, outsideTable: await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => !el.closest("table") && el.getBoundingClientRect().right > innerWidth + 1).map((el) => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right, overflow: getComputedStyle(el).overflow }))) }));
            await page.screenshot({ path: fileURLToPath(new URL("overflow.png", output)), fullPage: true });
          }
          assert.ok(overflow.scrollWidth <= width, `${role} ${view} overflows at ${width}px`);
          if (["tasks", "analytics"].includes(view)) await page.screenshot({ path: fileURLToPath(new URL(`${role.toLowerCase()}-${view}-${width}.png`, output)), fullPage: true });
        }
      }
      await page.goto(`${origin}/#overview`);
      await page.locator('nav a[href="#overview"][aria-current="page"]').waitFor({ state: "attached" });
      await page.setViewportSize({ width: 390, height: 844 });
      const menu = page.getByRole("button", { name: "Odpri navigacijo" });
      await menu.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("navigation", { name: "Glavna navigacija" }).waitFor();
      const taskLink = page.getByRole("navigation").getByRole("link", { name: "Moje naloge", exact: true });
      await taskLink.focus();
      assert.equal(await taskLink.evaluate((el) => getComputedStyle(el).outlineStyle), "solid");
      await page.keyboard.press("Enter");
      await page.locator('nav a[href="#tasks"][aria-current="page"]').waitFor({ state: "attached" });
      const table = page.getByRole("region", { name: "Tabela podatkov — vodoravno pomikanje" }).first();
      await table.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.querySelector(".org-table-wrap")?.scrollLeft > 0);
      flowChecks.push(`${role}: live login, reload, responsive views, keyboard menu/focus, scrollable tables, hours dialog`);

      // Fixture responses exist only in this browser. Every organization request is
      // intercepted before exercising existing mutation handlers.
      await context.unroute("**/api/org/**");
      const fixture = structuredClone(snapshot);
      const me = fixture.members.find((entry) => entry.id === fixture.identity.member_id);
      assert.ok(me);
      const fixtureProject = fixture.projects[0] || { id: "11111111-1111-4111-8111-111111111111", name: "Isolated QA", description: "", status: "active" };
      fixture.projects = [fixtureProject];
      fixture.tasks = [{ id: "22222222-2222-4222-8222-222222222222", title: "Isolated visual QA task with a long title for wrapping", project_id: fixtureProject.id, assignee_id: me.id, status: "todo", priority: "urgent", due_date: "2026-10-26", archived: false }];
      let failRead = false;
      const writes = [];
      await context.route("**/api/org/**", async (route) => {
        const request = route.request();
        const resource = new URL(request.url()).pathname.split("/").at(-1);
        if (request.method() === "GET" && resource === "snapshot") return route.fulfill({ status: failRead ? 503 : 200, json: failRead ? { error: "Isolated QA refresh failure" } : fixture });
        if (request.method() === "GET" && resource === "access") return route.fulfill({ json: [{ email: "fixture@sandbox.example", role: "MEMBER", disabled: false, auth_user_id: me.auth_user_id, member_id: me.id }] });
        if (request.method() === "PATCH" && resource === "tasks") {
          const body = request.postDataJSON();
          writes.push({ resource, body });
          assert.equal(body.id, fixture.tasks[0].id);
          fixture.tasks[0].status = body.status;
          return route.fulfill({ json: fixture.tasks[0] });
        }
        if (request.method() === "POST" && resource === "work") {
          const body = request.postDataJSON();
          writes.push({ resource, body });
          assert.equal(body.hours, 1.25);
          fixture.work.push({ ...body, id: "33333333-3333-4333-8333-333333333333", member_id: me.id, deleted: false });
          return route.fulfill({ status: 201, json: fixture.work.at(-1) });
        }
        return route.fulfill({ status: 500, json: { error: "Unhandled isolated QA request" } });
      });
      await page.goto(`${origin}/#overview`);
      await page.reload();
      await page.getByText(fixture.tasks[0].title, { exact: true }).waitFor();
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: fileURLToPath(new URL(`${role.toLowerCase()}-populated-${width}.png`, output)), fullPage: true });
      }
      await page.getByRole("button", { name: "Zabeleži ure", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Dodaj delovne ure", exact: true });
      await dialog.waitFor();
      await dialog.getByLabel("Ure", { exact: true }).fill("1.25");
      await dialog.getByLabel("Opis", { exact: true }).fill("Isolated browser QA; no database write");
      const saved = page.waitForResponse((r) => r.url().endsWith("/api/org/work") && r.status() === 201);
      await dialog.getByRole("button", { name: "Shrani v Supabase", exact: true }).click();
      await saved;
      await dialog.waitFor({ state: "hidden" });
      await page.goto(`${origin}/#tasks`);
      const status = page.getByLabel(`Status: ${fixture.tasks[0].title}`);
      await status.selectOption("in_progress");
      await page.getByRole("status").filter({ hasText: "Sprememba je shranjena v Supabase." }).waitFor();
      assert.equal(writes.filter((entry) => entry.resource === "tasks").length, 1);
      assert.equal(fixture.tasks[0].status, "in_progress");
      await page.goto(`${origin}/#overview`);
      await page.getByRole("button", { name: "Zabeleži ure", exact: true }).click();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      fixture.tasks = [];
      fixture.meetings = [];
      await page.reload();
      await page.getByText("Trenutno nimaš odprtih dodeljenih nalog.", { exact: true }).waitFor();
      failRead = true;
      await page.getByRole("button", { name: "Osveži iz baze", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Isolated QA refresh failure" }).waitFor();
      failRead = false;
      flowChecks.push(`${role}: isolated populated/empty/error states, hours submission, task status change, Escape dismissal; no live writes`);

      if (role === "ADMIN") {
        fixture.identity.role = "SUPERADMIN";
        await page.goto(`${origin}/#settings`);
        await page.reload();
        await page.getByRole("button", { name: "Naloži dostope", exact: true }).click();
        await page.getByText("fixture@sandbox.example", { exact: true }).waitFor();
        for (const width of [390, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: fileURLToPath(new URL(`superadmin-fixture-${width}.png`, output)), fullPage: true });
        }
        flowChecks.push("SUPERADMIN: isolated role fixture only; settings, access controls and responsive table remain available");
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(new URL("results.json", output), JSON.stringify({ results, flowChecks }, null, 2));
  console.log(JSON.stringify({ phase, checks: results, flowChecks, runtimeErrors: 0, liveOrganizationWrites: 0 }));
} finally {
  await browser.close();
}
