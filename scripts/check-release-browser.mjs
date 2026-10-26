/** Browser transport fixtures only. No hosted Auth, organization writes or AI calls. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { assembleLeaderboard } from "../lib/leaderboard-server.ts";
import { addDays, ljubljanaDate, weekStart } from "../lib/organization.ts";
import { spawn } from "node:child_process";

const origin = process.env.CHECK_APP_ORIGIN || "http://127.0.0.1:3245";
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const server = process.env.CHECK_APP_ORIGIN ? null : spawn(process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3245"],
  { stdio: "ignore", windowsHide: true });
process.on("exit", () => server?.kill());
let ready = false;
for (let attempt=0; attempt<100; attempt++) {
  try { ready = (await fetch(`${origin}/api/health`)).ok; } catch { /* startup */ }
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve,200));
}
assert.ok(ready,"Local production server must be ready");
const modulePath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(modulePath.includes(":") ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const output = new URL("../test-results/release/", import.meta.url);
await mkdir(output, { recursive: true });
const now = new Date(), today = ljubljanaDate(now), week = weekStart(today);
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const checks = [];
const widths = [375,768,1024,1440,1920];
try {
  for (const role of ["MEMBER", "ADMIN", "SUPERADMIN"]) {
    const identity = { user_id: uuid(1), member_id: uuid(2), email: "browser@fixture.invalid", role };
    const user = { id: identity.user_id, email: identity.email, aud: "authenticated", role: "authenticated", email_confirmed_at: now.toISOString(), created_at: now.toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [] };
    const member = { id: uuid(2), auth_user_id: user.id, name: "Browser Fixture", email: identity.email, tier: "Impact", weekly_hours: 10, series: "Community", is_admin: role !== "MEMBER" };
    const task = { id: uuid(4), project_id: uuid(3), title: "Release browser task", description: "Transport fixture only", assignee_id: member.id, priority: "high", status: "todo", due_date: today, archived: false, created_at: now.toISOString(), updated_at: now.toISOString(), completed_at: null };
    const snapshot = { identity, members: [member], projects: [{ id: uuid(3), name: "Browser fixture project", status: "active", description: "", archived: false, created_at: now.toISOString(), updated_at: now.toISOString() }], tasks: [task], work: [], weeklyHours: [], meetings: [], attendance: [],
      history: [{ id: uuid(5), task_id: task.id, member_id: member.id, actor_id: user.id, actor_name: member.name, old_status: null, new_status: "todo", occurred_at: now.toISOString(), changes: { before: null, after: { ...task } } }],
      projectMembers: [{ project_id: uuid(3), member_id: member.id }], taskDirectory: [{ id: member.id, name: member.name, project_id: uuid(3) }], meetingMembers: [], settings: { name: "Release fixture", timezone: "Europe/Ljubljana", calendar_id: "" }, calendar: { configured: false, syncReady: false } };
    const source = { ...snapshot, coverageStartedAt: addDays(week,-7)+"T00:00:00Z", eligibility: [] };
    const repository = { sourceAt: async () => source, readFinalized: async () => new Map(), finalize: async (_week, rows) => rows };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors = [], mutations = [];
    const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, aud: "authenticated" })).toString("base64url");
    const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, token_type: "bearer", refresh_token: "fixture", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user };
    await context.addInitScript(({session}) => localStorage.setItem("sb-fixture-auth-token", JSON.stringify(session)), { session });
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === "fixture.supabase.co") return route.fulfill({ json: url.pathname.startsWith("/rest/v1/") ? [] : url.pathname.endsWith("/user") ? user : session });
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/api/supabase-config") return route.fulfill({ json: { configured: true, url: "https://fixture.supabase.co", publishableKey: "sb_publishable_fixture" } });
      if (url.pathname === "/api/personal-calendar") return route.fulfill({ status: 503, json: { error: "Browser fixture: Calendar is not configured" } });
      if (url.pathname === "/api/ask-shaper") return route.fulfill({ status: 503, json: { error: "Browser fixture: AI is not configured" } });
      if (url.pathname === "/api/org/leaderboard") return route.fulfill({ json: await assembleLeaderboard(identity, week, now, repository) });
      if (url.pathname === "/api/org/snapshot") return route.fulfill({ json: snapshot });
      if (url.pathname === "/api/org/work-timer") return route.fulfill({ json: { server_now: new Date().toISOString(), sessions: [], work: snapshot.work } });
      if (url.pathname === "/api/org/work-audit") return route.fulfill({ json: [] });
      if (url.pathname === "/api/org/access" || url.pathname === "/api/org/audit") return route.fulfill({ json: [] });
      if (url.pathname.startsWith("/api/org/")) {
        const body = request.postDataJSON(); mutations.push({ path: url.pathname, body });
        if (url.pathname.endsWith("/tasks")) {
          assert.equal(body.expected_updated_at, task.updated_at);
          const before = { ...task }; Object.assign(task, body, { updated_at: new Date(Date.now()+1000).toISOString() });
          snapshot.history.push({ ...snapshot.history[0], id: uuid(7), old_status: before.status, new_status: task.status, changes: { before, after: { ...task } } });
        } else if (url.pathname.endsWith("/work")) snapshot.work.push({ ...body, id: uuid(6), member_id: member.id, deleted: false });
        else return route.fulfill({ status: 405, json: { error: "Fixture forbids this operation" } });
        return route.fulfill({ json: { saved: true } });
      }
      return route.continue();
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.stack || error.message));
    await page.goto(origin);
    await page.getByRole("heading", { name: "Tvoj teden. Tvoj vpliv." }).waitFor();
    await page.getByRole("button", { name: "Zaključi nalogo: Release browser task", exact: true }).click();
    await page.getByText("Sprememba je shranjena v Supabase.", { exact: true }).waitFor();
    assert.equal(task.status,"done");
    await page.reload();
    assert.equal(await page.getByRole("button", { name: "Zaključi nalogo: Release browser task", exact: true }).count(),0);
    await page.getByRole("button", { name: "Beleži ure", exact: true }).click();
    await page.getByRole("heading", { name: "Časovnik dela", exact: true }).waitFor();
    await page.waitForURL("**/#hours");
    if (role !== "MEMBER") await page.getByRole("button", { name: "Administrativni vnos za nazaj", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Administrativni vnos za nazaj", exact: true }).count(), role === "MEMBER" ? 0 : 1);
    if (role !== "MEMBER") {
      await page.getByRole("button", { name: "Administrativni vnos za nazaj", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Dodaj delovne ure" });
      await editor.getByLabel("Ure", { exact: true }).fill("1.5");
      await editor.getByLabel("Razlog administrativnega posega", { exact: true }).fill("Release transport fixture");
      await editor.getByRole("button", { name: "Shrani v Supabase", exact: true }).click();
      await editor.waitFor({ state: "hidden" });
      assert.equal(snapshot.work[0].hours,1.5);
    }
    for (const view of ["overview","tasks","projects","hours","meetings","attendance","profile","leaderboard","settings", ...(role === "MEMBER" ? [] : ["members","analytics"])]) {
      console.log(`Checking ${role}/${view}`);
      await page.goto(`${origin}/#${view}`);
      try { await page.locator("main").waitFor(); }
      catch(error) { console.error(JSON.stringify({role,view,errors,body:(await page.locator("body").innerText()).slice(0,1500)})); throw error; }
      if(view === "tasks") {
        await page.getByText("Podrobnosti in zgodovina", { exact:true }).click();
        await page.getByRole("heading", { name:"Activity Timeline · zgodovina naloge", exact:true }).waitFor();
      }
      for(const width of widths) {
        await page.setViewportSize({ width, height:1000 });
        await page.evaluate(() => window.scrollTo({top:0,behavior:"instant"}));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),`${role}/${view}/${width} overflow`);
        const dock=page.locator('.liquid-glass > header');
        const geometry=await dock.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{left:r.left,width:r.width,radius:parseFloat(s.borderRadius),filter:s.backdropFilter};});
        assert.ok(geometry.left>=10 && geometry.width<=width-20, 'Floating dock must have visible side margins');
        assert.ok(geometry.radius>=22,'Dock must retain its capsule material');
        if(width===375 || width===1440) await page.screenshot({path:fileURLToPath(new URL(`glass-${role.toLowerCase()}-${view}-${width}.png`,output)),fullPage:true});
      }
    }
    await page.goto(origin);
    await page.getByRole("button", { name:"Ask Shaper", exact:true }).click();
    const ai = page.getByRole("dialog", { name:"Ask Shaper", exact:true });
    await ai.getByLabel("Tvoje vprašanje", { exact:true }).fill("Koliko ur sem opravil?");
    await ai.getByRole("button", { name:"Vprašaj", exact:true }).click();
    await ai.getByRole("alert").filter({hasText:"AI is not configured"}).waitFor();
    await page.keyboard.press("Escape"); await ai.waitFor({state:"hidden"});
    assert.equal(await page.getByRole("button", { name:"Ask Shaper", exact:true }).evaluate(el=>el===document.activeElement),true);
    await page.setViewportSize({width:390,height:900});
    await page.getByRole("button", { name:"Odpri navigacijo", exact:true }).click();
    await page.getByRole("navigation", {name:"Glavna navigacija"}).waitFor();
    assert.equal(await page.getByRole("button", {name:"Zapri navigacijo",exact:true}).getAttribute("aria-expanded"),"true");
    await page.keyboard.press("Escape");
    await page.screenshot({path:fileURLToPath(new URL(`${role.toLowerCase()}-mobile.png`,output)),fullPage:false});
    assert.deepEqual(errors,[]);
    await page.goto(`${origin}/#overview`);await page.getByRole('heading',{name:'Časovnik dela',exact:true}).waitFor();
    await page.emulateMedia({contrast:'more',reducedMotion:'reduce'});
    const opaque=await page.locator('.glass-card').first().evaluate(el=>({color:getComputedStyle(el).backgroundColor,filter:getComputedStyle(el).backdropFilter}));
    assert.equal(opaque.color,'rgb(255, 255, 255)');assert.equal(opaque.filter,'none');
    await page.emulateMedia({contrast:'no-preference',reducedMotion:'reduce'});
    if(role==='MEMBER') {
      const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      const started=Date.now();await page.getByRole('button',{name:'Odpri navigacijo',exact:true}).click();await page.getByRole('navigation',{name:'Glavna navigacija'}).waitFor();await page.keyboard.press('Escape');
      checks.push({cpuThrottle:4,mobileDockInteractionMs:Date.now()-started,simulationOnly:true});await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();
    }
    checks.push({role,views:role==="MEMBER"?9:11,widths,increasedContrast:true,taskSaveReload:true,hoursNavigation:true,adminHoursSave:role!=="MEMBER",history:true,aiFailure:true,mobileKeyboard:true,fixtureMutations:mutations.length});
    await context.close();
  }
  await writeFile(new URL("results.json",output),JSON.stringify({checks,mode:"browser transport fixtures",hostedWrites:0},null,2));
  console.log(JSON.stringify({checks,mode:"browser transport fixtures",hostedWrites:0}));
} finally { await browser.close(); server?.kill(); }
