export const ROLES = ["MEMBER", "ADMIN", "SUPERADMIN"] as const;
export type Role = (typeof ROLES)[number];
export type Identity = {
  user_id: string;
  email: string;
  role: Role;
  member_id: string | null;
};
export type OrgMember = {
  id: string;
  name: string;
  email: string;
  tier: string;
  weekly_hours: number;
  series: string;
  auth_user_id: string | null;
};
export type OrgProject = {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
};
export type OrgTask = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  assignee_id: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  archived: boolean;
  completed_at: string | null;
  updated_at: string;
};
export type WorkEntry = {
  id: string;
  member_id: string;
  project_id: string | null;
  date: string;
  hours: number;
  description: string;
  deleted: boolean;
};
export type WeeklyHours = {
  id: string;
  member_id: string;
  week_start: string;
  through_date: string;
  hours: number;
  source: string;
};
export type Meeting = {
  id: string;
  calendar_id: string;
  google_event_id: string;
  title: string;
  description: string;
  series: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  meeting_url: string;
  cancelled: boolean;
  synced_at: string;
};
export type Attendance = {
  id: string;
  meeting_id: string;
  member_id: string;
  status: string;
  note: string;
};
export type TaskHistory = {
  id: string;
  task_id: string;
  member_id: string | null;
  old_status: string | null;
  new_status: string;
  occurred_at: string;
  changes: { after?: { project_id?: string } };
};
export type Snapshot = {
  identity: Identity;
  members: OrgMember[];
  projects: OrgProject[];
  tasks: OrgTask[];
  work: WorkEntry[];
  weeklyHours: WeeklyHours[];
  meetings: Meeting[];
  attendance: Attendance[];
  history: TaskHistory[];
  projectMembers: { project_id: string; member_id: string }[];
  taskDirectory: { id: string; name: string; project_id: string }[];
  meetingMembers: { meeting_id: string; member_id: string }[];
  settings: { name: string; calendar_id: string; timezone: string };
  calendar: { configured: boolean; syncReady: boolean };
};
export const TASK_STATUSES = ["backlog", "todo", "in_progress", "done"];
export const PRIORITIES = ["low", "medium", "high", "urgent"];
export const SERIES = [
  "Summer School",
  "Grants",
  "Shape Talks",
  "Community",
  "Shapers Tech",
  "Shapers Voice",
];
export const TZ = "Europe/Ljubljana";
export const isAdmin = (role: Role) =>
  role === "ADMIN" || role === "SUPERADMIN";
export const canManageTask = (
  actor: Identity,
  task: Pick<OrgTask, "assignee_id">,
) =>
  isAdmin(actor.role) ||
  (!!actor.member_id && actor.member_id === task.assignee_id);
export const canViewMemberAnalytics = (actor: Identity, id: string) =>
  isAdmin(actor.role) || actor.member_id === id;
