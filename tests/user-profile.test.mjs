import test from "node:test";
import assert from "node:assert/strict";
import { ownProfile } from "../lib/user-profile.ts";

const member = { id: "own-member", name: "Član Shapers", email: "member@fixture.invalid", tier: "2", weekly_hours: 4, series: "Community;Shapers Tech" };
const snapshot = (identity = {}) => ({
  identity: { user_id: "own-user", email: "verified@fixture.invalid", role: "MEMBER", member_id: member.id, ...identity },
  members: [{ ...member, id: "other-member", name: "Someone Else" }, member],
  settings: { name: "Shapers OS" },
});
const user = { id: "own-user", user_metadata: { full_name: "Google Display Name", role: "SUPERADMIN", member_id: "other-member" }, app_metadata: { providers: ["google", "email"] }, created_at: "2026-10-24T12:00:00Z", email_confirmed_at: "2026-10-24T12:00:00Z" };

test("profile uses only the verified member mapping and role, never editable metadata", () => {
  const profile = ownProfile(snapshot(), user);
  assert.equal(profile.member, member);
  assert.equal(profile.name, member.name);
  assert.equal(profile.role, "MEMBER");
  assert.equal(profile.email, "verified@fixture.invalid");
  assert.deepEqual(profile.providers, ["Google", "E-pošta"]);
});
test("all roles without a member mapping show their own account without another member's data", () => {
  for (const role of ["MEMBER", "ADMIN", "SUPERADMIN"]) {
    const profile = ownProfile(snapshot({ role, member_id: null }), user);
    assert.equal(profile.member, null);
    assert.equal(profile.name, "Google Display Name");
    assert.equal(profile.role, role);
  }
  assert.equal(ownProfile(snapshot({ member_id: "missing" }), user).member, null);
});
test("mismatched Auth identity cannot display a different user's snapshot as a personal profile", () => {
  assert.equal(ownProfile(snapshot(), { ...user, id: "different-user" }), null);
});
test("missing or malformed optional account metadata has a safe display fallback", () => {
  const profile = ownProfile(snapshot({ member_id: null }), { ...user, user_metadata: { full_name: {} }, app_metadata: { providers: [null, 7, "google", "google"] } });
  assert.equal(profile.name, "verified");
  assert.deepEqual(profile.providers, ["Google"]);
  assert.equal(profile.initials, "V");
});
