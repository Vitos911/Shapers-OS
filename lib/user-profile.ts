import type { User } from "@supabase/supabase-js";
import type { Snapshot } from "./organization.ts";

type Account = Pick<User, "id" | "user_metadata" | "app_metadata" | "created_at" | "last_sign_in_at" | "email_confirmed_at">;

// Display metadata never grants a role or links an organization member.
export function ownProfile(snapshot: Snapshot, account: Account) {
  if (snapshot.identity.user_id !== account.id) return null;
  const identity = snapshot.identity;
  const member = identity.member_id
    ? snapshot.members.find((m) => m.id === identity.member_id) ?? null
    : null;
  const displayName = account.user_metadata?.full_name;
  const name = member?.name ||
    (typeof displayName === "string" && displayName.trim()
      ? displayName.trim().slice(0, 160)
      : identity.email.split("@")[0]);
  const providers: string[] = Array.isArray(account.app_metadata?.providers)
    ? account.app_metadata.providers.filter((p: unknown): p is string => typeof p === "string")
    : [];
  return {
    name,
    initials: name.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] || "").join("").toLocaleUpperCase("sl"),
    email: identity.email,
    role: identity.role,
    organization: snapshot.settings.name,
    member,
    emailConfirmed: !!account.email_confirmed_at,
    providers: [...new Set(providers.map((p) => p === "google" ? "Google" : p === "email" ? "E-pošta" : "Povezan račun"))],
    createdAt: account.created_at,
    lastSignInAt: account.last_sign_in_at,
  };
}
