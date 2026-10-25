import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { auditSnapshot, auditMemberScope } from "../lib/data-readiness.ts";
const members = JSON.parse(await readFile(new URL("../supabase/seed/members.json", import.meta.url)));
const hours = JSON.parse(await readFile(new URL("../supabase/seed/weekly-hours.json", import.meta.url)));
const attendance = JSON.parse(await readFile(new URL("../supabase/seed/attendance-pending-calendar.json", import.meta.url)));
const source = { members, hours, attendance };
const id = members[0].id;
const fixture = () => ({
  identity: { user_id: "auth", role: "ADMIN", member_id: id },
  members: members.map((m) => ({ ...m, auth_user_id: `auth-${m.id}` })),
  projects: [], tasks: [], work: [], history: [], meetings: [], attendance: [], projectMembers: [], meetingMembers: [],
  weeklyHours: hours.map((h, i) => ({ ...h, id: `week-${i}`, member_id: members.find((m) => m.email === h.email).id })),
});
const check = (s, name) => auditSnapshot(s, source, new Date("2026-10-25T10:00:00Z")).checks.find((c) => c.check === name);

test("source audit detects missing/changed source totals and daily double counting", () => {
  const s = fixture();
  assert.equal(check(s, "All 120 source totals and coverage dates match").status, "PASS");
  assert.equal(check(s, "Dashboard analytics reconcile with stored totals").actual, 1705.5);
  s.weeklyHours[0].hours = 1;
  assert.equal(check(s, "All 120 source totals and coverage dates match").status, "FAIL");
  s.weeklyHours.pop();
  assert.equal(check(s, "Every member has all six source weeks").status, "FAIL");
  s.work.push({ id: "overlap", member_id: id, project_id: null, date: "2026-09-14", hours: 1, description: "", deleted: false });
  assert.equal(check(s, "No daily/weekly double counting").status, "FAIL");
});

test("audit flags future presence and fake/mismatched task history without printing record data", () => {
  const s = fixture();
  s.meetings.push({ id: "meeting", calendar_id: "cal", google_event_id: "event", series: "Community", starts_at: "2026-11-05T10:00:00Z", ends_at: "2026-11-05T11:00:00Z" });
  s.attendance.push({ id: "attendance", meeting_id: "meeting", member_id: id, status: "present", note: "private note" });
  assert.equal(check(s, "No presence recorded before a future meeting").status, "FAIL");
  s.tasks.push({ id: "task", project_id: "project", assignee_id: id, status: "done", completed_at: "2026-10-24T10:00:00Z" });
  s.history.push({ id: "history", task_id: "task", member_id: id, old_status: "todo", new_status: "done", occurred_at: "2026-10-24T10:00:00Z", changes: { before: { status: "todo" }, after: { id: "task", status: "todo" } } });
  assert.equal(check(s, "History matches recorded before/after events").status, "FAIL");
  s.history[0].changes.after.status = "done";
  assert.equal(check(s, "History matches recorded before/after events").status, "PASS");
  const output = JSON.stringify(auditSnapshot(s, source));
  assert.ok(!output.includes(members[0].email));
  assert.ok(!output.includes("private note"));
  assert.equal(check(s, "Live Google API and current sync authorization").status, "NOT VERIFIED");
});

test("member scope detects leaked and omitted records rather than accepting empty filtered views", () => {
  const admin = fixture();
  const member = { ...fixture(), identity: { role: "MEMBER", member_id: id }, members: admin.members.filter((m) => m.id === id), weeklyHours: admin.weeklyHours.filter((h) => h.member_id === id) };
  assert.ok(Object.values(auditMemberScope(member, admin)).every(Boolean));
  member.weeklyHours = [];
  assert.equal(auditMemberScope(member, admin).ownHours, false);
  member.members = admin.members;
  assert.equal(auditMemberScope(member, admin).profile, false);
  member.work.push({ id: "leak", member_id: "someone-else" });
  assert.equal(auditMemberScope(member, admin).ownHours, false);
});
