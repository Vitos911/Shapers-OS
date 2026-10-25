import { addDays, isAdmin, ljubljanaDate, midnightInLjubljana, weekStart, type Identity, type Snapshot } from "./organization.ts";
import { weeklyStreak, WEEKLY_TARGETS } from "./weekly-streak.ts";

export const SCORE_VERSION = 2;
export type LeaderboardSource = Pick<Snapshot, "members" | "tasks" | "history" | "work" | "weeklyHours" | "meetings" | "attendance" | "meetingMembers"> & {
  coverageStartedAt: string;
  eligibility: { meeting_id: string; member_id: string; observed: boolean }[];
};
export type ScoreMetrics = {
  hours: number; target: number; hoursPoints: number;
  tasks: number; completedTasks: number; taskPoints: number | null;
  meetings: number; attended: number; excused: number; attendancePoints: number | null;
  applicablePoints: number;
};
export type ScoreRow = { memberId: string; name: string; tier: string; score: number; metrics: ScoreMetrics };
export type Achievement = { id: string; name: string; description: string; achieved: boolean; progress: number; target: number };
export type Streak = { current: number; best: number | null; next: number; progress: number };
export type RankingRow = Omit<ScoreRow, "metrics"> & {
  rank: number; metrics?: ScoreMetrics;
  summary: { tasks: number; hours: number; target: number; attendance: number | null; streak: number; rankChange: number | null };
};
export type LeaderboardData = {
  week: string; currentWeek: string; coverageStartedAt: string; firstFullWeek: string;
  status: "provisional" | "final" | "unavailable";
  rows: RankingRow[]; previousComparable: boolean; change: number | null;
  achievements: Achievement[]; hoursStreak: number | null;
  period: "week" | "month" | "all"; weeksCount: number;
  personal: { row: RankingRow | null; activeMembers: number; rankChange: number | null; previousTasks: number | null; dailyTasks: number[]; streak: Streak | null };
  trends?: { week: string; members: number; average: number; hours: number; target: number; tasks: number; attended: number; meetings: number }[];
};

export function firstFullWeek(startedAt: string) {
  const local = ljubljanaDate(new Date(startedAt));
  const monday = weekStart(local);
  // PostgreSQL retains microseconds that Date.parse truncates. Even a partial
  // first millisecond must not be presented as a fully observed week.
  const fraction = startedAt.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] || "";
  return Date.parse(startedAt) === Date.parse(midnightInLjubljana(monday)) && !/[1-9]/.test(fraction) ? monday : addDays(monday, 7);
}

/** The first genuine completion owns credit. Reopening/reassignment never creates a second credit. */
export function firstCompletions(source: LeaderboardSource, cutoff: number) {
  const completions = new Map<string, Snapshot["history"][number]>();
  for (const event of [...source.history].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id))) {
    if (event.new_status === "done" && event.old_status !== "done" && Date.parse(event.occurred_at) < cutoff && !completions.has(event.task_id)) completions.set(event.task_id, event);
  }
  return completions;
}

