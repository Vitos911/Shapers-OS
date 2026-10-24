import test from "node:test";
import assert from "node:assert/strict";
import {
  personalCalendar,
  disconnectPersonalCalendar,
  personalEvent,
} from "../lib/personal-calendar.ts";
import { seal, cookie, unseal } from "../lib/google-auth.ts";
import { HttpError } from "../lib/org-server.ts";
const origin = "http://localhost:3000",
  name = "shapers-google-calendar";
const env = {
  AUTH_COOKIE_SECRET: "fixture-calendar-only-more-than-32-characters",
};
const identity = {
  user_id: "alice",
  email: "alice@fixture.invalid",
  role: "MEMBER",
  member_id: null,
};
const auth = async () => ({ identity });
const grant = () => ({
  userId: "alice",
  accessToken: "fixture-google-access",
  refreshToken: "fixture-google-refresh",
  accessExpires: Date.now() + 300000,
  expires: Date.now() + 86400000,
});
const request = (value = grant(), method = "POST", site = origin) =>
  new Request(
    origin + "/api/personal-calendar?user_id=bob&calendar_id=another",
    {
      method,
      headers: {
        origin: site,
        authorization: "Bearer fixture-supabase",
        cookie: value
          ? cookie(name, seal(value, env), origin, 86400).split(";")[0]
          : "",
      },
    },
  );
const event = {
  id: "meeting-1",
  summary: "My private meeting",
  start: { dateTime: "2026-10-27T10:00:00+01:00" },
  end: { dateTime: "2026-10-27T11:00:00+01:00" },
  htmlLink: "https://calendar.google.com/event?eid=fixture",
  hangoutLink: "https://meet.google.com/fixture",
  description: "must not be returned",
};

