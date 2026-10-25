import {
  analytics, eligibleMeeting, ljubljanaDate, SERIES,
  type Snapshot,
} from "./organization.ts";

export type ReadinessCheck = {
  area: string;
  check: string;
  status: "PASS" | "FAIL" | "NOT VERIFIED";
  actual: number | string;
};
export type ReadinessSources = {
  members: Record<string, unknown>[];
  hours: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
};
export function auditSnapshot(s: Snapshot, source: ReadinessSources, now = new Date()) {
  const checks: ReadinessCheck[] = [];
  const check = (area: string, name: string, valid: boolean, actual: number | string) =>
    checks.push({ area, check: name, status: valid ? "PASS" : "FAIL", actual });
  const members = new Map(s.members.map((m) => [m.id, m]));
  const projects = new Set(s.projects.map((p) => p.id));
  const meetings = new Map(s.meetings.map((m) => [m.id, m]));
  const tasks = new Map(s.tasks.map((t) => [t.id, t]));
  const duplicates = <T>(rows: T[], key: (row: T) => string) =>
    rows.length - new Set(rows.map(key)).size;
  const target: Record<string, number> = { "GO!": 4, Impact: 10, Core: 70 };
  check("Members", "20 members", s.members.length === 20, s.members.length);
  const mismatches = source.members.filter((m) => {
    const actual = members.get(String(m.id));
    return !actual || ["email", "tier", "weekly_hours", "series"].some(
      (key) => String(actual[key as keyof typeof actual]) !== String(m[key]),
    );
  }).length;
  check("Members", "Source identities, memberships and targets preserved", mismatches === 0, mismatches);
  const invalidTier = s.members.filter((m) => Number(m.weekly_hours) !== target[m.tier]).length;
  check("Members", "GO!=4h; Impact=10h; Core=70h", invalidTier === 0, invalidTier);
  check("Members", "Every member has an Auth link", s.members.every((m) => !!m.auth_user_id), s.members.filter((m) => !!m.auth_user_id).length);
  const duplicateMembers = duplicates(s.members, (m) => m.email.trim().toLowerCase()) + duplicates(s.members.filter((m) => m.auth_user_id), (m) => m.auth_user_id!);
  check("Members", "No duplicate normalized emails or primary Auth links", duplicateMembers === 0, duplicateMembers);

  check("Projects", "10 demo projects available", s.projects.length === 10, s.projects.length);
  const names = duplicates(s.projects, (p) => p.name.trim().toLowerCase());
  check("Projects", "No duplicate project names (review candidates)", names === 0, names);
  const invalidProjectLinks = s.projectMembers.filter((p) => !projects.has(p.project_id) || !members.has(p.member_id)).length;
  check("Projects", "Project memberships reference existing records", invalidProjectLinks === 0, invalidProjectLinks);

  const invalidTasks = s.tasks.filter((t) => !projects.has(t.project_id) || (t.assignee_id && !members.has(t.assignee_id))).length;
  check("Tasks", "Task foreign keys resolve", invalidTasks === 0, invalidTasks);
  check("Tasks", "Assigned task available", s.tasks.some((t) => !!t.assignee_id), s.tasks.filter((t) => !!t.assignee_id).length);
  check("Tasks", "Open and completed tasks available for demo", s.tasks.some((t) => !t.archived && t.status !== "done") && s.tasks.some((t) => t.status === "done"), s.tasks.map((t) => t.status).join(", ") || "empty");
  const brokenHistory = s.history.filter((h) => {
    const after = h.changes.after as Record<string, unknown> | undefined;
    const before = (h.changes as { before?: Record<string, unknown> }).before;
    return !tasks.has(h.task_id) || (!!h.member_id && !members.has(h.member_id)) ||
      !after || after.id !== h.task_id || after.status !== h.new_status ||
      (before ? before.status !== h.old_status : h.old_status !== null) ||
      !Number.isFinite(Date.parse(h.occurred_at)) || Date.parse(h.occurred_at) > now.getTime();
  }).length;
  check("Tasks", "History matches recorded before/after events", brokenHistory === 0, brokenHistory);
  const missingHistory = s.tasks.filter((t) => {
    const history = s.history.filter((h) => h.task_id === t.id).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    return !history.length || history.at(-1)!.new_status !== t.status ||
      (t.status === "done" && !history.some((h) => h.new_status === "done" && h.old_status !== "done" && Date.parse(h.occurred_at) === Date.parse(t.completed_at || "")));
  }).length;
  check("Tasks", "Current status and completion timestamp have history", missingHistory === 0, missingHistory);

  const sourceHoursMismatch = source.hours.filter((h) => !s.weeklyHours.some((v) =>
    members.get(v.member_id)?.email === h.email && v.week_start === h.week_start &&
    v.through_date === h.through_date && Number(v.hours) === Number(h.hours),
  )).length;
  check("Hours", "All 120 source totals and coverage dates match", sourceHoursMismatch === 0 && source.hours.length === 120, sourceHoursMismatch);
  const weeks = new Set(source.hours.map((h) => String(h.week_start)));
  check("Hours", "Every member has all six source weeks", s.members.every((m) => [...weeks].every((week) => s.weeklyHours.some((h) => h.member_id === m.id && h.week_start === week))) && weeks.size === 6, weeks.size);
  const active = s.work.filter((w) => !w.deleted);
  const invalidHours = [...active, ...s.weeklyHours].filter((h) => !members.has(h.member_id) || !Number.isFinite(Number(h.hours)) || Number(h.hours) < 0 || !Number.isInteger(Number(h.hours) * 4)).length + active.filter((h) => (h.project_id && !projects.has(h.project_id)) || h.date > ljubljanaDate(now)).length;
  check("Hours", "Valid members, projects, quarter-hours and dates", invalidHours === 0, invalidHours);
  const overlaps = active.filter((w) => s.weeklyHours.some((h) => h.member_id === w.member_id && w.date >= h.week_start && w.date <= h.through_date)).length;
  check("Hours", "No daily/weekly double counting", overlaps === 0, overlaps);
  const duplicateHours = duplicates(s.weeklyHours, (h) => `${h.member_id}/${h.week_start}`) + duplicates(active, (h) => JSON.stringify([h.member_id, h.project_id, h.date, Number(h.hours), h.description]));
  check("Hours", "No duplicate weeks or identical daily records (review candidates)", duplicateHours === 0, duplicateHours);
  const range = { from: [...weeks].sort()[0], to: ljubljanaDate(now) };
  const metrics = analytics(s, range, ljubljanaDate(now));
  const expectedHours = active.filter((w) => w.date >= range.from && w.date <= range.to).reduce((n, w) => n + Number(w.hours), 0) + s.weeklyHours.filter((h) => h.week_start >= range.from && h.through_date <= range.to).reduce((n, h) => n + Number(h.hours), 0);
  check("Hours", "Dashboard analytics reconcile with stored totals", metrics.hours === expectedHours && metrics.rows.reduce((n, m) => n + m.hours, 0) === expectedHours, metrics.hours);

  const attendanceKey = (email: unknown, series: unknown, date: unknown) => JSON.stringify([email, series, date]);
  const actualAttendance = new Map(s.attendance.map((a) => {
    const meeting = meetings.get(a.meeting_id);
    return [attendanceKey(members.get(a.member_id)?.email, meeting?.series, meeting ? ljubljanaDate(new Date(meeting.starts_at)) : ""), a.status];
  }));
  const missingAttendance = source.attendance.filter((a) => actualAttendance.get(attendanceKey(a.email, a.series, a.date)) !== (a.status || a.state)).length;
  check("Attendance", "All 258 source records retain their status", missingAttendance === 0 && source.attendance.length === 258, missingAttendance);
  const invalidAttendance = s.attendance.filter((a) => !members.has(a.member_id) || !meetings.has(a.meeting_id)).length;
  check("Attendance", "Attendance members and meetings resolve", invalidAttendance === 0, invalidAttendance);
  const ineligible = s.attendance.filter((a) => {
    const m = members.get(a.member_id), e = meetings.get(a.meeting_id);
    return m && e && !eligibleMeeting(m, e, s.meetingMembers.some((r) => r.member_id === m.id && r.meeting_id === e.id));
  }).length;
  check("Attendance", "Recorded members are eligible for meetings", ineligible === 0, ineligible);
  const future = s.attendance.filter((a) => ["present", "remote"].includes(a.status) && Date.parse(meetings.get(a.meeting_id)?.starts_at || "") > now.getTime()).length;
  check("Attendance", "No presence recorded before a future meeting", future === 0, future);
  const duplicateAttendance = duplicates(s.attendance, (a) => `${a.meeting_id}/${a.member_id}`);
  check("Attendance", "No duplicate member/meeting records", duplicateAttendance === 0, duplicateAttendance);

  const invalidMeetings = s.meetings.filter((e) => !Number.isFinite(Date.parse(e.starts_at)) || !Number.isFinite(Date.parse(e.ends_at)) || Date.parse(e.ends_at) <= Date.parse(e.starts_at)).length;
  check("Calendar", "Meeting dates and durations valid", invalidMeetings === 0, invalidMeetings);
  const invalidParticipants = s.meetingMembers.filter((a) => !members.has(a.member_id) || !meetings.has(a.meeting_id)).length;
  check("Calendar", "Participant references resolve", invalidParticipants === 0, invalidParticipants);
  check("Calendar", "All six meeting series present", SERIES.every((v) => s.meetings.some((e) => e.series === v)), new Set(s.meetings.map((e) => e.series)).size);
  const duplicateMeetings = duplicates(s.meetings, (e) => `${e.calendar_id}/${e.google_event_id}`);
  check("Calendar", "No duplicate calendar/event identities", duplicateMeetings === 0, duplicateMeetings);
  const duplicateParticipants = duplicates(s.meetingMembers, (a) => `${a.meeting_id}/${a.member_id}`);
  check("Calendar", "No duplicate participant links", duplicateParticipants === 0, duplicateParticipants);
  checks.push({ area: "Calendar", check: "Live Google API and current sync authorization", status: "NOT VERIFIED", actual: "Persisted references alone do not establish live Google access" });
  return { checks, totals: { members: s.members.length, projects: s.projects.length, tasks: s.tasks.length, history: s.history.length, weeklyRecords: s.weeklyHours.length, historicalHours: s.weeklyHours.reduce((n, h) => n + Number(h.hours), 0), dailyHours: active.reduce((n, h) => n + Number(h.hours), 0), weeklyHours: metrics.weeklyHours, meetings: s.meetings.length, attendance: s.attendance.length, participants: s.meetingMembers.length } };
}