export function scoreWeek(source: LeaderboardSource, week: string, asOf: Date): ScoreRow[] {
  const end = Date.parse(midnightInLjubljana(addDays(week, 7)));
  const cutoff = Math.min(asOf.getTime(), end);
  const today = ljubljanaDate(new Date(cutoff < end ? cutoff : cutoff - 1));
  const completed = firstCompletions(source, cutoff);
  return source.members.filter((member) => Object.hasOwn(WEEKLY_TARGETS, member.tier)).map((member) => {
    // Reuse the exact Weekly Streak coverage rules, including partial weekly imports.
    const work = [...new Map(source.work.map((entry) => [entry.id, entry])).values()];
    const target = Number(member.weekly_hours);
    if (!Number.isFinite(target) || target <= 0) throw new Error("Članu manjka veljaven tedenski cilj ur.");
    const hours = weeklyStreak({ ...source, work, identity: { member_id: member.id } as Identity }, new Date(cutoff < end ? cutoff : cutoff - 1))!.hours;
    const tasks = [...new Map(source.tasks.map((task) => [task.id, task])).values()].filter((task) => task.assignee_id === member.id && !task.archived);
    const completedTasks = tasks.filter((task) => {
      const event = completed.get(task.id);
      const atCompletion = event?.changes.after as { archived?: boolean } | undefined;
      return task.status === "done" && event?.member_id === member.id && atCompletion?.archived === false &&
        ljubljanaDate(new Date(event.occurred_at)) >= week;
    }).length;
    const required = new Set(source.eligibility.filter((e) => e.member_id === member.id).map((e) => e.meeting_id));
    const meetings = [...new Map(source.meetings.map((m) => [m.id, m])).values()].filter((m) => required.has(m.id) && !m.cancelled && Date.parse(m.ends_at) <= cutoff && ljubljanaDate(new Date(m.ends_at)) >= week && ljubljanaDate(new Date(m.ends_at)) <= today);
    const records = new Map(source.attendance.filter((a) => a.member_id === member.id).map((a) => [a.meeting_id, a.status]));
    const excused = meetings.filter((m) => records.get(m.id) === "excused").length;
    const attended = meetings.filter((m) => ["present", "remote"].includes(records.get(m.id) || "")).length;
    const eligible = meetings.length - excused;
    const hoursPoints = 30 * Math.min(Math.max(0, hours / target), 1);
    const taskPoints = Math.min(50, completedTasks * 10);
    const attendancePoints = eligible ? 20 * attended / eligible : null;
    const applicablePoints = attendancePoints === null ? 80 : 100;
    return { memberId: member.id, name: member.name, tier: member.tier,
      score: (hoursPoints + (taskPoints || 0) + (attendancePoints || 0)) / applicablePoints * 100,
      metrics: { hours, target, hoursPoints, tasks: tasks.length, completedTasks, taskPoints, meetings: eligible, attended, excused, attendancePoints, applicablePoints } };
  });
}

/** Full precision ranks first; immutable member UUID breaks exact ties, independent of locale/name changes. */
export function rankScores(rows: ScoreRow[]) {
  return [...rows].sort((a, b) => b.score - a.score || a.memberId.localeCompare(b.memberId, "en")).map((row, i) => ({ ...row, rank: i + 1 }));
}

export function activityStreak(completed: Map<string, ScoreRow[]>, memberId: string, currentWeek: string): Streak {
  const successful = new Set([...completed].filter(([week, rows]) => week < currentWeek && rows.some((r) => r.memberId === memberId && r.metrics.hours >= r.metrics.target && (r.metrics.completedTasks > 0 || r.metrics.attended > 0))).map(([week]) => week));
  let current = 0;
  for (let week = addDays(currentWeek, -7); successful.has(week); week = addDays(week, -7)) current++;
  let best = 0, run = 0, previous = "";
  for (const week of [...successful].sort()) { run = previous === addDays(week, -7) ? run + 1 : 1; best = Math.max(best, run); previous = week; }
  const next = [3, 4, 8, 10, 12, 26, 52].find((n) => n > current) ?? (Math.floor(current / 52) + 1) * 52;
  return { current, best: [...completed].some(([week, rows]) => week < currentWeek && rows.some((r) => r.memberId === memberId)) ? best : null, next, progress: current / next * 100 };
}

