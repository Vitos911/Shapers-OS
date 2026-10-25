import test from "node:test";
import assert from "node:assert/strict";
import { createSlackService, SlackError } from "../lib/slack/client.ts";
import { createSlackTestHandlers, TEST_MESSAGE } from "../lib/slack/test-handler.ts";
import { HttpError } from "../lib/org-server.ts";

// Isolated protocol fixtures, never a runtime fallback or evidence of live delivery.
const token = "xoxb-fixture-not-a-real-token";
const env = { SLACK_BOT_TOKEN: token, SLACK_CHANNEL_ID: "C0123456789", SLACK_TEST_ENABLED: "true", APP_URL: "https://shapers.example" };
const identity = { user_id: "fixture-user", member_id: null, email: "fixture@example.invalid", role: "SUPERADMIN" };
const validAuth = { ok: true, team_id: "T0123456789", bot_id: "B0123456789", token: "must-not-return" };
const validSend = { ok: true, channel: env.SLACK_CHANNEL_ID, ts: "1792848000.000123", message: { text: "must-not-return" } };
const request = (body = { confirm: "send-test-message" }, headers = {}, method = "POST") => new Request(env.APP_URL + "/api/slack/test", {
  method,
  headers: { origin: env.APP_URL, "content-type": "application/json", ...headers },
  ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
});
const auth = async () => ({ identity });
function fixture(response) {
  const calls = [];
  const service = createSlackService({ env, fetcher: async (url, options) => {
    calls.push({ url, options });
    return typeof response === "function" ? response(url, options) : Response.json(response);
  } });
  return { service, calls };
}

test("Slack configuration is lazy and absent/partial/invalid settings never contact Slack or succeed", async () => {
  for (const config of [{}, { SLACK_BOT_TOKEN: token }, { SLACK_CHANNEL_ID: env.SLACK_CHANNEL_ID },
    { ...env, SLACK_BOT_TOKEN: "xoxp-user-token" }, { ...env, SLACK_CHANNEL_ID: "#general" }, { ...env, SLACK_CHANNEL_ID: "https://evil.invalid" }]) {
    let calls = 0;
    const s = createSlackService({ env: config, fetcher: async () => { calls++; throw Error("must not fetch"); } });
    await assert.rejects(() => s.checkConnection(), e => e instanceof SlackError && e.status === 503);
    await assert.rejects(() => s.sendMessage("test"), e => e instanceof SlackError && e.status === 503);
    assert.equal(calls, 0);
  }
});

test("auth.test uses the official endpoint, header token, timeout and minimal validated result", async () => {
  const { service, calls } = fixture(validAuth);
  assert.deepEqual(await service.checkConnection(), { connected: true, teamId: validAuth.team_id, botId: validAuth.bot_id });
  const { url, options } = calls[0];
  assert.equal(url, "https://slack.com/api/auth.test");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer " + token);
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(options.body), {});
});

test("chat.postMessage targets only the configured channel and disables markup/mentions/link previews", async () => {
  const { service, calls } = fixture(validSend);
  assert.deepEqual(await service.sendMessage(" <@U0123456789> <!channel> & hello "), { sent: true, timestamp: validSend.ts });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://slack.com/api/chat.postMessage");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    channel: env.SLACK_CHANNEL_ID, text: "&lt;@U0123456789&gt; &lt;!channel&gt; &amp; hello",
    mrkdwn: false, parse: "none", unfurl_links: false, unfurl_media: false,
  });
});

test("empty, non-string and oversized messages are rejected before transport", async () => {
  const { service, calls } = fixture(validSend);
  for (const text of ["", "  ", null, 7, "a".repeat(4001)])
    await assert.rejects(() => service.sendMessage(text), e => e.code === "invalid_message" && e.status === 400);
  assert.equal(calls.length, 0);
});

test("HTTP 200 with Slack ok:false is failure; raw provider errors and tokens are not propagated", async () => {
  for (const [error, code] of [["invalid_auth", "authentication_failed"], ["token_revoked", "authentication_failed"],
    ["missing_scope", "channel_unavailable"], ["channel_not_found", "channel_unavailable"], ["not_in_channel", "channel_unavailable"],
    ["is_archived", "channel_unavailable"], [token, "slack_rejected"]]) {
    const { service, calls } = fixture({ ok: false, error, secret: token });
    await assert.rejects(() => service.sendMessage("test"), e => e.code === code && !e.message.includes(token));
    assert.equal(calls.length, 1);
  }
});

test("rate limits preserve Retry-After and do not retry a send", async () => {
  for (const retry of ["17", "invalid", "-4", "0", "1000000000"]) {
    const { service, calls } = fixture(() => new Response("private upstream body", { status: 429, headers: { "Retry-After": retry } }));
    await assert.rejects(() => service.sendMessage("test"), e => e.code === "rate_limited" && e.status === 429 && e.retryAfter === (retry === "17" ? 17 : 60));
    assert.equal(calls.length, 1);
  }
  const { service } = fixture({ ok: false, error: "ratelimited" });
  await assert.rejects(() => service.checkConnection(), e => e.status === 429 && e.retryAfter === 60);
});

