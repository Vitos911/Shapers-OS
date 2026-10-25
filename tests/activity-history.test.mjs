import test from "node:test";
import assert from "node:assert/strict";
import { attendanceHistory, taskActivity, weeklyHoursHistory } from "../lib/activity-history.ts";
import { analytics } from "../lib/organization.ts";

const now = new Date("2026-10-25T12:00:00Z");
function snapshot(role = "MEMBER") {
  return { identity: { role, member_id: "me" }, members: [
    { id: "me", name: "Member", weekly_hours: 10 }, { id: "other", name: "Other", weekly_hours: 4 },
  ], projects: [], work: [], weeklyHours: [], meetings: [], attendance: [] };
}

test("task history derives creation and every tracked old/new field from the existing log", () => {
  const after = { title: "Task", status: "todo", priority: "medium", due_date: null, assignee_id: "me" };
  const created = taskActivity({ changes: { before: null, after } });
  assert.equal(created.kind, "created");
  assert.equal(created.changes.find((r) => r.field === "title").after, "Task");
  const updated = taskActivity({ changes: { before: after, after: { ...after, status: "in_progress", priority: "urgent", due_date: "2026-10-26", assignee_id: "other" } } });
  assert.deepEqual(updated.changes.map((r) => r.field), ["status", "priority", "due_date", "assignee_id"]);
  assert.deepEqual(updated.changes.at(-1), { field: "assignee_id", before: "me", after: "other" });
});
test("task completion and reopening remain distinct; clearing fields retains null", () => {
  assert.equal(taskActivity({ changes: { before: { status: "todo" }, after: { status: "done" } } }).kind, "completed");
  const reopened = taskActivity({ changes: { before: { status: "done", due_date: "2026-10-26" }, after: { status: "todo", due_date: null } } });
  assert.equal(reopened.kind, "reopened");
  assert.equal(reopened.changes.at(-1).after, null);
});
test("no-op and incomplete old logs do not invent task changes or creation", () => {
  assert.deepEqual(taskActivity({ changes: { before: { status: "todo" }, after: { status: "todo" } } }).changes, []);
  assert.equal(taskActivity({ changes: { after: { project_id: "p" } } }).kind, "updated");
  assert.equal(taskActivity({ changes: {} }).kind, "unavailable");
});
test("earlier history revealed to a reassigned task owner does not inflate dashboard completions", () => {
  const s = { ...snapshot(), tasks: [], meetingMembers: [], history: [{ task_id: "t", member_id: "me", old_status: "todo", new_status: "done", occurred_at: "2026-10-24T12:00Z", changes: { after: {} } }] };
  const filter = { from: "2026-10-19", to: "2026-10-25", member: "me" };
  const before = analytics(s, filter, "2026-10-25");
  s.history.push({ task_id: "previous", member_id: "other", old_status: "todo", new_status: "done", occurred_at: "2026-10-24T11:00Z", changes: { after: {} } });
  const after = analytics(s, filter, "2026-10-25");
  assert.equal(before.completed, 1);
  assert.deepEqual(after, before);
});
test("weekly hours combine imported coverage with later daily entries without double counting", () => {
  const s = snapshot();
  s.weeklyHours = [{ member_id: "me", week_start: "2026-10-19", through_date: "2026-10-21", hours: 5 }];
  s.work = [{ member_id: "me", date: "2026-10-20", hours: 5, deleted: false }, { member_id: "me", date: "2026-10-22", hours: 2.5, deleted: false }, { member_id: "me", date: "2026-10-23", hours: 8, deleted: true }];
  const row = weeklyHoursHistory(s, { from: "2026-10-21", to: "2026-10-24" }, now).rows[0];
  assert.equal(row.week, "2026-10-19"); assert.equal(row.end, "2026-10-25");
  assert.equal(row.hours, 7.5); assert.equal(row.goal, 10); assert.equal(row.current, true);
});
for (const role of ["MEMBER", "ADMIN", "SUPERADMIN"]) test(`hours history preserves ${role} member boundaries`, () => {
  const s = snapshot(role), f = { from: "2026-10-19", to: "2026-10-25" };
  assert.equal(weeklyHoursHistory(s, f, now).rows.length, role === "MEMBER" ? 1 : 2);
  assert.equal(weeklyHoursHistory(s, { ...f, member: "other" }, now).rows.length, role === "MEMBER" ? 0 : 1);
});
test("project hours exclude unallocated aggregates and are not compared to a whole-member goal", () => {
  const s = snapshot();
  s.weeklyHours = [{ member_id: "me", week_start: "2026-10-19", through_date: "2026-10-20", hours: 4 }];
  s.work = [{ member_id: "me", date: "2026-10-21", hours: 2, project_id: "p" }, { member_id: "me", date: "2026-10-22", hours: 3, project_id: "q" }];
  const row = weeklyHoursHistory(s, { from: "2026-10-19", to: "2026-10-25", project: "p" }, now).rows[0];
  assert.equal(row.hours, 2); assert.equal(row.importedHours, 0); assert.equal(row.comparable, false);
});
test("hours history validates ranges, limits excessive requests and marks absent evidence", () => {
  const s = snapshot();
  assert.ok(weeklyHoursHistory(s, { from: "2026-02-30", to: "2026-10-25" }, now).error);
  assert.ok(weeklyHoursHistory(s, { from: "2026-10-26", to: "2026-10-25" }, now).error);
  assert.ok(weeklyHoursHistory(s, { from: "2020-01-01", to: "2026-10-25" }, now).error);
  const row = weeklyHoursHistory(s, { from: "2026-10-19", to: "2026-10-25" }, now).rows[0];
  assert.equal(row.hasRecords, false);
  assert.equal(weeklyHoursHistory(s, { from: "2026-10-26", to: "2026-11-01" }, now).rows.length, 0);
});
test("Ljubljana Monday/DST boundaries and explicit zero-hour imports remain accurate", () => {
  const s = snapshot();
  s.weeklyHours = [{ member_id: "me", week_start: "2026-10-19", through_date: "2026-10-25", hours: 0 }];
  const before = weeklyHoursHistory(s, { from: "2026-10-19", to: "2026-10-26" }, new Date("2026-10-25T22:59:59Z"));
  assert.equal(before.rows.length, 1); assert.equal(before.rows[0].current, true); assert.equal(before.rows[0].hasRecords, true);
  const after = weeklyHoursHistory(s, { from: "2026-10-19", to: "2026-10-26" }, new Date("2026-10-25T23:00:00Z"));
  assert.equal(after.rows.length, 2); assert.equal(after.rows[0].week, "2026-10-26"); assert.equal(after.rows[1].current, false);
});
test("attendance supports all four saved statuses without inventing missing attendance", () => {
  const s = snapshot();
  s.meetings = [{ id: "meeting", starts_at: "2026-10-24T12:00:00Z", ends_at: "2026-10-24T13:00:00Z", series: "Community" }];
  s.attendance = ["present", "remote", "excused", "unexcused"].map((status, i) => ({ id: String(i), member_id: "me", meeting_id: "meeting", status }));
  const result = attendanceHistory(s, { pastOnly: true }, now.getTime());
  assert.deepEqual(result.rows.map((r) => r.record.status), ["present", "remote", "excused", "unexcused"]);
  s.attendance = []; assert.equal(attendanceHistory(s, {}, now.getTime()).rows.length, 0);
});
test("attendance filters member, inclusive local dates, series and genuinely ended meetings", () => {
  const s = snapshot("ADMIN");
  s.meetings = [{ id: "m", starts_at: "2026-10-24T22:30:00Z", ends_at: "2026-10-24T23:30:00Z", series: "Community" }, { id: "f", starts_at: "2026-10-26T12:00:00Z", ends_at: "2026-10-26T13:00:00Z", series: "Community" }];
  s.attendance = [{ id: "a", member_id: "other", meeting_id: "m", status: "remote" }, { id: "f", member_id: "other", meeting_id: "f", status: "excused" }];
  const filter = { from: "2026-10-25", to: "2026-10-25", member: "other", series: "Community", pastOnly: true };
  assert.equal(attendanceHistory(s, filter, now.getTime()).rows.length, 1);
  assert.equal(attendanceHistory(s, { ...filter, series: "Grants" }, now.getTime()).rows.length, 0);
  s.identity.role = "MEMBER"; assert.equal(attendanceHistory(s, filter, now.getTime()).rows.length, 0);
  s.identity.role = "SUPERADMIN"; assert.equal(attendanceHistory(s, filter, now.getTime()).rows.length, 1);
});
test("attendance rejects invalid date ranges and does not fabricate missing meeting dates", () => {
  const s = snapshot(); s.attendance = [{ id: "a", member_id: "me", meeting_id: "missing", status: "present" }];
  assert.equal(attendanceHistory(s, {}).rows.length, 1);
  assert.equal(attendanceHistory(s, { pastOnly: true }).rows.length, 0);
  assert.equal(attendanceHistory(s, { from: "2026-10-01" }).rows.length, 0);
  assert.ok(attendanceHistory(s, { from: "2026-10-25", to: "2026-10-01" }).error);
});
