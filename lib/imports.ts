import { createHash } from "node:crypto";
import { fields, uuid } from "./org-validation.ts";
import { addDays, ljubljanaDate, weekStart } from "./organization.ts";
import { isDate } from "./model.ts";
export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some(Boolean)) records.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote");
  if (value || row.length) {
    row.push(value);
    records.push(row);
  }
  const header =
    records.shift()?.map((v) => v.replace(/^\uFEFF/, "").trim()) || [];
  if (new Set(header).size !== header.length)
    throw new Error("Duplicate CSV headers");
  return records.map((r, index) => {
    if (r.length !== header.length)
      throw new Error(`CSV row ${index + 2}: column count mismatch`);
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  });
}
export const normalizedEmail = (v: string) => v.trim().toLowerCase();
export function resolveMember(
  row: Record<string, unknown>,
  members: Record<string, unknown>[],
) {
  const email = normalizedEmail(String(row.email || row.member_email || ""));
  const id = row.member_id;
  const found = members.filter((m) =>
    email
      ? normalizedEmail(String(m.email)) === email
      : id
        ? m.id === id
        : String(m.name).normalize("NFC").toLowerCase() ===
          String(row.member_name || "")
            .normalize("NFC")
            .toLowerCase(),
  );
  if (found.length !== 1)
    throw new Error("Member mapping is missing or ambiguous");
  return uuid(found[0].id);
}
export function importKey(kind: string, row: Record<string, unknown>) {
  return (
    "sandbox:" +
    kind +
    ":" +
    createHash("sha256")
      .update(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
          ),
        ),
      )
      .digest("hex")
  );
}
export function planImport(
  kind: string,
  rows: Record<string, unknown>[],
  members: Record<string, unknown>[],
  meetings: Record<string, unknown>[] = [],
) {
  const planned: Record<string, unknown>[] = [],
    conflicts: { row: number; error: string }[] = [];
  rows.forEach((row, index) => {
    try {
      let value: Record<string, unknown>;
      if (kind === "projects") {
        value = fields("projects", {
          name: row.name,
          description: row.description || "",
          status: row.status || "planning",
        });
      } else if (kind === "weekly-hours") {
        const start = String(row.week_start || ""),
          through = String(row.through_date || "");
        const hours = Number(row.hours);
        if (
          !isDate(start) ||
          weekStart(start) !== start ||
          !isDate(through) ||
          through < start ||
          through >= addDays(start, 7) ||
          !Number.isFinite(hours) ||
          hours < 0 ||
          hours > 168 ||
          !Number.isInteger(hours * 4)
        )
          throw new Error(
            "Invalid weekly aggregate; explicit coverage through_date is required",
          );
        value = {
          member_id: resolveMember(row, members),
          week_start: start,
          through_date: through,
          hours,
          source: String(row.source || "sandbox hours"),
        };
      } else if (kind === "work") {
        value = {
          ...fields("work", {
            date: row.date,
            hours: row.hours,
            project_id: row.project_id || null,
            description: row.description || "",
          }),
          member_id: resolveMember(row, members),
        };
      } else if (kind === "attendance") {
        const matches = meetings.filter((m) =>
          row.google_event_id
            ? m.google_event_id === row.google_event_id &&
              (!row.calendar_id || m.calendar_id === row.calendar_id)
            : row.ical_uid
              ? m.ical_uid === row.ical_uid &&
                ljubljanaDate(new Date(String(m.starts_at))) === row.date
              : m.series === row.series &&
                ljubljanaDate(new Date(String(m.starts_at))) === row.date,
        );
        if (matches.length !== 1)
          throw new Error(
            "Meeting mapping is missing or ambiguous; provide stable Google event ID",
          );
        value = fields("attendance", {
          meeting_id: matches[0].id,
          member_id: resolveMember(row, members),
          status: row.status || row.state,
          note: row.note || "",
        });
      } else
        throw new Error(
          "Supported imports: projects, work, weekly-hours, attendance",
        );
      planned.push({ ...value, import_key: importKey(kind, value) });
    } catch (e) {
      conflicts.push({
        row: index + 1,
        error: e instanceof Error ? e.message : "Invalid record",
      });
    }
  });
  // Repeated semantic rows within a file are reported, never silently double-counted.
  const seen = new Set();
  const targets = new Set();
  for (let i = 0; i < planned.length; i++) {
    const key = planned[i].import_key;
    if (seen.has(key))
      conflicts.push({ row: i + 1, error: "Duplicate semantic record" });
    seen.add(key);
    const row = planned[i];
    const target =
      kind === "attendance"
        ? `${row.meeting_id}/${row.member_id}`
        : kind === "weekly-hours"
          ? `${row.member_id}/${row.week_start}`
          : null;
    if (target) {
      if (
        targets.has(target) &&
        !planned.slice(0, i).some((previous) => previous.import_key === key)
      )
        conflicts.push({
          row: i + 1,
          error:
            "Conflicting values for the same member/meeting or member/week",
        });
      targets.add(target);
    }
  }
  return { rows: planned, conflicts };
}
