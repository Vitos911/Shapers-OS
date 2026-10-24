import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { normalizedEmail } from "../lib/imports.ts";
const key = process.env.SUPABASE_SECRET_KEY;
if (!key) throw new Error("SUPABASE_SECRET_KEY is required.");
const db = createClient(process.env.SUPABASE_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const seed = JSON.parse(
  await readFile(
    new URL("../supabase/seed/members.json", import.meta.url),
    "utf8",
  ),
);
const existing = await db.from("members").select("id,email");
if (existing.error) throw new Error("Apply migrations first.");
const emails = new Set(existing.data.map((m) => normalizedEmail(m.email))),
  missing = seed.filter((m) => !emails.has(normalizedEmail(m.email)));
console.log(
  JSON.stringify({
    existing: existing.data.length,
    missing: missing.length,
    dryRun: !process.argv.includes("--apply"),
  }),
);
if (process.argv.includes("--apply")) {
  if (missing.length && !process.argv.includes("--allow-create"))
    throw new Error(
      "Creating missing seed members requires --allow-create. Existing UUIDs are never replaced.",
    );
  if (missing.length) {
    const result = await db.from("members").insert(missing);
    if (result.error)
      throw new Error("Seed failed; inspect conflicting IDs/emails.");
  }
  const result = await db.rpc("org_refresh_member_access");
  if (result.error) throw new Error("Cannot refresh trusted member access.");
  console.log("Seed complete. Existing member UUIDs and profiles preserved.");
}
