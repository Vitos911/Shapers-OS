import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/supabase-config/route.ts";

test("public config exposes only safe fields and rejects misplaced server credentials", async () => {
  const names = [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "AUTH_COOKIE_SECRET",
    ],
    saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.deepEqual(await GET().json(), { configured: false });
    process.env.SUPABASE_URL = "https://fixture.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture";
    process.env.AUTH_COOKIE_SECRET =
      "fixture-cookie-key-never-expose-to-browser";
    const result = GET();
    assert.equal(result.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(Object.keys(await result.json()).sort(), [
      "configured",
      "publishableKey",
      "url",
    ]);
    process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_SECRET_KEY;
    const invalid = GET();
    assert.equal(invalid.status, 503);
    assert.equal(
      JSON.stringify(await invalid.json()).includes("sb_secret_fixture"),
      false,
    );
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
