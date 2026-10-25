import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  analytics,
  weekStart,
  ljubljanaDate,
  midnightInLjubljana,
  selfCheckInAllowed,
  canManageTask,
  canViewMemberAnalytics,
} from "../lib/organization.ts";
import { fields, uuid } from "../lib/org-validation.ts";
import { getCurrentUser, requireRole, jsonBody } from "../lib/org-server.ts";
import {
  fetchGoogleEvents,
  normalizeEvent,
  safeHttpUrl,
  syncCalendar,
} from "../lib/google-calendar.ts";

test("member cannot trigger shared calendar reads or privileged writes", async () => {
  const forbidden = new Proxy({}, { get() { throw new Error("database must not be reached"); } });
  await assert.rejects(
    () => syncCalendar(forbidden, { role: "MEMBER", member_id: "m", user_id: "u", email: "fixture@invalid.example" }, "2026-10-01", "2026-11-01"),
    e => e.status === 403,
  );
});

test("private OAuth calendar refreshes on server and uses a Bearer token for GET only", async () => {
  const calls = [];
  await fetchGoogleEvents("private", "2026-10-01", "2026-11-01", {
    env: {
      GOOGLE_CLIENT_ID: "fixture-client",
      GOOGLE_CLIENT_SECRET: "fixture-secret",
      GOOGLE_REFRESH_TOKEN: "fixture-refresh",
    },
    fetcher: async (url, options) => {
      calls.push({ url: String(url), options });
      return Response.json(
        calls.length === 1 ? { access_token: "fixture-access" } : { items: [] },
      );
    },
  });
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body.get("grant_type"), "refresh_token");
  assert.equal(calls[1].options.headers.Authorization, "Bearer fixture-access");
  assert.ok(!calls[1].options.method || calls[1].options.method === "GET");
  assert.equal(new URL(calls[1].url).searchParams.has("key"), false);
});

test("service account JWT requests only readonly events scope and is signed correctly", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  let step = 0;
  await fetchGoogleEvents("private", "2026-10-01", "2026-11-01", {
    env: {
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "fixture@service.invalid",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      }),
    },
    fetcher: async (url, options) => {
      if (step++ === 0) {
        assert.equal(String(url), "https://oauth2.googleapis.com/token");
        const jwt = options.body.get("assertion").split(".");
        const claims = JSON.parse(Buffer.from(jwt[1], "base64url"));
        assert.equal(
          claims.scope,
          "https://www.googleapis.com/auth/calendar.events.readonly",
        );
        assert.equal(
          verify(
            "RSA-SHA256",
            Buffer.from(jwt.slice(0, 2).join(".")),
            publicKey,
            Buffer.from(jwt[2], "base64url"),
          ),
          true,
        );
        return Response.json({ access_token: "fixture-access" });
      }
      return Response.json({ items: [] });
    },
  });
  assert.equal(step, 2);
});
const member = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test",
  email: "test@sandbox.example",
  tier: "GO!",
  weekly_hours: 4,
  series: "Community; Shapers Tech",
  auth_user_id: "user",
};
const identity = {
  user_id: "user",
  email: member.email,
  role: "MEMBER",
  member_id: member.id,
};
const event = {
  id: "g1",
  summary: "Shapers Tech — planning",
  description: "Series: Shapers Tech",
  start: { dateTime: "2026-10-24T12:00:00+02:00" },
  end: { dateTime: "2026-10-24T13:00:00+02:00" },
  recurringEventId: "series-1",
  originalStartTime: { dateTime: "2026-10-24T12:00:00+02:00" },
};

test("API body rejects invalid objects and enforces a byte limit while reading", async () => {
  assert.deepEqual(
    await jsonBody(
      new Request("http://local", { method: "POST", body: '{"name":"ok"}' }),
    ),
    { name: "ok" },
  );
  for (const body of ["[]", "null", "bad"])
    await assert.rejects(
      () => jsonBody(new Request("http://local", { method: "POST", body })),
      (e) => e.status === 400,
    );
  await assert.rejects(
    () =>
      jsonBody(
        new Request("http://local", {
          method: "POST",
          body: JSON.stringify({ name: "č".repeat(11000) }),
        }),
      ),
    (e) => e.status === 413,
  );
});

