import { allRows, HttpError, serviceClient } from "./org-server.ts";
import { addDays, isAdmin, ljubljanaDate, midnightInLjubljana, weekStart, type Identity } from "./organization.ts";
import { isDate } from "./model.ts";
import { achievementsFor, activityStreak, aggregateWeeks, comparableChange, firstCompletions, firstFullWeek, scoreWeek, SCORE_VERSION, visibleRankings, type LeaderboardData, type LeaderboardSource, type ScoreRow } from "./leaderboard.ts";

export function leaderboardWeek(value: string | null, now: Date) {
  const current = weekStart(ljubljanaDate(now));
  const week = value ?? current;
  if (!isDate(week) || weekStart(week) !== week || week > current || week < "2000-01-03") throw new HttpError(400, "Izberi veljaven ponedeljek do tekočega tedna.");
  return week;
}

/** Called only after requireAuth verifies live organization membership. The secret never reaches React. */
export type LeaderboardRepository = {
  sourceAt: (at: Date) => Promise<LeaderboardSource>;
  readFinalized: () => Promise<Map<string, ScoreRow[]>>;
  finalize: (week: string, rows: ScoreRow[]) => Promise<ScoreRow[]>;
};

export async function assembleLeaderboard(identity: Identity, week: string, now: Date, repository: LeaderboardRepository, period: LeaderboardData["period"] = "week"): Promise<LeaderboardData> {
  const currentWeek = weekStart(ljubljanaDate(now));
  const source = await repository.sourceAt(now);
  const first = firstFullWeek(source.coverageStartedAt);
  const completed = await repository.readFinalized();
  // Automatic catch-up from immutable evidence. No cron, manual points or visitor
  // timing dependence: each source is reconstructed immediately before local Monday.
  for (let start = first; start < currentWeek; start = addDays(start, 7)) {
    if (completed.has(start)) continue;
    const cutoff = new Date(midnightInLjubljana(addDays(start, 7)));
    const rows = scoreWeek(await repository.sourceAt(cutoff), start, cutoff);
    completed.set(start, await repository.finalize(start, rows));
  }
  const current = scoreWeek(source, currentWeek, now);
  const weeklyRows = week === currentWeek ? current : completed.get(week) || [];
  const previous = completed.get(addDays(currentWeek, -7));
  const change = comparableChange(current.find((r) => r.memberId === identity.member_id), previous?.find((r) => r.memberId === identity.member_id));
  const allWeeks = [...completed].sort(([a], [b]) => a.localeCompare(b));
  const monthStart = ljubljanaDate(now).slice(0, 7) + "-01";
  const selectedWeeks = period === "week" ? [[week, weeklyRows] as const] : [...allWeeks, [currentWeek, current] as const].filter(([start]) => period === "all" || start >= weekStart(monthStart));
  const rows = period === "week" ? weeklyRows : aggregateWeeks(selectedWeeks.map(([, values]) => values));
  const streakWeek = period === "week" && week < currentWeek ? addDays(week, 7) : currentWeek;
  const streaks = new Map(source.members.map((m) => [m.id, activityStreak(completed, m.id, streakWeek)]));
  const ownStreak = identity.member_id && source.members.some((m) => m.id === identity.member_id) ? activityStreak(completed, identity.member_id, currentWeek) : null;
  const currentRankings = visibleRankings(current, identity, new Map(source.members.map((m) => [m.id, activityStreak(completed, m.id, currentWeek)])), previous);
  const own = currentRankings.find((r) => r.memberId === identity.member_id) || null;
  const completionDays = [...firstCompletions(source, now.getTime()).values()].filter((e) => e.member_id === identity.member_id && source.tasks.some((t) => t.id === e.task_id && t.status === "done" && !t.archived && t.assignee_id === identity.member_id));
  return {
    week, currentWeek, firstFullWeek: first, coverageStartedAt: source.coverageStartedAt,
    status: period !== "week" || week === currentWeek ? "provisional" : completed.has(week) ? "final" : "unavailable",
    period, weeksCount: selectedWeeks.filter(([, values]) => values.length).length,
    rows: visibleRankings(rows, identity, streaks, period === "week" ? completed.get(addDays(week, -7)) : undefined), change, previousComparable: change !== null,
    personal: { row: own, activeMembers: current.length, rankChange: own?.summary.rankChange ?? null, previousTasks: previous?.find((r) => r.memberId === identity.member_id)?.metrics.completedTasks ?? null,
      dailyTasks: Array.from({ length: 7 }, (_, i) => completionDays.filter((e) => ljubljanaDate(new Date(e.occurred_at)) === addDays(currentWeek, i)).length), streak: ownStreak },
    ...(isAdmin(identity.role) ? { trends: [...allWeeks, [currentWeek, current] as const].slice(-12).map(([start, values]) => ({ week: start, members: values.length, average: values.length ? values.reduce((n, r) => n + r.score, 0) / values.length : 0,
      hours: values.reduce((n, r) => n + r.metrics.hours, 0), target: values.reduce((n, r) => n + r.metrics.target, 0), tasks: values.reduce((n, r) => n + r.metrics.completedTasks, 0), attended: values.reduce((n, r) => n + r.metrics.attended, 0), meetings: values.reduce((n, r) => n + r.metrics.meetings, 0) })) } : {}),
    ...achievementsFor(source, identity.member_id, [...completed.values()], now, ownStreak || undefined),
  };
}

export async function loadLeaderboard(identity: Identity, week: string, now = new Date(), period: LeaderboardData["period"] = "week"): Promise<LeaderboardData> {
  const db = serviceClient();
  return assembleLeaderboard(identity, week, now, {
    sourceAt: async (at) => {
      const { data, error } = await db.rpc("org_leaderboard_source", { as_of: at.toISOString() });
      if (error || !data?.coverageStartedAt) throw new HttpError(503, "Leaderboard še ni pripravljen. Skrbnik naj uporabi migracijo leaderboard_history.");
      return data as LeaderboardSource;
    },
    readFinalized: async () => {
      const rows = await allRows(db, "org_leaderboard_weeks");
      return new Map(rows.filter((row) => row.version === SCORE_VERSION).map((row) => [String(row.week_start), row.rows as ScoreRow[]]));
    },
    finalize: async (start, rows) => {
      const stored = await db.from("org_leaderboard_weeks").upsert({ week_start: start, version: SCORE_VERSION, rows }, { onConflict: "week_start,version", ignoreDuplicates: true });
      if (stored.error) throw new HttpError(503, "Zaključenega tedna ni mogoče potrditi. Poskusi znova.");
      // A concurrent request may have inserted first. Always return the canonical row.
      const canonical = await db.from("org_leaderboard_weeks").select("rows").eq("week_start", start).eq("version", SCORE_VERSION).single();
      if (canonical.error) throw new HttpError(503, "Zaključenega rezultata ni mogoče prebrati.");
      return canonical.data.rows as ScoreRow[];
    },
  }, period);
}
