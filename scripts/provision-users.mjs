import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizedEmail } from "../lib/imports.ts";
const args = process.argv.slice(2),
  apply = args.includes("--apply"),
  demo = args.includes("--demo");
const key = process.env.SUPABASE_SECRET_KEY;
if (!key)
  throw new Error(
    "Set server-only SUPABASE_SECRET_KEY in .env.local; never use a publishable key here.",
  );
const db = createClient(process.env.SUPABASE_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: members, error } = await db.from("members").select("*");
if (error) throw new Error("Cannot read existing members");
const accounts = [];
for (let page = 1; page <= 100; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error("Auth admin access failed");
  accounts.push(...data.users);
  if (data.users.length < 200) break;
  if (page === 100) throw new Error("User pagination limit reached");
}
const users = new Map();
for (const user of accounts) {
  const email = normalizedEmail(user.email || "");
  if (users.has(email))
    throw new Error("Duplicate normalized Auth email; resolve manually");
  users.set(email, user);
}
const file = resolve(".private/demo-credentials.json");
let credentials = [];
try {
  credentials = JSON.parse(await readFile(file, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (demo && process.env.DEMO_AUTH_ENABLED !== "true")
  throw new Error("Demo provisioning requires explicit DEMO_AUTH_ENABLED=true");
for (const member of members) {
  const email = normalizedEmail(member.email),
    existing = users.get(email);
  if (member.auth_user_id && existing?.id !== member.auth_user_id)
    throw new Error("Existing Auth link conflicts with normalized email");
  if (!existing && !demo) {
    console.log("Pending invitation:", email);
    if (apply) {
      if (email.endsWith("@sandbox.example"))
        throw new Error(
          "Fictional sandbox addresses require --demo; no email will be sent",
        );
      const invite = await db.auth.admin.inviteUserByEmail(email);
      if (invite.error) throw new Error("Invitation failed");
    }
    continue;
  }
  if (!apply) continue;
  let user = existing;
  if (!user) {
    if (!email.endsWith("@sandbox.example"))
      throw new Error("Demo cannot auto-confirm real addresses");
    const password = randomBytes(32).toString("base64url");
    // Persist the random credential BEFORE creating its Auth account. Reruns never rotate existing passwords.
    credentials = credentials.filter((c) => c.email !== email);
    credentials.push({ email, password });
    await mkdir(resolve(".private"), { recursive: true });
    await writeFile(file, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
    });
    const result = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (result.error)
      throw new Error("Demo account creation failed; no credentials printed");
    user = result.data.user;
    users.set(email, user);
  }
  if (!user.email_confirmed_at) continue;
  const linked = await db
    .from("members")
    .update({ auth_user_id: user.id })
    .eq("id", member.id)
    .or(`auth_user_id.is.null,auth_user_id.eq.${user.id}`);
  if (linked.error) throw new Error("Member linking failed");
}
if (apply) {
  const refreshed = await db.rpc("org_refresh_member_access");
  if (refreshed.error)
    throw new Error("Apply organization_provisioning migration first");
}
if (args.includes("--bootstrap-file")) {
  const at = args.indexOf("--bootstrap-file"),
    emails = JSON.parse(await readFile(args[at + 1], "utf8"));
  if (!Array.isArray(emails) || emails.some((e) => typeof e !== "string"))
    throw new Error(
      "Bootstrap file must be an explicit JSON array of approved real email addresses",
    );
  if (apply) {
    const result = await db.rpc("org_bootstrap_access", { emails });
    if (result.error) throw new Error("Superadmin bootstrap rejected");
  }
}
console.log(
  JSON.stringify({
    dryRun: !apply,
    members: members.length,
    existingAuth: accounts.length,
    demo,
    credentialsLocation:
      demo && apply ? ".private/demo-credentials.json" : null,
  }),
);
