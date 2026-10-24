import { createClient } from "@supabase/supabase-js";
const args = process.argv.slice(2),
  option = (name) => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args[at + 1];
  };
const email = option("--email")?.trim().toLowerCase(),
  sandbox = option("--sandbox-email")?.trim().toLowerCase(),
  role = option("--role"),
  remove = args.includes("--unlink"),
  apply = args.includes("--apply");
if (
  !email ||
  email.endsWith("@sandbox.example") ||
  (!remove &&
    (!sandbox?.endsWith("@sandbox.example") ||
      !["MEMBER", "ADMIN", "SUPERADMIN"].includes(role)))
)
  throw new Error(
    "Usage: node --env-file=.env.local scripts/link-demo-account.mjs --email REAL --sandbox-email FICTIONAL --role MEMBER|ADMIN|SUPERADMIN [--apply]; or --email REAL --unlink [--apply]",
  );
if (process.env.DEMO_AUTH_ENABLED !== "true")
  throw new Error(
    "Demo linking requires explicit DEMO_AUTH_ENABLED=true; no changes made",
  );
if (!process.env.SUPABASE_SECRET_KEY)
  throw new Error("Server-only SUPABASE_SECRET_KEY required");
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
console.log(
  JSON.stringify({
    dryRun: !apply,
    email,
    sandboxEmail: sandbox,
    explicitRole: role,
    unlink: remove,
  }),
);
if (apply) {
  const result = await client.rpc(
    remove ? "org_remove_demo_link" : "org_approve_demo_link",
    remove
      ? { real_email: email }
      : { real_email: email, sandbox_email: sandbox, approved_role: role },
  );
  if (result.error) throw new Error("Link rejected: " + result.error.message);
  console.log(
    remove
      ? "Mapping removed; non-superadmin alias disabled."
      : "Approved mapping saved; original member UUID, fictional login and role boundaries preserved.",
  );
}
