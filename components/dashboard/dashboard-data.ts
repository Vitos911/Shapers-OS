import { ljubljanaDate, type OrgTask, type Snapshot } from "../../lib/organization.ts";

const priority: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Personal tasks must never fall back to the organization's unassigned tasks. */
export function dashboardTasks(s: Pick<Snapshot, "identity" | "tasks">, today = ljubljanaDate()): OrgTask[] {
  if (!s.identity.member_id) return [];
  const group = (task: OrgTask) =>
    task.due_date && task.due_date < today ? 0 : task.priority === "urgent" ? 1 : task.due_date ? 2 : 3;
  return s.tasks
    .filter((task) => task.assignee_id === s.identity.member_id && !task.archived && task.status !== "done")
    .sort((a, b) => group(a) - group(b) ||
      (a.due_date || "9999").localeCompare(b.due_date || "9999") ||
      (priority[a.priority] ?? 4) - (priority[b.priority] ?? 4) || a.title.localeCompare(b.title, "sl"));
}

export function dashboardMeetings(s: Pick<Snapshot, "meetings">, now: number) {
  return s.meetings.filter((meeting) => !meeting.cancelled && Date.parse(meeting.ends_at) >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