export function auditMemberScope(member: Snapshot, admin: Snapshot) {
  const id = member.identity.member_id;
  const own = <T extends { member_id: string | null }>(rows: T[]) => rows.every((r) => r.member_id === id);
  const same = <T extends { id: string }>(a: T[], b: T[]) => a.length === b.length && a.every((r) => b.some((v) => r.id === v.id));
  const accessibleProjects = admin.projects.filter((p) => admin.projectMembers.some((a) => a.project_id === p.id && a.member_id === id) || admin.tasks.some((t) => t.project_id === p.id && t.assignee_id === id));
  const m = admin.members.find((m) => m.id === id);
  const eligible = m ? admin.meetings.filter((e) => eligibleMeeting(m, e, admin.meetingMembers.some((a) => a.meeting_id === e.id && a.member_id === id))) : [];
  return {
    role: member.identity.role === "MEMBER" && !!id,
    profile: member.members.length === 1 && member.members[0].id === id,
    ownHours: own(member.work) && own(member.weeklyHours) && same(member.weeklyHours, admin.weeklyHours.filter((h) => h.member_id === id)) && same(member.work, admin.work.filter((h) => h.member_id === id)),
    ownTasks: member.tasks.every((t) => t.assignee_id === id) && same(member.tasks, admin.tasks.filter((t) => t.assignee_id === id)),
    ownHistory: own(member.history) && same(member.history, admin.history.filter((h) => h.member_id === id)),
    ownAttendance: own(member.attendance) && same(member.attendance, admin.attendance.filter((h) => h.member_id === id)),
    ownAssignments: own(member.projectMembers) && own(member.meetingMembers),
    visibleProjects: same(member.projects, accessibleProjects),
    eligibleMeetings: same(member.meetings, eligible),
  };
}
