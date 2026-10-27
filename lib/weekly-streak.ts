import { addDays, ljubljanaDate, weekStart, type Snapshot } from "./organization.ts";

export const STREAK_MILESTONES = [2, 4, 8, 12] as const;
type StreakSnapshot = Pick<Snapshot, "identity" | "members" | "work" | "weeklyHours">;

/** Date-only work dates are Ljubljana calendar dates, not UTC instants. */
export function weeklyStreak(snapshot: StreakSnapshot, now = new Date()) {
  const member = snapshot.members.find((m) => m.id === snapshot.identity.member_id);
  const target = Number(member?.weekly_hours);
  if (!member || !Number.isFinite(target) || target <= 0) return null;

  const today = ljubljanaDate(now);
  const currentWeek = weekStart(today);
  const totals = new Map<string, number>();
  const imports = new Map((snapshot.weeklyHours || [])
    .filter((h) => h.member_id === member.id && h.through_date <= today)
    .map((h) => [h.week_start, h]));
  for (const h of imports.values()) totals.set(h.week_start, Number(h.hours));
  for (const entry of snapshot.work) {
    if (entry.member_id !== member.id || entry.deleted || entry.date > today) continue;
    const start = weekStart(entry.date);
    const imported = imports.get(start);
    // Imports are authoritative for their inclusive coverage only. Later entries
    // in a partially imported week still contribute; never add covered dates twice.
    if (imported && entry.date <= imported.through_date) continue;
    totals.set(start, (totals.get(start) || 0) + Number(entry.hours));
  }

  const hours = totals.get(currentWeek) || 0;
  const complete = hours >= target;
  let current = 0;
  for (let start = complete ? currentWeek : addDays(currentWeek, -7);
    (totals.get(start) || 0) >= target; start = addDays(start, -7)) current++;

  let best = 0, run = 0, previous: string | null = null;
  for (const [start, total] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
    run = total >= target ? (previous === addDays(start, -7) ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    previous = start;
  }
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const start = addDays(currentWeek, (i - 5) * 7);
    const total = totals.get(start) || 0;
    return {
      start, end: addDays(start, 6), hours: total,
      status: total >= target ? "complete" as const : start === currentWeek ? "pending" as const : "incomplete" as const,
    };
  });
  return {
    target, hours, remaining: Math.max(0, target - hours), current, complete, currentWeek,
    best: totals.size ? best : null,
    weeks,
    milestones: STREAK_MILESTONES.map((weeks) => ({ weeks, achieved: best >= weeks })),
  };
}

export type WeeklyStreak = NonNullable<ReturnType<typeof weeklyStreak>>;
