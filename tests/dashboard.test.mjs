import test from "node:test";
import assert from "node:assert/strict";
import { dashboardTasks, dashboardMeetings } from "../components/dashboard/dashboard-data.ts";
import { analytics, ljubljanaDate, weekStart } from "../lib/organization.ts";

const task = (id, fields = {}) => ({ id, title: id, assignee_id: "me", status: "todo", priority: "medium", due_date: null, archived: false, ...fields });
const snapshot = (fields = {}) => ({ identity: { role: "MEMBER", member_id: "me" }, members: [], projects: [], tasks: [], meetings: [], work: [], weeklyHours: [], history: [], attendance: [], meetingMembers: [], ...fields });

test("dashboard orders own open tasks by overdue, urgent, dated, then undated without mutating snapshot", () => {
  const s = snapshot({ tasks: [task("undated"), task("due-soon", { due_date: "2026-10-25" }), task("urgent", { priority: "urgent" }), task("overdue", { due_date: "2026-10-23" }), task("later", { due_date: "2026-10-30" }), task("foreign", { assignee_id: "other" }), task("archived", { archived: true }), task("done", { status: "done" })] });
  const order = s.tasks.map((t) => t.id);
  assert.deepEqual(dashboardTasks(s, "2026-10-24").map((t) => t.id), ["overdue", "urgent", "due-soon", "later", "undated"]);
  assert.deepEqual(s.tasks.map((t) => t.id), order);
});

test("an administrator without a member profile never receives unassigned tasks as personal tasks", () => {
  assert.deepEqual(dashboardTasks(snapshot({ identity: { role: "SUPERADMIN", member_id: null }, tasks: [task("unassigned", { assignee_id: null })] })), []);
});

test("dashboard includes ongoing organizational meetings, excludes past/cancelled, and preserves stored references", () => {
  const meeting = (id, starts_at, ends_at, cancelled = false) => ({ id, starts_at, ends_at, cancelled, google_event_id: `google-${id}` });
  const s = snapshot({ meetings: [meeting("next", "2026-10-25T17:00:00+01:00", "2026-10-25T18:00:00+01:00"), meeting("past", "2026-10-24T08:00:00Z", "2026-10-24T09:00:00Z"), meeting("ongoing", "2026-10-24T10:00:00Z", "2026-10-24T12:00:00Z"), meeting("cancelled", "2026-10-24T14:00:00Z", "2026-10-24T15:00:00Z", true)] });
  const result = dashboardMeetings(s, Date.parse("2026-10-24T11:00:00Z"));
  assert.deepEqual(result.map((e) => e.id), ["ongoing", "next"]);
  assert.equal(result[0], s.meetings[2]);
});

test("personal weekly progress reuses historical aggregate plus uncovered entries across Ljubljana week boundary", () => {
  const today = ljubljanaDate(new Date("2026-10-25T23:30:00Z"));
  assert.equal(today, "2026-10-26");
  assert.equal(weekStart(today), "2026-10-26");
  const s = snapshot({ members: [{ id: "me", weekly_hours: 10 }, { id: "other", weekly_hours: 4 }],
    work: [{ member_id: "me", date: today, hours: 1.5 }, { member_id: "other", date: today, hours: 20 }, { member_id: "me", date: today, hours: 5, deleted: true }],
    weeklyHours: [{ member_id: "me", week_start: "2026-10-19", through_date: "2026-10-23", hours: 8 }],
  });
  assert.equal(analytics(s, { from: weekStart(today), to: today, member: "me" }, today).weeklyHours, 1.5);
  assert.equal(analytics(s, { from: "2026-10-19", to: "2026-10-25", member: "me" }, "2026-10-25").weeklyHours, 8);
});