export function achievementsFor(source: LeaderboardSource, memberId: string | null, completedWeeks: ScoreRow[][], now: Date, streak?: Streak): { achievements: Achievement[]; hoursStreak: number | null } {
  const member = source.members.find((m) => m.id === memberId);
  if (!memberId || !member || !Object.hasOwn(WEEKLY_TARGETS, member.tier)) return { achievements: [], hoursStreak: null };
  const bestStreak = streak?.best || 0;
  const completed = [...firstCompletions(source, now.getTime()).values()].filter((e) => e.member_id === memberId && (e.changes.after as { archived?: boolean } | undefined)?.archived === false).length;
  const eligibleIds = new Set(source.eligibility.filter((e) => e.member_id === memberId && e.observed).map((e) => e.meeting_id));
  const attendance = new Map(source.attendance.filter((a) => a.member_id === memberId).map((a) => [a.meeting_id, a.status]));
  let run = 0, best = 0;
  for (const meeting of [...source.meetings].filter((m) => eligibleIds.has(m.id) && !m.cancelled && Date.parse(m.ends_at) <= now.getTime()).sort((a, b) => a.ends_at.localeCompare(b.ends_at) || a.id.localeCompare(b.id))) {
    const status = attendance.get(meeting.id);
    if (status === "excused") continue;
    run = status === "present" || status === "remote" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const perfect = completedWeeks.some((rows) => rows.some((r) => r.memberId === memberId && r.score === 100 && r.metrics.applicablePoints === 100));
  const goal = [...completedWeeks, scoreWeek(source, weekStart(ljubljanaDate(now)), now)].some((rows) => rows.some((r) => r.memberId === memberId && r.metrics.hours >= r.metrics.target));
  const badges: [string, string, string, number, number][] = [
    ["first-steps", "First Steps", "Prva evidentirana zaključitev naloge.", completed, 1],
    ["on-fire", "On Fire", "3 zaporedni uspešni zaključeni tedni.", bestStreak, 3],
    ["unstoppable", "Unstoppable", "8 zaporednih uspešnih zaključenih tednov.", bestStreak, 8],
    ["task-master", "Task Master", "10 različnih zaključenih nalog.", completed, 10],
    ["perfect-attendance", "Perfect Attendance", "100 % udeležba v nizu vsaj 3 relevantnih sestankov; opravičeni se preskočijo.", best, 3],
    ["goal-crusher", "Goal Crusher", "Dosežen evidentirani tedenski cilj ur.", goal ? 1 : 0, 1],
    ["always-there", "Always There", "5 zaporednih obveznih sestankov z udeležbo od začetka spremljanja; opravičeni se preskočijo.", best, 5],
    ["perfect-week", "Perfect Week", "100/100 v spremljanem zaključenem tednu z vsemi tremi kategorijami.", perfect ? 1 : 0, 1],
    ["consistency-champion", "Consistency Champion", "4 zaporedni uspešni zaključeni tedni.", bestStreak, 4],
  ];
  return { hoursStreak: streak?.current ?? 0, achievements: badges.map(([id, name, description, progress, target]) => ({ id, name, description, progress, target, achieved: progress >= target })) };
}

/** Never return source records or foreign breakdowns, even if the caller passes a foreign member filter. */
export function visibleRankings(rows: ScoreRow[], identity: Identity, streaks = new Map<string, Streak>(), previous?: ScoreRow[]): RankingRow[] {
  const prior = new Map(rankScores(previous || []).map((r) => [r.memberId, r]));
  return rankScores(rows).map(({ memberId, name, tier, score, rank, metrics }) => ({ memberId, name, tier, score, rank,
    summary: { tasks: metrics.completedTasks, hours: metrics.hours, target: metrics.target, attendance: metrics.meetings ? metrics.attended / metrics.meetings * 100 : null, streak: streaks.get(memberId)?.current ?? 0,
      rankChange: prior.has(memberId) && prior.get(memberId)!.tier === tier && prior.get(memberId)!.metrics.target === metrics.target ? prior.get(memberId)!.rank - rank : null },
    ...(isAdmin(identity.role) || memberId === identity.member_id ? { metrics } : {}) }));
}

/** Period results are means of observed weekly scores; obligations never disappear through N/A. */
export function aggregateWeeks(weeks: ScoreRow[][]): ScoreRow[] {
  const groups = new Map<string, ScoreRow[]>();
  for (const rows of weeks) for (const row of rows) groups.set(row.memberId, [...(groups.get(row.memberId) || []), row]);
  return [...groups.values()].map((rows) => {
    const latest = rows.at(-1)!;
    const sum = (key: keyof ScoreMetrics) => rows.reduce((n, row) => n + (row.metrics[key] || 0), 0);
    const mean = (key: keyof ScoreMetrics) => sum(key) / rows.length;
    return { ...latest, score: rows.reduce((n, row) => n + row.score, 0) / rows.length,
      metrics: { hours: sum("hours"), target: sum("target"), hoursPoints: mean("hoursPoints"), tasks: sum("tasks"), completedTasks: sum("completedTasks"), taskPoints: mean("taskPoints"), meetings: sum("meetings"), attended: sum("attended"), excused: sum("excused"), attendancePoints: rows.some((r) => r.metrics.attendancePoints !== null) ? mean("attendancePoints") : null, applicablePoints: mean("applicablePoints") } };
  });
}

export function comparableChange(current?: ScoreRow, previous?: ScoreRow) {
  if (!current || !previous || current.tier !== previous.tier || current.metrics.target !== previous.metrics.target ||
    (current.metrics.taskPoints === null) !== (previous.metrics.taskPoints === null) ||
    (current.metrics.attendancePoints === null) !== (previous.metrics.attendancePoints === null)) return null;
  return current.score - previous.score;
}