test("only verified organization identity can read its own grant, regardless of member/admin/superadmin role", async () => {
  for (const role of ["MEMBER", "ADMIN", "SUPERADMIN"]) {
    let called = false;
    const response = await personalCalendar(
      request({ ...grant(), userId: "bob" }),
      env,
      async () => ({ identity: { ...identity, role } }),
      async () => {
        called = true;
        throw new Error();
      },
    );
    assert.equal((await response.json()).connected, false);
    assert.equal(called, false);
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  }
  for (const status of [401, 403]) {
    const response = await personalCalendar(
      request(),
      env,
      async () => {
        throw new HttpError(status, "denied");
      },
      async () => {
        throw new Error("must not fetch");
      },
    );
    assert.equal(response.status, status);
  }
});
test("calendar rejects cross-site requests before authentication or Google reads", async () => {
  const response = await personalCalendar(
    request(grant(), "POST", "https://evil.example"),
    env,
    async () => {
      throw new Error("must not authenticate");
    },
  );
  assert.equal(response.status, 403);
});
test("tampered, missing and expired credentials disconnect without Google fetch", async () => {
  for (const value of [null, { ...grant(), expires: Date.now() - 1 }]) {
    const response = await personalCalendar(
      request(value),
      env,
      auth,
      async () => {
        throw new Error("must not fetch");
      },
    );
    assert.equal((await response.json()).connected, false);
  }
  const r = request();
  r.headers.set("cookie", name + "=tampered");
  assert.equal(
    (await (await personalCalendar(r, env, auth)).json()).connected,
    false,
  );
});
test("private primary calendar expands recurrences, paginates, hides declined/cancelled events, never returns tokens", async () => {
  let calls = 0;
  const response = await personalCalendar(
    request(),
    env,
    auth,
    async (url, options) => {
      calls++;
      assert.equal(url.origin, "https://www.googleapis.com");
      assert.equal(url.pathname, "/calendar/v3/calendars/primary/events");
      assert.equal(url.searchParams.get("singleEvents"), "true");
      assert.equal(url.searchParams.get("orderBy"), "startTime");
      assert.equal(url.searchParams.get("timeZone"), "Europe/Ljubljana");
      assert.equal(
        options.headers.Authorization,
        "Bearer fixture-google-access",
      );
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      return Response.json(
        calls === 1
          ? {
              items: [
                event,
                { ...event, id: "cancelled", status: "cancelled" },
                {
                  ...event,
                  id: "declined",
                  attendees: [{ self: true, responseStatus: "declined" }],
                },
              ],
              nextPageToken: "page-2",
            }
          : {
              items: [
                {
                  id: "all-day",
                  start: { date: "2026-11-01" },
                  end: { date: "2026-11-03" },
                },
                event,
              ],
            },
      );
    },
  );
  assert.equal(calls, 2);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const text = await response.text(),
    data = JSON.parse(text);
  assert.equal(data.connected, true);
  assert.equal(data.events.length, 2);
  assert.equal(data.events[1].allDay, true);
  assert.equal(data.events[1].end, "2026-11-03");
  assert.ok(!text.includes("fixture-google"));
  assert.ok(!text.includes("must not be returned"));
});
test("empty calendar is a successful connection, errors never masquerade as no events", async () => {
  const empty = await personalCalendar(request(), env, auth, async () =>
    Response.json({}),
  );
  assert.equal((await empty.json()).connected, true);
  for (const status of [403, 429, 500]) {
    const response = await personalCalendar(request(), env, auth, async () =>
      Response.json(
        { error: { message: "sensitive Google error", errors: [] } },
        { status },
      ),
    );
    assert.notEqual(response.status, 200);
    assert.ok(!(await response.text()).includes("sensitive Google error"));
  }
});
test("expired access renews server-side, rotates encrypted credential and does not expose tokens", async () => {
  const configured = {
    ...env,
    GOOGLE_CLIENT_ID: "fixture-client",
    GOOGLE_CLIENT_SECRET: "fixture-secret",
  };
  let calls = 0;
  const response = await personalCalendar(
    request({ ...grant(), accessExpires: 0 }),
    configured,
    auth,
    async (url, options) => {
      calls++;
      if (String(url).includes("oauth2.googleapis.com")) {
        assert.equal(
          options.body.get("refresh_token"),
          "fixture-google-refresh",
        );
        assert.equal(options.body.get("client_secret"), "fixture-secret");
        return Response.json({
          access_token: "rotated-fixture-access",
          refresh_token: "rotated-fixture-refresh",
          expires_in: 3600,
        });
      }
      assert.equal(
        options.headers.Authorization,
        "Bearer rotated-fixture-access",
      );
      return Response.json({ items: [event] });
    },
  );
  assert.equal(calls, 2);
  const encrypted = response.headers
    .getSetCookie()[0]
    .split(";")[0]
    .split("=")[1];
  assert.equal(
    unseal(encrypted, configured).refreshToken,
    "rotated-fixture-refresh",
  );
  const text = await response.text();
  assert.equal(JSON.parse(text).automaticRenewal, true);
  assert.ok(!text.includes("rotated-fixture"));
});
test("missing refresh configuration and revoked grants request reconnection, never other user credentials", async () => {
  const expired = await personalCalendar(
    request({ ...grant(), accessExpires: 0 }),
    env,
    auth,
    async () => {
      throw new Error("must not fetch");
    },
  );
  assert.equal((await expired.json()).connected, false);
  const revoked = await personalCalendar(
    request({ ...grant(), accessExpires: 0 }),
    {
      ...env,
      GOOGLE_CLIENT_ID: "fixture-client",
      GOOGLE_CLIENT_SECRET: "fixture-secret",
    },
    auth,
    async () => Response.json({ error: "invalid_grant" }, { status: 400 }),
  );
  assert.equal((await revoked.json()).connected, false);
});
test("Google 401 retries refresh only once and quota errors remain actionable", async () => {
  let calls = 0;
  const r = await personalCalendar(
    request(),
    {
      ...env,
      GOOGLE_CLIENT_ID: "fixture-client",
      GOOGLE_CLIENT_SECRET: "fixture-secret",
    },
    auth,
    async (url) => {
      calls++;
      return String(url).includes("oauth2.googleapis.com")
        ? Response.json({ access_token: "fixture-new", expires_in: 3600 })
        : Response.json({}, { status: 401 });
    },
  );
  assert.equal(calls, 3);
  assert.equal((await r.json()).connected, false);
  const quota = await personalCalendar(request(), env, auth, async () =>
    Response.json(
      { error: { errors: [{ reason: "rateLimitExceeded" }] } },
      { status: 403 },
    ),
  );
  assert.equal(quota.status, 429);
});
test("event normalization rejects executable URLs and invalid/missing dates", () => {
  assert.equal(personalEvent({ ...event, start: {} }), null);
  assert.equal(personalEvent({ ...event, end: { dateTime: "invalid" } }), null);
  assert.equal(
    personalEvent({ ...event, start: { dateTime: "2026-10-27T11:00:00" } }),
    null,
  );
  const safe = personalEvent({
    ...event,
    htmlLink: "javascript:alert(1)",
    hangoutLink: "https://user:pass@example.com",
  });
  assert.equal(safe.url, "");
  assert.equal(safe.meetingUrl, "");
});
test("disconnect is same-origin authorized cookie cleanup; no Google or shared calendar mutations", async () => {
  const r = await disconnectPersonalCalendar(
    request(grant(), "DELETE"),
    env,
    auth,
  );
  assert.equal((await r.json()).connected, false);
  assert.match(r.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (
      await disconnectPersonalCalendar(
        request(grant(), "DELETE", "https://evil.example"),
        env,
        auth,
      )
    ).status,
    403,
  );
});