test("Google description emails identify sandbox participants without creating users", () => {
  const e = normalizeEvent(
    {
      ...event,
      description:
        "Series: Shapers Tech\nMembers: Ana.Kovac@sandbox.example, ziga.krajnc@sandbox.example",
      attendees: [{ email: "ana.kovac@sandbox.example" }],
    },
    "calendar",
  );
  assert.deepEqual(e.participantEmails, [
    "ana.kovac@sandbox.example",
    "ziga.krajnc@sandbox.example",
  ]);
});
test("Ljubljana Monday boundaries and DST all-day dates do not use host timezone", () => {
  assert.equal(ljubljanaDate(new Date("2026-10-24T22:30:00Z")), "2026-10-25");
  assert.equal(weekStart("2026-10-25"), "2026-10-19");
  assert.equal(weekStart("2026-10-26"), "2026-10-26");
  assert.equal(midnightInLjubljana("2026-10-25"), "2026-10-24T22:00:00.000Z");
  assert.equal(midnightInLjubljana("2026-10-26"), "2026-10-25T23:00:00.000Z");
});
test("roles reject member/admin elevation; own task and private analytics boundaries", () => {
  assert.throws(() => requireRole(identity));
  requireRole({ ...identity, role: "ADMIN" });
  assert.throws(() =>
    requireRole({ ...identity, role: "ADMIN" }, ["SUPERADMIN"]),
  );
  requireRole({ ...identity, role: "SUPERADMIN" }, ["SUPERADMIN"]);
  assert.equal(canManageTask(identity, { assignee_id: member.id }), true);
  assert.equal(canManageTask(identity, { assignee_id: "other" }), false);
  assert.equal(canViewMemberAnalytics(identity, "other"), false);
});
test("untrusted role, credential, timestamps and foreign owner fields are rejected", () => {
  for (const body of [
    { name: "A", role: "SUPERADMIN" },
    { name: "A", is_admin: true },
    { name: "A", auth_user_id: "stolen" },
  ])
    assert.throws(() => fields("profile", body, true));
  assert.throws(() =>
    fields("work", { date: "2026-10-20", hours: 1, member_id: "other" }),
  );
  assert.throws(() => fields("tasks", { title: "X" }));
  assert.throws(() => fields("work", { date: "2026-02-30", hours: 1 }));
  assert.throws(() => fields("work", { date: "2026-10-20", hours: 0.1 }));
  assert.throws(() => uuid("not-a-uuid"));
  assert.equal(
    fields("work", { date: "2026-10-20", hours: 1.25, project_id: null }).hours,
    1.25,
  );
});
test("missing and invalid sessions fail before any privileged database query", async () => {
  await assert.rejects(
    () =>
      getCurrentUser(
        new Request("http://local/api/org/snapshot", {
          headers: { "x-user-id": "spoof" },
        }),
      ),
    (e) => e.status === 401,
  );
  await assert.rejects(
    () =>
      getCurrentUser(
        new Request("http://local/api/org/snapshot", {
          headers: { authorization: "Bearer multiple tokens" },
        }),
      ),
    (e) => e.status === 401,
  );
});
test("self check-in time window excludes future, late, cancelled, and all-day events", () => {
  const e = {
    starts_at: "2026-10-24T10:00:00Z",
    ends_at: "2026-10-24T11:00:00Z",
    all_day: false,
    cancelled: false,
  };
  assert.equal(selfCheckInAllowed(e, Date.parse("2026-10-24T09:30:00Z")), true);
  assert.equal(
    selfCheckInAllowed(e, Date.parse("2026-10-24T09:29:59Z")),
    false,
  );
  assert.equal(
    selfCheckInAllowed(e, Date.parse("2026-10-24T13:00:01Z")),
    false,
  );
  assert.equal(
    selfCheckInAllowed({ ...e, cancelled: true }, Date.parse(e.starts_at)),
    false,
  );
  assert.equal(
    selfCheckInAllowed({ ...e, all_day: true }, Date.parse(e.starts_at)),
    false,
  );
});
test("Google recurring instances retain stable identifiers, offsets and series", () => {
  const e = normalizeEvent(event, "calendar");
  assert.equal(e.google_event_id, "g1");
  assert.equal(e.recurring_event_id, "series-1");
  assert.equal(e.starts_at, "2026-10-24T10:00:00.000Z");
  assert.equal(e.series, "Shapers Tech");
  assert.equal(
    normalizeEvent(
      { ...event, start: { dateTime: "2026-10-24T12:00:00" } },
      "calendar",
    ),
    null,
  );
  assert.equal(normalizeEvent({ id: "bad" }, "calendar"), null);
  assert.equal(safeHttpUrl("javascript:alert(1)"), "");
});
test("all-day Google events respect a 25-hour DST day", () => {
  const e = normalizeEvent(
    { id: "day", start: { date: "2026-10-25" }, end: { date: "2026-10-26" } },
    "calendar",
  );
  assert.equal(e.all_day, true);
  assert.equal(Date.parse(e.ends_at) - Date.parse(e.starts_at), 25 * 3600000);
});
test("Google uses read-only GET, recurrence expansion, time bounds and pagination", async () => {
  const calls = [];
  const result = await fetchGoogleEvents(
    "public#calendar",
    "2026-09-14T00:00:00Z",
    "2026-11-22T00:00:00Z",
    {
      env: { GOOGLE_CALENDAR_API_KEY: "fixture-not-a-key" },
      fetcher: async (url, options) => {
        calls.push({ url: new URL(url), options });
        return Response.json(
          calls.length === 1
            ? { items: [event], nextPageToken: "next" }
            : { items: [{ id: "cancelled", status: "cancelled" }] },
        );
      },
    },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get("singleEvents"), "true");
  assert.equal(calls[0].url.searchParams.get("orderBy"), "startTime");
  assert.equal(calls[0].url.searchParams.get("timeZone"), "Europe/Ljubljana");
  assert.equal(calls[1].url.searchParams.get("pageToken"), "next");
  assert.ok(!calls[0].options.method || calls[0].options.method === "GET");
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.cancelled, ["cancelled"]);
});
test("missing config, API errors, repeated pages and empty calendars are explicit", async () => {
  await assert.rejects(
    () => fetchGoogleEvents("", "2026-10-01", "2026-11-01", { env: {} }),
    (e) => e.status === 503,
  );
  await assert.rejects(
    () =>
      fetchGoogleEvents("cal", "2026-10-01", "2026-11-01", {
        env: { GOOGLE_CALENDAR_API_KEY: "fixture" },
        fetcher: async () => new Response("", { status: 403 }),
      }),
    /403/,
  );
  await assert.rejects(
    () =>
      fetchGoogleEvents("cal", "2026-10-01", "2026-11-01", {
        env: { GOOGLE_CALENDAR_API_KEY: "fixture" },
        fetcher: async () =>
          Response.json({ items: [], nextPageToken: "same" }),
      }),
    /paginacija/,
  );
  const empty = await fetchGoogleEvents("cal", "2026-10-01", "2026-11-01", {
    env: { GOOGLE_CALENDAR_API_KEY: "fixture" },
    fetcher: async () => Response.json({ items: [] }),
  });
  assert.deepEqual(empty.events, []);
});
test("analytics use persisted completion history, nondeleted hours and eligible attendance denominator", () => {
  const s = {
    identity,
    members: [member],
    projects: [],
    projectMembers: [],
    meetingMembers: [],
    tasks: [
      {
        id: "t",
        assignee_id: member.id,
        status: "todo",
        archived: false,
        project_id: "p",
        due_date: "2026-01-01",
      },
    ],
    work: [
      {
        id: "w",
        member_id: member.id,
        project_id: "p",
        date: "2026-01-20",
        hours: 2,
        deleted: false,
      },
      {
        id: "deleted",
        member_id: member.id,
        date: "2026-01-20",
        hours: 5,
        deleted: true,
      },
    ],
    history: [
      {
        task_id: "t",
        member_id: member.id,
        old_status: "in_progress",
        new_status: "done",
        occurred_at: "2026-01-20T12:00:00Z",
        changes: { after: { project_id: "p" } },
      },
      {
        task_id: "t",
        member_id: member.id,
        old_status: "todo",
        new_status: "done",
        occurred_at: "2026-01-21T12:00:00Z",
        changes: { after: { project_id: "p" } },
      },
    ],
    meetings: [
      {
        id: "a",
        series: "Community",
        starts_at: "2026-01-20T12:00:00Z",
        ends_at: "2026-01-20T13:00:00Z",
        cancelled: false,
      },
      {
        id: "b",
        series: "Community",
        starts_at: "2026-01-21T12:00:00Z",
        ends_at: "2026-01-21T13:00:00Z",
        cancelled: false,
      },
      {
        id: "c",
        series: "Community",
        starts_at: "2026-01-22T12:00:00Z",
        ends_at: "2026-01-22T13:00:00Z",
        cancelled: false,
      },
    ],
    attendance: [
      { meeting_id: "a", member_id: member.id, status: "remote" },
      { meeting_id: "b", member_id: member.id, status: "excused" },
    ],
  };
  const a = analytics(
    s,
    { from: "2026-01-19", to: "2026-01-25" },
    "2026-01-24",
  );
  assert.equal(a.hours, 2);
  assert.equal(a.weeklyHours, 2);
  assert.equal(a.completed, 1);
  assert.equal(a.open, 1);
  assert.equal(a.overdue, 1);
  assert.equal(a.attendanceRate, 1);
  assert.equal(a.missingAttendance, 1);
  assert.equal(a.weekly.length, 1);
  assert.equal(a.weekly[0].completed, a.completed);
  assert.equal(a.behind, 1);
  assert.equal(a.activeMembers, 1);
});