test("timeouts, network, HTTP and malformed send responses remain unconfirmed and never retried", async () => {
  for (const response of [
    () => { throw new DOMException(token, "TimeoutError"); },
    () => { throw new Error(token); },
    () => new Response(token, { status: 503 }),
    () => new Response("not JSON: " + token),
    () => Response.json({ ok: true, channel: "C9999999999", ts: validSend.ts }),
    () => Response.json({ ok: true, channel: env.SLACK_CHANNEL_ID }),
    () => Response.json({ ...validSend, ok: "true" }),
  ]) {
    const { service, calls } = fixture(response);
    await assert.rejects(() => service.sendMessage("test"), e => e.code === "delivery_unknown" && !e.message.includes(token));
    assert.equal(calls.length, 1);
  }
});

test("connection success requires a real-shaped bot identity, not just an HTTP success or ok flag", async () => {
  for (const data of [{}, [], null, { ok: true }, { ok: true, team_id: validAuth.team_id }, { ok: "true" }]) {
    const { service } = fixture(data);
    await assert.rejects(() => service.checkConnection(), e => e.code === "invalid_response");
  }
});

test("test API denies absent/expired/disabled identities and Member/Admin before any Slack operation", async () => {
  const { service, calls } = fixture(validSend);
  for (const status of [401, 403]) {
    const api = createSlackTestHandlers(service, { env, authenticate: async () => { throw new HttpError(status, "denied"); } });
    assert.equal((await api.GET(request(undefined, {}, "GET"))).status, status);
    assert.equal((await api.POST(request())).status, status);
  }
  for (const role of ["MEMBER", "ADMIN"]) {
    const api = createSlackTestHandlers(service, { env, authenticate: async () => ({ identity: { ...identity, role } }) });
    assert.equal((await api.GET(request(undefined, {}, "GET"))).status, 403);
    assert.equal((await api.POST(request())).status, 403);
  }
  assert.equal(calls.length, 0);
});

test("test send is explicit opt-in; GET verifies the connection without sending a message", async () => {
  const { service, calls } = fixture(validAuth);
  const api = createSlackTestHandlers(service, { env: { ...env, SLACK_TEST_ENABLED: "false" }, authenticate: auth });
  assert.equal((await api.POST(request())).status, 403);
  const get = await api.GET(request(undefined, {}, "GET"));
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("cache-control"), "private, no-store");
  assert.equal((await get.json()).connected, true);
  assert.deepEqual(calls.map(c => c.url), ["https://slack.com/api/auth.test"]);
});

test("Superadmin test send rejects cross-origin, missing origin, wrong content type and arbitrary fields", async () => {
  const { service, calls } = fixture(validSend);
  const api = createSlackTestHandlers(service, { env, authenticate: auth });
  for (const headers of [{ origin: "https://evil.invalid" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }])
    assert.equal((await api.POST(request(undefined, headers))).status, 403);
  const noOrigin = request(); noOrigin.headers.delete("origin");
  assert.equal((await api.POST(noOrigin)).status, 403);
  assert.equal((await api.POST(request(undefined, { "content-type": "text/plain" }))).status, 415);
  for (const body of [{}, { confirm: "no" }, { confirm: "send-test-message", channel: "C9999999999" },
    { confirm: "send-test-message", text: "<!here>" }, { confirm: "send-test-message", token }, "not json", "null", "[]"])
    assert.equal((await api.POST(request(body))).status, 400);
  assert.equal((await api.POST(request({ confirm: "x".repeat(21000) }))).status, 413);
  assert.equal(calls.length, 0);
});

test("test API reports no false success when Slack is absent, fails, rate limits or returns malformed data", async () => {
  for (const [service, status, code] of [
    [createSlackService({ env: {} }), 503, "not_configured"],
    [fixture({ ok: false, error: token }).service, 502, "slack_rejected"],
    [fixture(() => new Response(token, { status: 429, headers: { "Retry-After": "17" } })).service, 429, "rate_limited"],
    [fixture({ ok: true }).service, 502, "delivery_unknown"],
  ]) {
    const result = await createSlackTestHandlers(service, { env, authenticate: auth }).POST(request());
    const body = await result.json();
    assert.equal(result.status, status); assert.equal(body.code, code); assert.equal(body.sent, undefined);
    assert.ok(!JSON.stringify(body).includes(token));
    if (status === 429) assert.equal(result.headers.get("retry-after"), "17");
  }
});

test("confirmed test sends only the fixed message; duplicate attempts and concurrent clicks are limited", async () => {
  let instant = 100000;
  const { service, calls } = fixture(validSend);
  const api = createSlackTestHandlers(service, { env, authenticate: auth, now: () => instant });
  const responses = await Promise.all([api.POST(request()), api.POST(request())]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 429]);
  const accepted = responses.find(r => r.status === 200);
  assert.deepEqual(await accepted.json(), { sent: true, timestamp: validSend.ts });
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).text, TEST_MESSAGE);
  instant += 60000;
  assert.equal((await api.POST(request())).status, 200);
  assert.equal(calls.length, 2);
});

test("uncertain send failures retain cooldown and unexpected auth errors are sanitized", async () => {
  const { service, calls } = fixture(() => { throw Error(token); });
  const api = createSlackTestHandlers(service, { env, authenticate: auth });
  assert.equal((await api.POST(request())).status, 504);
  assert.equal((await api.POST(request())).status, 429);
  assert.equal(calls.length, 1);
  const brokenAuth = createSlackTestHandlers(service, { env, authenticate: async () => { throw Error(token); } });
  const result = await brokenAuth.POST(request());
  assert.equal(result.status, 500);
  assert.ok(!(await result.text()).includes(token));
});
