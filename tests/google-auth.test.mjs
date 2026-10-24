import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  startGoogle,
  googleCallback,
  finishGoogle,
  authOrigin,
  clearGoogleCookies,
} from "../lib/google-auth.ts";

test("logout clears transient OAuth and private calendar cookies, rejecting cross-origin calls", () => {
  const response = clearGoogleCookies(request("/auth/logout"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 3);
  for (const c of response.headers.getSetCookie()) assert.match(c, /Max-Age=0/);
  assert.equal(
    clearGoogleCookies(
      new Request(origin + "/auth/logout", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      env,
    ).status,
    403,
  );
});
const env = {
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  AUTH_COOKIE_SECRET: "fixture-only-32-characters-not-a-real-secret",
};

test("installed Supabase SDK creates S256 PKCE and exchanges the same server-only verifier", async () => {
  let challenge = "";
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "verified@fixture.invalid",
    email_confirmed_at: "2026-10-24T10:00:00Z",
    is_anonymous: false,
  };
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const token =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }) +
    ".fixture";
  const sdk = (configuration, storage) =>
    createClient(
      configuration.SUPABASE_URL,
      configuration.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: false,
          autoRefreshToken: false,
          persistSession: true,
          storage,
        },
        global: {
          fetch: async (url, options) => {
            if (String(url).includes("/token")) {
              const body = JSON.parse(options.body);
              assert.equal(
                createHash("sha256")
                  .update(body.code_verifier)
                  .digest("base64url"),
                challenge,
              );
              return Response.json({
                access_token: token,
                refresh_token: "fixture-refresh",
                expires_in: 3600,
                token_type: "bearer",
                user,
              });
            }
            assert.ok(String(url).endsWith("/user"));
            return Response.json(user);
          },
        },
      },
    );
  const start = await startGoogle(request("/auth/google"), env, sdk, settings);
  assert.equal(start.status, 200);
  const authorize = new URL((await start.json()).url);
  challenge = decodeURIComponent(authorize.searchParams.get("code_challenge"));
  assert.ok(challenge);
  const callback = new URL(authorize.searchParams.get("redirect_to"));
  callback.searchParams.set("code", "fixture-code");
  const done = await googleCallback(
    new Request(callback, { headers: { cookie: cookies(start) } }),
    env,
    sdk,
  );
  assert.equal(done.headers.get("location"), origin + "/auth/complete");
});
const origin = "http://localhost:3000";
const request = (path, body = {}, cookie = "", host = origin) =>
  new Request(host + path, {
    method: "POST",
    headers: { origin: host, "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
const settings = async () => Response.json({ external: { google: true } });
let verified = true,
  exchanges = 0;
const makeClient = (_env, storage) => ({
  auth: {
    signInWithOAuth: async ({ provider, options }) => {
      assert.equal(provider, "google");
      assert.equal(
        options.scopes,
        "openid email profile https://www.googleapis.com/auth/calendar.events.readonly",
      );
      assert.equal(options.queryParams.access_type, "offline");
      assert.equal(options.queryParams.prompt, "consent select_account");
      assert.equal(options.skipBrowserRedirect, undefined);
      storage.setItem(
        "sb-fixture-code-verifier",
        JSON.stringify("fixture-verifier"),
      );
      const url = new URL(env.SUPABASE_URL + "/auth/v1/authorize");
      url.searchParams.set("redirect_to", options.redirectTo);
      url.searchParams.set("code_challenge_method", "s256");
      return { data: { url: url.href }, error: null };
    },
    exchangeCodeForSession: async (code) => {
      exchanges++;
      assert.equal(code, "valid-code");
      assert.equal(
        JSON.parse(storage.getItem("sb-fixture-code-verifier")),
        "fixture-verifier",
      );
      return {
        data: {
          session: {
            access_token: "fixture-access",
            refresh_token: "fixture-refresh",
            provider_token: "discard-google-token",
          },
        },
        error: null,
      };
    },
    getUser: async () => ({
      data: {
        user: {
          id: "fixture-user",
          email_confirmed_at: verified ? "2026-10-24" : null,
          is_anonymous: false,
        },
      },
      error: null,
    }),
  },
});
const cookies = (response) =>
  response.headers
    .getSetCookie()
    .filter((c) => !c.includes("Max-Age=0"))
    .map((c) => c.split(";")[0])
    .join("; ");
async function begin(host = origin) {
  const response = await startGoogle(
    request("/auth/google", { next: "/legacy" }, "", host),
    { ...env, ...(host === origin ? {} : { APP_URL: host }) },
    makeClient,
    settings,
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  return {
    response,
    flowCookie: cookies(response),
    callback: new URL(new URL(data.url).searchParams.get("redirect_to")),
  };
}

test("origin handling rejects non-HTTPS production, userinfo, missing production config and forwarded-host injection", () => {
  assert.equal(authOrigin(new Request(origin), env), origin);
  assert.throws(() => authOrigin(new Request("https://app.example"), env));
  assert.throws(() =>
    authOrigin(new Request(origin), {
      ...env,
      APP_URL: "https://bad@evil.example",
    }),
  );
  assert.throws(() =>
    authOrigin(new Request(origin), { ...env, APP_URL: "http://app.example" }),
  );
  assert.equal(
    authOrigin(
      new Request(origin, { headers: { "x-forwarded-host": "evil.example" } }),
      { ...env, APP_URL: "https://app.example" },
    ),
    "https://app.example",
  );
});
test("Google initiation rejects CSRF, open redirects and unknown role fields", async () => {
  for (const next of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/auth/callback",
  ])
    assert.equal(
      (
        await startGoogle(
          request("/auth/google", { next }),
          env,
          makeClient,
          settings,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await startGoogle(
        request("/auth/google", { role: "SUPERADMIN" }),
        env,
        makeClient,
        settings,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await startGoogle(
        new Request(origin + "/auth/google", {
          method: "POST",
          headers: { origin: "https://evil.example" },
          body: "{}",
        }),
        env,
        makeClient,
        settings,
      )
    ).status,
    403,
  );
});
test("missing provider and missing cookie key fail clearly without OAuth redirect", async () => {
  assert.equal(
    (
      await startGoogle(request("/auth/google"), env, makeClient, async () =>
        Response.json({ external: { google: false } }),
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await startGoogle(
        request("/auth/google"),
        { ...env, AUTH_COOKIE_SECRET: "" },
        makeClient,
        settings,
      )
    ).status,
    503,
  );
});
test("PKCE callback validates encrypted cookie and flow, transfers only verified Supabase tokens, clears cookies", async () => {
  verified = true;
  const flow = await begin();
  assert.match(flow.response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(flow.response.headers.get("set-cookie"), /SameSite=Lax/);
  assert.ok(!flow.flowCookie.includes("fixture-verifier"));
  flow.callback.searchParams.set("code", "valid-code");
  const callback = await googleCallback(
    new Request(flow.callback, { headers: { cookie: flow.flowCookie } }),
    env,
    makeClient,
  );
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get("location"), origin + "/auth/complete");
  assert.equal(callback.headers.get("Cache-Control"), "private, no-store");
  const handoff = cookies(callback);
  assert.ok(!handoff.includes("fixture-access"));
  assert.ok(handoff.includes("shapers-google-calendar="));
  assert.ok(!handoff.includes("discard-google-token"));
  const finish = await finishGoogle(
    request("/auth/session", {}, handoff),
    env,
    makeClient,
  );
  assert.equal(finish.status, 200);
  assert.deepEqual(await finish.json(), {
    access_token: "fixture-access",
    refresh_token: "fixture-refresh",
    next: "/legacy",
  });
  assert.match(finish.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (await finishGoogle(request("/auth/session"), env, makeClient)).status,
    400,
  );
});
test("tampered, missing, mismatched and expired flow cookies never exchange a code", async () => {
  const flow = await begin();
  flow.callback.searchParams.set("code", "valid-code");
  const before = exchanges;
  for (const bad of ["", flow.flowCookie.slice(0, -8) + "tampered"])
    assert.match(
      (
        await googleCallback(
          new Request(flow.callback, { headers: { cookie: bad } }),
          env,
          makeClient,
        )
      ).headers.get("location"),
      /error=callback$/,
    );
  const mismatch = new URL(flow.callback);
  mismatch.searchParams.set("flow", "attacker");
  await googleCallback(
    new Request(mismatch, { headers: { cookie: flow.flowCookie } }),
    env,
    makeClient,
  );
  const now = Date.now;
  try {
    Date.now = () => now() + 700000;
    await googleCallback(
      new Request(flow.callback, { headers: { cookie: flow.flowCookie } }),
      env,
      makeClient,
    );
  } finally {
    Date.now = now;
  }
  assert.equal(exchanges, before);
});
test("provider cancellation and unverified identities do not establish a session", async () => {
  const flow = await begin();
  flow.callback.searchParams.set("error", "access_denied");
  let callback = await googleCallback(
    new Request(flow.callback, { headers: { cookie: flow.flowCookie } }),
    env,
    makeClient,
  );
  assert.match(callback.headers.get("location"), /error=cancelled$/);
  flow.callback.searchParams.delete("error");
  flow.callback.searchParams.set("code", "valid-code");
  verified = false;
  try {
    callback = await googleCallback(
      new Request(flow.callback, { headers: { cookie: flow.flowCookie } }),
      env,
      makeClient,
    );
    assert.match(callback.headers.get("location"), /error=callback$/);
    assert.equal(cookies(callback), "");
  } finally {
    verified = true;
  }
});
test("production cookies are host-only, secure and callback destination is canonical", async () => {
  const flow = await begin("https://shapers.example");
  assert.match(flow.flowCookie, /^__Host-shapers-oauth-flow=/);
  assert.match(flow.response.headers.get("set-cookie"), /; Secure/);
  assert.equal(flow.callback.origin, "https://shapers.example");
});
