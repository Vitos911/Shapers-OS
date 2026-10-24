import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key?.startsWith("sb_publishable_"), "Set SUPABASE_URL and a publishable key in an ignored environment file.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const settings = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
assert.equal(settings.status, 200, "Auth endpoint must be reachable with the publishable key.");
const auth = await settings.json();
assert.equal(auth.external?.email, true, "Email authentication must be enabled.");
for (const table of ["shapers_workspaces", "shapers_workspace_access"]) {
  const result = await client.from(table).select("*").limit(1);
  assert.equal(result.error?.code, "42501", `${table}: anonymous requests must be denied by database permissions.`);
}
const permission = await client.rpc("shapers_workspace_can_edit", { workspace: "00000000-0000-0000-0000-000000000000" });
assert.equal(permission.error?.code, "42501", "Anonymous callers must not execute the permission helper.");
console.log("PASS: live Supabase Auth reachable, email enabled, anonymous table and permission access denied. No credentials printed.");
