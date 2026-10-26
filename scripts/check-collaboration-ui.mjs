/** Local browser acceptance with explicitly synthetic fixtures. No live account or database writes. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
const modulePath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(
  isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath
);
const origin = process.env.CHECK_APP_ORIGIN || "http://127.0.0.1:3220";
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const member = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  project = "33333333-3333-4333-8333-333333333333",
  task = "44444444-4444-4444-8444-444444444444";
const checks = [];
await mkdir("test-results/collaboration", { recursive: true });
try {
  for (const role of ["MEMBER", "ADMIN", "SUPERADMIN"]) {
    const user = {
      id: member,
      email: "fixture@example.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      app_metadata: {},
      user_metadata: {},
    };
    const s = {
      identity: { user_id: member, email: user.email, member_id: member, role },
      members: [
        {
          id: member,
          name: "Testni član",
          email: user.email,
          tier: "GO!",
          weekly_hours: 4,
          series: "Community",
          auth_user_id: member,
        },
        ...(role === "MEMBER"
          ? []
          : [
              {
                id: other,
                name: "Drugi član",
                email: "other@example.invalid",
                tier: "Impact",
                weekly_hours: 10,
                series: "Community",
                auth_user_id: other,
              },
            ]),
      ],
      projects: [
        {
          id: project,
          name: "Znanje za skupnost",
          description: "Skupaj pripravljamo brezplačne delavnice za mlade.",
          goal: "Izvedemo tri delavnice in vključimo 30 mladih.",
          status: "active",
          visibility: "organization",
          join_policy: "open",
          created_at: "2026-10-01",
          updated_at: "2026-10-25",
        },
      ],
      taskDirectory: [],
      tasks: [],
      work: [],
      weeklyHours: [],
      history: [],
      meetings: [],
      attendance: [],
      projectMembers: [],
      meetingMembers: [],
      projectDirectory: [],
      projectProgress: [{ project_id: project, total: 2, done: 1 }],
      joinRequests: [],
      membershipHistory: [],
      settings: {
        name: "Shapers OS",
        calendar_id: "",
        timezone: "Europe/Ljubljana",
      },
      calendar: { configured: false, syncReady: false },
    };
    const available = {
      id: task,
      project_id: project,
      title: "Pripravi gradivo za delavnico",
      description: "Pripravi kratek pregled učnih vsebin.",
      status: "todo",
      priority: "high",
      assignee_id: null,
      claimable: true,
      due_date: null,
      completed_at: null,
      archived: false,
    };
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      ({ user }) =>
        localStorage.setItem(
          "sb-collaboration-fixture-auth-token",
          JSON.stringify({
            user,
            access_token: "fixture-only-token",
            refresh_token: "fixture-only-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
          }),
        ),
      { user },
    );
    await context.route(
      "https://collaboration-fixture.supabase.co/**",
      (route) =>
        route.fulfill({
          json: route.request().url().includes("/auth/v1/user") ? user : [],
        }),
    );
    await context.route(`${origin}/api/supabase-config`, (route) =>
      route.fulfill({
        json: {
          configured: true,
          url: "https://collaboration-fixture.supabase.co",
          publishableKey: "sb_publishable_fixture",
        },
      }),
    );
    await context.route(`${origin}/api/personal-calendar`, (route) =>
      route.fulfill({ json: { connected: false, events: [] } }),
    );
    await context.route(`${origin}/api/org/**`, async (route) => {
      const resource = new URL(route.request().url()).pathname
        .split("/")
        .at(-1);
      if (resource === "snapshot") return route.fulfill({ json: s });
      if (resource === "work-timer") return route.fulfill({json: {server_now: new Date().toISOString(), sessions: [], work: []}});
      if (resource === "access") return route.fulfill({ json: [] });
      if (resource === "leaderboard")
        return route.fulfill({
          status: 503,
          json: {
            error: "Lestvica v tem izoliranem UI preizkusu nima podatkov.",
          },
        });
      const body = route.request().postDataJSON();
      if (resource === "membership" && body.action === "join") {
        s.projectMembers.push({ project_id: project, member_id: member });
        s.projectDirectory.push({
          project_id: project,
          member_id: member,
          name: "Testni član",
        });
        s.tasks = [structuredClone(available)];
      } else if (resource === "membership" && body.action === "leave") {
        s.projectMembers = [];
        s.projectDirectory = [];
        s.tasks = [];
      } else if (resource === "claim-task") {
        s.tasks[0].assignee_id = member;
        s.tasks[0].claimable = false;
      } else
        return route.fulfill({
          status: 400,
          json: { error: "Unexpected fixture mutation" },
        });
      await route.fulfill({ json: { saved: true } });
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page
      .getByRole("heading", { name: "Tvoj teden. Tvoj vpliv.", exact: true })
      .waitFor();
    assert.equal(
      await page.locator("aside").count(),
      0,
      "No permanent left sidebar",
    );
    const nav = page.getByRole("navigation", { name: "Glavna navigacija" });
    for (const label of [
      "Pregled",
      "Projekti",
      "Naloge",
      "Ure",
      "Sestanki",
      "Lestvica",
    ])
      assert.equal(
        await nav.getByRole("link", { name: label, exact: true }).count(),
        1,
      );
    await nav.getByLabel("Več pogledov").click();
    assert.equal(
      await nav.getByRole("link", { name: "Analitika", exact: true }).count(),
      role === "MEMBER" ? 0 : 1,
    );
    await nav.getByRole("link", { name: "Projekti", exact: true }).click();
    const card = page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", {
          name: "Znanje za skupnost",
          exact: true,
        }),
      });
    await card
      .getByRole("button", { name: "Pridruži se", exact: true })
      .click();
    await card
      .getByRole("button", { name: "Zapusti projekt", exact: true })
      .waitFor();
    assert.equal(
      await card.getByRole("progressbar").getAttribute("value"),
      "1",
    );
    if (role !== "MEMBER") {
      await card.getByRole("button", { name: "Uredi projekt" }).click();
      await page.getByRole("combobox", { name: /^Vidnost/ }).waitFor();
      await page.getByRole("button", { name: "Zapri obrazec" }).click();
    }
    await nav.getByRole("link", { name: "Naloge", exact: true }).click();
    await page
      .getByRole("button", { name: "Prevzemi nalogo", exact: true })
      .click();
    await page
      .getByText("Sprememba je shranjena v Supabase.", { exact: true })
      .waitFor();
    await nav.getByRole("link", { name: "Projekti", exact: true }).click();
    assert.equal(
      await card
        .getByRole("button", { name: "Zapusti projekt", exact: true })
        .isDisabled(),
      true,
    );
    await nav.getByRole("link", { name: "Pregled", exact: true }).click();
    await page
      .getByRole("region", { name: "Moji projekti", exact: true })
      .waitFor();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${role} width ${width} overflow`,
      );
      if (width <= 1000) {
        await page
          .getByRole("button", { name: "Odpri navigacijo", exact: true })
          .click();
        await nav.getByRole("link", { name: "Projekti", exact: true }).click();
        assert.equal(
          await page
            .getByRole("button", { name: "Odpri navigacijo", exact: true })
            .getAttribute("aria-expanded"),
          "false",
        );
        await page
          .getByRole("button", { name: "Odpri navigacijo", exact: true })
          .click();
        await page.keyboard.press("Escape");
        assert.equal(
          await page
            .getByRole("button", { name: "Odpri navigacijo", exact: true })
            .evaluate((el) => el === document.activeElement),
          true,
        );
      }
      await page.screenshot({
        path: `test-results/collaboration/${role.toLowerCase()}-${width}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    checks.push(
      `${role}: navigation, discovery, join, claim, handoff block, dialogs and 320/390/768/1440 geometry; isolated fixtures`,
    );
    await context.close();
  }
  await writeFile(
    "test-results/collaboration/results.json",
    JSON.stringify({ checks }, null, 2),
  );
  console.log(checks.join("\n"));
} finally {
  await browser.close();
}
