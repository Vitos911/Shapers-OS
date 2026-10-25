import { isDate } from "./model.ts";
import { addDays, isAdmin, ljubljanaDate, weekStart, type Snapshot, type TaskHistory, type Attendance, type Meeting } from "./organization.ts";

export const ACTIVITY_FIELDS = ["title", "description", "project_id", "status", "priority", "due_date", "assignee_id", "archived"] as const;
export function taskActivity(event: TaskHistory) {
  const before = event.changes.before;
  const after = event.changes.after;
  const changes = ACTIVITY_FIELDS.flatMap((field) => {
    if (!after || !(field in after)) return [];
    const previous = before?.[field] ?? null, next = after[field] ?? null;
    return !before || previous !== next ? [{ field, before: previous, after: next }] : [];
  });
  const kind = !after ? "unavailable" : before === null ? "created" : before && before.status !== "done" && after.status === "done" ? "completed"
    : before?.status === "done" && "status" in after && after.status !== "done" ? "reopened" : "updated";
  return { kind, changes };
}

export type HoursHistoryFilter = { from: string; to: string; member?: string; project?: string };
export function weeklyHoursHistory(s: Snapshot, filter: HoursHistoryFilter, now = new Date()) {
  if (!isDate(filter.from) || !isDate(filter.to) || filter.from > filter.to) return { error: "Izberi veljavno obdobje.", rows: [] };
  const start = weekStart(filter.from), last = weekStart(filter.to);
  if (Date.parse(last) - Date.parse(start) > 103 * 7 * 86400000) return { error: "Za tedensko zgodovino izberi največ 104 tedne.", rows: [] };
  const members = s.members.filter((m) => (isAdmin(s.identity.role) || m.id === s.identity.member_id) && (!filter.member || m.id === filter.member));
  const rows = [];
  const today = ljubljanaDate(now), currentWeek = weekStart(today);
  for (let week = last; week >= start; week = addDays(week, -7)) {
    if (week > currentWeek) continue;
    const end = addDays(week, 6);
    for (const member of members) {
      const aggregates = (s.weeklyHours || []).filter((h) => h.member_id === member.id && h.week_start === week && h.through_date <= today);
      const daily = s.work.filter((e) => e.member_id === member.id && !e.deleted && e.date >= week && e.date <= end && e.date <= today &&
        (!filter.project || e.project_id === filter.project) &&
        !aggregates.some((h) => e.date >= h.week_start && e.date <= h.through_date));
      const totals = filter.project ? [] : aggregates;
      const dailyHours = daily.reduce((sum, e) => sum + Number(e.hours), 0);
      const importedHours = totals.reduce((sum, h) => sum + Number(h.hours), 0);
      const goal = Number(member.weekly_hours) > 0 && Number.isFinite(Number(member.weekly_hours)) ? Number(member.weekly_hours) : null;
      rows.push({ member, week, end, hours: dailyHours + importedHours, dailyHours, importedHours, goal,
        hasRecords: daily.length + totals.length > 0, current: week === currentWeek,
        comparable: !filter.project && goal !== null });
    }
  }
  return { error: null, rows };
}

export type AttendanceHistoryFilter = { from?: string; to?: string; member?: string; series?: string; pastOnly?: boolean };
export function attendanceHistory(s: Snapshot, filter: AttendanceHistoryFilter, now = Date.now()): { error: string | null; rows: { record: Attendance; meeting: Meeting | undefined }[] } {
  if ((filter.from && !isDate(filter.from)) || (filter.to && !isDate(filter.to)) || (filter.from && filter.to && filter.from > filter.to)) return { error: "Izberi veljavno obdobje prisotnosti.", rows: [] };
  const meetings = new Map(s.meetings.map((meeting) => [meeting.id, meeting]));
  const rows = s.attendance.filter((record) => (isAdmin(s.identity.role) || record.member_id === s.identity.member_id) &&
    (!filter.member || record.member_id === filter.member)).flatMap<{ record: Attendance; meeting: Meeting | undefined }>((record) => {
    const meeting = meetings.get(record.meeting_id);
    // Missing meeting metadata cannot establish a date, series or past status.
    if (!meeting) return filter.from || filter.to || filter.series || filter.pastOnly ? [] : [{ record, meeting: undefined }];
    const day = ljubljanaDate(new Date(meeting.starts_at));
    if ((filter.series && meeting.series !== filter.series) || (filter.from && day < filter.from) ||
      (filter.to && day > filter.to) || (filter.pastOnly && Date.parse(meeting.ends_at) > now)) return [];
    return [{ record, meeting }];
  });
  rows.sort((a, b) => (b.meeting?.starts_at || "").localeCompare(a.meeting?.starts_at || "") || a.record.id.localeCompare(b.record.id));
  return { error: null, rows };
}