export function ljubljanaDate(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}
export function weekStart(day = ljubljanaDate()): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function addDays(day: string, count: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function midnightInLjubljana(day: string): string {
  const wall = new Date(day + "T00:00:00Z").getTime();
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat("sv-SE", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const v = (k: string) => p.find((x) => x.type === k)!.value;
    const rendered = Date.parse(
      `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}Z`,
    );
    instant += wall - rendered;
  }
  return new Date(instant).toISOString();
}
export function eligibleMeeting(
  member: OrgMember,
  meeting: Pick<Meeting, "series">,
  explicitlyAssigned = false,
) {
  return (
    meeting.series === "Community" ||
    member.series
      .split(";")
      .map((x) => x.trim())
      .includes(meeting.series) ||
    explicitlyAssigned
  );
}
export function selfCheckInAllowed(
  event: Pick<Meeting, "starts_at" | "ends_at" | "all_day" | "cancelled">,
  now = Date.now(),
) {
  return (
    !event.cancelled &&
    !event.all_day &&
    now >= Date.parse(event.starts_at) - 30 * 60000 &&
    now <= Date.parse(event.ends_at) + 2 * 3600000
  );
}
export type AnalyticsFilter = {
  from: string;
  to: string;
  member?: string;
  tier?: string;
  project?: string;
};
export function analytics(
  s: Snapshot,
  f: AnalyticsFilter,
  today = ljubljanaDate(),
) {
  const included = s.members.filter(
    (m) => (!f.member || m.id === f.member) && (!f.tier || m.tier === f.tier),
  );
  const ids = new Set(included.map((m) => m.id));
  const inRange = (d: string) => d >= f.from && d <= f.to;
  const historical = (s.weeklyHours || []).filter((h) => ids.has(h.member_id));
  const covered = (e: WorkEntry) => historical.some(h => h.member_id === e.member_id && e.date >= h.week_start && e.date <= h.through_date);
  const overlapEntries = s.work.filter(e => !e.deleted && ids.has(e.member_id) && inRange(e.date) && covered(e)).length;
  const entries = s.work.filter(
    (e) =>
      !e.deleted &&
      !covered(e) &&
      ids.has(e.member_id) &&
      (!f.project || e.project_id === f.project),
  );
  const work = entries.filter((e) => inRange(e.date));
  const includedHistorical = historical.filter(
    (h) => !f.project && h.week_start >= f.from && h.through_date <= f.to,
  );
  const partialWeeks = historical.filter(
    (h) =>
      !f.project &&
      h.week_start <= f.to &&
      h.through_date >= f.from &&
      !includedHistorical.includes(h),
  ).length;
  const tasks = s.tasks.filter(
    (t) =>
      !t.archived &&
      (!f.project || t.project_id === f.project) &&
      ((!f.member && !f.tier) || (!!t.assignee_id && ids.has(t.assignee_id))),
  );
  const latestCompletion = new Map<string, TaskHistory>();
  for (const h of s.history) {
    if (h.new_status === "done" && h.old_status !== "done" &&
        (!latestCompletion.has(h.task_id) || h.occurred_at > latestCompletion.get(h.task_id)!.occurred_at)) latestCompletion.set(h.task_id, h);
  }
  const completions = [...latestCompletion.values()].filter(
    (h) =>
      h.new_status === "done" &&
      h.old_status !== "done" &&
      ((!f.member && !f.tier) || (!!h.member_id && ids.has(h.member_id))) &&
      inRange(ljubljanaDate(new Date(h.occurred_at))) &&
      (!f.project || h.changes.after?.project_id === f.project),
  );
  const eligible = s.meetings.filter(
    (e) =>
      !e.cancelled &&
      !e.all_day &&
      !f.project &&
      e.ends_at <
        new Date(midnightInLjubljana(addDays(f.to, 1))).toISOString() &&
      inRange(ljubljanaDate(new Date(e.starts_at))) &&
      Date.parse(e.ends_at) <= Date.now(),
  );
  const week = weekStart(today),
    weekEnd = addDays(week, 7);
  const rows = included.map((m) => {
    const meetings = eligible.filter((e) =>
      eligibleMeeting(
        m,
        e,
        s.meetingMembers.some(
          (a) => a.meeting_id === e.id && a.member_id === m.id,
        ),
      ),
    );
    const meetingIds = new Set(meetings.map((e) => e.id));
    const attendance = s.attendance.filter(
      (a) => a.member_id === m.id && meetingIds.has(a.meeting_id),
    );
    const present = attendance.filter(
      (a) => a.status === "present" || a.status === "remote",
    ).length;
    const excused = attendance.filter((a) => a.status === "excused").length;
    const unexcused = attendance.filter((a) => a.status === "unexcused").length;
    const missing = meetings.length - attendance.length;
    const weeklyEntries = s.work.filter(e => !e.deleted && !covered(e) && e.member_id === m.id && e.date >= week && e.date < weekEnd);
    const weeklyHistorical = historical.filter(h => h.member_id === m.id && h.week_start === week);
    const weeklyRecorded = weeklyEntries.length > 0 || weeklyHistorical.length > 0;
    const weekly =
      s.work
        .filter(
          (e) =>
            !e.deleted &&
            !covered(e) &&
            e.member_id === m.id &&
            e.date >= week &&
            e.date < weekEnd,
        )
        .reduce((n, e) => n + Number(e.hours), 0) +
      historical
        .filter((h) => h.member_id === m.id && h.week_start === week)
        .reduce((n, h) => n + Number(h.hours), 0);
    const hours =
      work
        .filter((e) => e.member_id === m.id)
        .reduce((n, e) => n + Number(e.hours), 0) +
      includedHistorical
        .filter((h) => h.member_id === m.id)
        .reduce((n, h) => n + Number(h.hours), 0);
    const completed = new Set(
      completions.filter((h) => h.member_id === m.id).map((h) => h.task_id),
    ).size;
    return {
      ...m,
      hours,
      weekly,
      completed,
      eligible: meetings.length,
      excused,
      present,
      unexcused,
      missing,
      weeklyRecorded,
      attendanceRate:
        present + unexcused > 0
          ? present / (present + unexcused)
          : null,
      active: hours > 0 || completed > 0 || present > 0,
    };
  });
  const denominator = rows.reduce((n, r) => n + r.present + r.unexcused, 0);
  return {
    rows,
    overlapEntries,
    missingAttendance: rows.reduce((n, r) => n + r.missing, 0),
    unknownWeekly: rows.filter(r => !r.weeklyRecorded).length,
    partialWeeks,
    totalMembers: included.length,
    activeMembers: rows.filter((r) => r.active).length,
    hours:
      work.reduce((n, e) => n + Number(e.hours), 0) +
      includedHistorical.reduce((n, h) => n + Number(h.hours), 0),
    weeklyHours: rows.reduce((n, r) => n + r.weekly, 0),
    behind: rows.filter((r) => r.weeklyRecorded && r.weekly < Number(r.weekly_hours)).length,
    completed: new Set(completions.map((h) => h.task_id)).size,
    recentCompletions: [...completions].sort((a,b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0,8),
    projects: s.projects.filter(p => !f.project || p.id === f.project).map(p => {
      const related = tasks.filter(t => t.project_id === p.id);
      return {id:p.id,name:p.name,total:related.length,done:related.filter(t => t.status === "done").length};
    }),
    open: tasks.filter((t) => t.status !== "done").length,
    overdue: tasks.filter(
      (t) => t.status !== "done" && t.due_date && t.due_date < today,
    ).length,
    attendanceRate: denominator
      ? rows.reduce((n, r) => n + r.present, 0) / denominator
      : null,
    weekly: Array.from({ length: Math.max(0, Math.round((Date.parse(weekStart(f.to)) - Date.parse(weekStart(f.from))) / (7 * 86400000)) + 1) }, (_, i) => {
      const start = addDays(weekStart(f.from), i * 7);
      return {
        week: start,
        completed: completions.filter(h => weekStart(ljubljanaDate(new Date(h.occurred_at))) === start).length,
        hours:
          entries
            .filter(
              (e) =>
                e.date >= start &&
                e.date < addDays(start, 7) &&
                inRange(e.date),
            )
            .reduce((n, e) => n + Number(e.hours), 0) +
          includedHistorical
            .filter((h) => h.week_start === start)
            .reduce((n, h) => n + Number(h.hours), 0),
      };
    }),
  };
}
