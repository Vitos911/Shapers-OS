/** Local production browser + HTTP acceptance. Live organization activity writes
 * are blocked. Synthetic score states are intercepted exclusively in the browser.
 * Never log credentials, sessions, private source rows or response bodies.
 */
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

const origin = process.env.CHECK_APP_ORIGIN || "http://127.0.0.1:3212";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error("Local app required");
const modulePath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const credentials = JSON.parse(await readFile(new URL("../.private/demo-credentials.json", import.meta.url), "utf8"));
await mkdir(new URL("../test-results/leaderboard/", import.meta.url), { recursive: true });
const visible = (locator) => locator.waitFor({ state: "visible" });
const noOverflow = async (page) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "horizontal overflow");
const checks = [];
try {
  for (const [role, email] of [["MEMBER", "ziga.krajnc@sandbox.example"], ["ADMIN", "ana.kovac@sandbox.example"]]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
    await context.route("**/api/org/**", (route) => route.request().method() === "GET" ? route.continue() : route.abort());
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("pageerror", () => runtimeErrors.push("runtime error"));
    await page.goto(origin);
    const credential = credentials.find((item) => item.email === email);
    assert.ok(credential);
    await page.getByText("Demo prijava z osebnim geslom", { exact: true }).click();
    await page.getByLabel("Demo e-pošta").fill(credential.email);
    await page.getByLabel("Osebno geslo").fill(credential.password);
    const snapshotPromise = page.waitForResponse((r) => r.url().endsWith("/api/org/snapshot") && r.status() === 200);
    const rankingPromise = page.waitForResponse((r) => r.url().includes("/api/org/leaderboard?") && r.status() === 200);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    const snapshotResponse = await snapshotPromise;
    const snapshot = await snapshotResponse.json();
    const identity = snapshot.identity;
    assert.equal(identity.role, role);
    const rankingResponse = await rankingPromise;
    const live = await rankingResponse.json();
    assert.equal(live.status, "provisional");
    assert.ok(live.rows.length >= 20, "all members ranked, including for MEMBER");
    assert.match(rankingResponse.headers()["cache-control"], /no-store/);
    for (const row of live.rows) {
      assert.equal(typeof row.score, "number");
      assert.ok(row.score >= 0 && row.score <= 100);
      assert.equal(!!row.metrics, role === "ADMIN" || row.memberId === identity.member_id);
      assert.deepEqual(Object.keys(row).sort(), ["memberId", "name", "tier", "score", "rank", "summary", ...(row.metrics ? ["metrics"] : [])].sort());
    }
    assert.equal(new Set(live.achievements.map((badge) => badge.id)).size, 9);
    assert.equal(!!live.trends, role === "ADMIN");
    const authHeaders = { Authorization: snapshotResponse.request().headers().authorization };
    assert.equal((await page.request.get(`${origin}/api/org/leaderboard`)).status(), 401);
    assert.equal((await page.request.get(`${origin}/api/org/leaderboard?week=2026-10-20`, { headers: authHeaders })).status(), 400);
    assert.equal((await page.request.get(`${origin}/api/org/leaderboard?member_id=foreign`, { headers: authHeaders })).status(), 400);
    for (const query of ["period=bad", "period=all&week=2026-10-19", "period=month&period=all"]) assert.equal((await page.request.get(`${origin}/api/org/leaderboard?${query}`, { headers: authHeaders })).status(), 400);
    assert.equal((await page.request.post(`${origin}/api/org/leaderboard`, { headers: authHeaders, data: { score: 100 } })).status(), 405);
    const config = await (await page.request.get(`${origin}/api/supabase-config`)).json();
    const dbHeaders = { ...authHeaders, apikey: config.publishableKey };
    assert.ok((await page.request.post(`${config.url}/rest/v1/rpc/org_leaderboard_source`, { headers: dbHeaders, data: {} })).status() >= 400, "private source RPC denied directly");
    assert.ok((await page.request.get(`${config.url}/rest/v1/org_leaderboard_weeks?select=*`, { headers: dbHeaders })).status() >= 400, "private cached breakdowns denied directly");
    await visible(page.getByRole("heading", { name: "Weekly Streak", exact: true }));
    await visible(page.getByRole("link", { name: "Celotna lestvica", exact: true }));
    await page.getByRole("link", { name: "Celotna lestvica", exact: true }).click();
    await visible(page.getByRole("table"));
    assert.equal(await page.getByRole("list", { name: "Najboljši trije" }).getByRole("listitem").count(), 3);
    assert.equal(await page.locator("tbody tr").count(), live.rows.length);
    assert.equal(await page.locator('tbody tr[data-own="true"]').count(), 1);
    await visible(page.getByRole("region", { name: /^Razčlenitev:/ }));
    assert.equal(await page.getByLabel("Podrobnosti člana", { exact: true }).count(), role === "ADMIN" ? 1 : 0);
    if (role === "ADMIN") {
      const other = live.rows.find((row) => row.memberId !== identity.member_id);
      await page.getByLabel("Podrobnosti člana", { exact: true }).selectOption(other.memberId);
      await visible(page.getByRole("region", { name: `Razčlenitev: ${other.name}`, exact: true }));
    }
    for (const tier of ["GO!", "Impact", "Core"]) {
      await page.getByLabel("Članski nivo", { exact: true }).selectOption(tier);
      assert.equal(await page.locator("tbody tr").count(), live.rows.filter((row) => row.tier === tier).length);
    }
    await page.getByLabel("Članski nivo", { exact: true }).selectOption("");
    await visible(page.getByRole("region", { name: "Moja uspešnost", exact: true }));
    assert.equal(await page.getByRole("region", { name: "Administratorska analitika", exact: true }).count(), role === "ADMIN" ? 1 : 0);
    await page.getByLabel("Poišči člana", { exact: true }).fill(live.rows[0].name);
    assert.equal(await page.locator("tbody tr").count(), 1);
    await page.getByLabel("Poišči člana", { exact: true }).fill("");
    await page.getByLabel("Razvrsti po", { exact: true }).selectOption("name");
    const cells = await page.locator("tbody th").allTextContents();
    const expectedNames = [...live.rows].sort((a, b) => a.name.localeCompare(b.name, "sl")).map((r) => r.name);
    assert.ok(cells.every((text, i) => text.includes(expectedNames[i])), "member sorting follows Slovenian name order");
    await page.getByLabel("Razvrsti po", { exact: true }).selectOption("rank");
    for (const period of ["month", "all"]) {
      const result = page.waitForResponse((r) => r.url().endsWith(`leaderboard?period=${period}`) && r.status() === 200);
      await page.getByLabel("Obdobje", { exact: true }).selectOption(period);
      assert.equal((await (await result).json()).period, period);
      await visible(page.getByRole("table"));
    }
    await page.getByLabel("Obdobje", { exact: true }).selectOption("current");
    await visible(page.getByRole("table"));
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.evaluate(() => document.fonts.ready);
      await noOverflow(page);
      if (width === 390) {
        await visible(page.getByRole("list", { name: "Lestvica članov", exact: true }));
        assert.equal(await page.getByRole("table").isVisible(), false);
        assert.equal(await page.getByRole("list", { name: "Lestvica članov", exact: true }).getByRole("listitem").count(), live.rows.length);
        await page.screenshot({ path: `test-results/leaderboard/${role.toLowerCase()}-mobile-top.png` });
        await page.getByRole("list", { name: "Lestvica članov", exact: true }).getByRole("listitem").first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/leaderboard/${role.toLowerCase()}-mobile-cards.png` });
      }
      await page.screenshot({ path: `test-results/leaderboard/${role.toLowerCase()}-${width}.png`, fullPage: true });
    }
    await page.getByLabel("Obdobje", { exact: true }).selectOption("previous");
    await visible(page.getByText(/Za ta teden ni zanesljive evidence/));
    assert.equal(await page.getByRole("table").count(), 0);
    await page.getByLabel("Obdobje", { exact: true }).selectOption("history");
    await page.getByLabel("Ponedeljek tedna", { exact: true }).fill("2026-09-14");
    await visible(page.getByText(/Za ta teden ni zanesljive evidence/));
    await page.goto(origin + "/#profile");
    await visible(page.getByRole("heading", { name: "Dosežki in vztrajnost", exact: true }));
    await visible(page.getByRole("region", { name: "Moji dosežki", exact: true }));
    if (role === "MEMBER") {
      let fail = false, empty = false;
      const fixture = structuredClone(live);
      await context.route("**/api/org/leaderboard?*", (route) => {
        const week = new URL(route.request().url()).searchParams.get("week");
        const rows = empty ? [] : fixture.rows;
        return route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: "Isolated leaderboard read failure" } : { ...fixture, week, status: week === fixture.currentWeek ? "provisional" : "final", rows } });
      });
      await page.goto(origin + "/#leaderboard");
      await visible(page.getByRole("table"));
      await page.getByLabel("Obdobje", { exact: true }).selectOption("previous");
      await visible(page.getByText("Zaključeni rezultat", { exact: true }));
      await visible(page.getByRole("table"));
      empty = true;
      await page.getByLabel("Obdobje", { exact: true }).selectOption("current");
      await visible(page.getByText("V izbranem filtru ni članov.", { exact: true }));
      fail = true;
      await page.getByLabel("Obdobje", { exact: true }).selectOption("previous");
      await visible(page.getByRole("alert").filter({ hasText: "Isolated leaderboard read failure" }));
      assert.equal(await page.getByRole("table").count(), 0);
      fail = false; empty = false;
      await page.getByRole("button", { name: "Poskusi znova naložiti lestvico", exact: true }).click();
      await visible(page.getByRole("table"));
      fixture.change = 12.5;
      fixture.previousComparable = true;
      fixture.achievements.forEach((badge) => { badge.achieved = true; badge.progress = badge.target; });
      await page.goto(origin);
      await visible(page.getByText("+12,5 točk", { exact: true }));
      assert.equal(await page.locator('section[aria-label="Moji dosežki"] li[data-earned="true"]').count(), 9);
      await noOverflow(page);
      await page.screenshot({ path: "test-results/leaderboard/isolated-widget-achievements.png", fullPage: true });
      await page.reload();
      await visible(page.getByText("+12,5 točk", { exact: true }));
      checks.push("ISOLATED: completed-week display, empty/error/retry, earned badges, comparable delta, widget reload; no synthetic activity reaches Supabase");
    }
    assert.deepEqual(runtimeErrors, []);
    checks.push(`${role}: authenticated API, role-shaped payload, direct private-data denial, score-write denial, top 3/full ranking, tier/period filters, own highlight, breakdown permissions, profile achievements; 390/768/1440`);
    await context.close();
  }
  console.log(JSON.stringify({ status: "PASS", checks, notVerified: ["Hosted deployment", "Live Google Calendar", "Actual future week rollover (covered by deterministic and SQL regressions)"] }, null, 2));
} finally { await browser.close(); }
