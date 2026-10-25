// Read-only audit. Password sign-in is the only non-GET HTTP request; no app/DB writes.
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { allRows } from "../lib/org-server.ts";
import { auditSnapshot, auditMemberScope } from "../lib/data-readiness.ts";
import { analytics, ljubljanaDate } from "../lib/organization.ts";
const { values } = parseArgs({ options: {
  "credentials-file": { type: "string" },
  "app-origin": { type: "string" },
  output: { type: "string" },
} });
const source = {};
const hashes = {};
for (const [key, file] of Object.entries({ members: "members.json", hours: "weekly-hours.json", attendance: "attendance-pending-calendar.json" })) {
  const raw = await readFile(new URL(`../supabase/seed/${file}`, import.meta.url), "utf8");
  source[key] = JSON.parse(raw);
  hashes[file] = createHash("sha256").update(raw).digest("hex");
}
const names = {
  members: "members", projects: "org_projects", tasks: "org_tasks",
  work: "org_work_entries", weeklyHours: "org_weekly_hours",
  meetings: "org_meetings", attendance: "org_attendance", history: "org_task_history",
  projectMembers: "org_project_members", meetingMembers: "org_meeting_members",
};
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key?.startsWith("sb_publishable_")) throw new Error("Set the Supabase URL and public publishable key privately.");
const credentials = values["credentials-file"]
  ? JSON.parse(await readFile(values["credentials-file"], "utf8")) : [];
if (!Array.isArray(credentials)) throw new Error("Credentials file must be a private JSON array.");
const sessions = [];
const roles = {};
const errors = [];
const report = {
  checkedAt: new Date().toISOString(), timezone: "Europe/Ljubljana", sourceHashes: hashes,
  databaseWrites: 0, roles, errors,
};
const anonymous = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(20000) }) },
});
report.anonymous = [];
for (const table of Object.values(names)) {
  const { error, data } = await anonymous.from(table).select("*").limit(1);
  report.anonymous.push({ table, status: error?.code === "42501" ? "PASS" : data?.length ? "FAIL" : "NOT VERIFIED" });
}
async function snapshot(client, identity) {
  const pairs = await Promise.all(Object.entries(names).map(async ([name, table]) => [name, await allRows(client, table)]));
  return { ...Object.fromEntries(pairs), identity, settings: {}, calendar: {} };
}
const candidates = [
  ...credentials.map((credential) => ({ credential })),
  ...["MEMBER", "ADMIN", "SUPERADMIN"].filter((r) => process.env[`DATA_READINESS_${r}_TOKEN`]).map((r) => ({ token: process.env[`DATA_READINESS_${r}_TOKEN`] })),
];
for (const [index, candidate] of candidates.entries()) {
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { ...(candidate.token ? { headers: { Authorization: `Bearer ${candidate.token}` } } : {}), fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(20000) }) },
    });
    let token = candidate.token;
    if (candidate.credential) {
      const result = await client.auth.signInWithPassword(candidate.credential);
      if (result.error) throw new Error("Demo sign-in failed");
      token = result.data.session.access_token;
    }
    const user = await client.auth.getUser(token);
    if (user.error || !user.data.user?.email_confirmed_at || user.data.user.is_anonymous) throw new Error("Verified user session required");
    const context = await client.rpc("org_context");
    if (context.error || !context.data?.role) throw new Error("Trusted organization context unavailable");
    const s = await snapshot(client, context.data);
    const role = context.data.role;
    roles[role] = { status: "PASS", sessions: (roles[role]?.sessions || 0) + 1 };
    sessions.push({ s, token });
  } catch {
    errors.push({ session: index + 1, status: "NOT VERIFIED", reason: "Could not authenticate or completely read this session; no raw error/identity logged" });
  }
}
for (const role of ["MEMBER", "ADMIN", "SUPERADMIN"]) roles[role] ||= { status: "NOT VERIFIED", reason: "No authenticated session available" };
const administrator = sessions.find(({ s }) => s.identity.role === "SUPERADMIN") || sessions.find(({ s }) => s.identity.role === "ADMIN");
if (administrator) {
  Object.assign(report, auditSnapshot(administrator.s, source));
  const s = administrator.s;
  report.memberScope = sessions.filter(({ s }) => s.identity.role === "MEMBER").map(({ s: member }) => auditMemberScope(member, s));
  report.tiers = Object.fromEntries(["GO!", "Impact", "Core"].map((tier) => {
    const a = analytics(s, { from: "2026-09-14", to: ljubljanaDate(), tier });
    return [tier, { members: a.totalMembers, hours: a.hours, currentWeekHours: a.weeklyHours }];
  }));
  const raw = await readFile(new URL("../supabase/seed/meetings.ics", import.meta.url), "utf8");
  hashes["meetings.ics"] = createHash("sha256").update(raw).digest("hex");
  const events = [...raw.replace(/\r?\n[ \t]/g, "").matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)].map((m) => Object.fromEntries(m[1].trim().split(/\r?\n/).map((line) => { const i = line.indexOf(":"); return [line.slice(0, i), line.slice(i + 1)]; })));
  const instant = (value) => value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
  let mismatches = 0, participantMismatches = 0;
  for (const event of events) {
    const matches = s.meetings.filter((m) => m.series === event.CATEGORIES && Date.parse(m.starts_at) === Date.parse(instant(event.DTSTART)) && Date.parse(m.ends_at) === Date.parse(instant(event.DTEND)));
    if (matches.length !== 1) { mismatches++; continue; }
    const emails = new Set((event.DESCRIPTION.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((x) => x.toLowerCase()));
    const assigned = s.meetingMembers.filter((a) => a.meeting_id === matches[0].id).map((a) => s.members.find((m) => m.id === a.member_id)?.email.toLowerCase());
    if (emails.size !== assigned.length || assigned.some((email) => !emails.has(email))) participantMismatches++;
  }
  report.ics = { events: events.length, duplicateUids: events.length - new Set(events.map((e) => e.UID)).size, unmatchedEvents: mismatches, mismatchedParticipantSets: participantMismatches, note: "ICS uses Members in DESCRIPTION; no ATTENDEE invitations. Database/source agreement does not verify live Google authorization." };
  report.checks.push({ area: "Calendar", check: "All 55 ICS times and participant sets preserved", status: events.length === 55 && mismatches === 0 && participantMismatches === 0 ? "PASS" : "FAIL", actual: mismatches + participantMismatches });
  if (values["app-origin"]) {
    const origin = new URL(values["app-origin"]);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("App origin must be a plain HTTP(S) origin");
    report.appSnapshots = [];
    report.appRoleBoundaries = [];
    for (const { s: expected, token } of sessions) {
      try {
        const response = await fetch(`${origin.origin}/api/org/snapshot`, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error("Snapshot GET failed");
        const actual = await response.json();
        const tablesMatch = Object.keys(names).every((name) => JSON.stringify([...actual[name]].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) === JSON.stringify([...expected[name]].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))));
        report.appSnapshots.push({ role: expected.identity.role, status: tablesMatch && actual.identity.user_id === expected.identity.user_id ? "PASS" : "FAIL", calendarConfigured: !!actual.calendar?.configured, calendarSyncReady: !!actual.calendar?.syncReady });
      } catch { report.appSnapshots.push({ role: expected.identity.role, status: "NOT VERIFIED" }); }
      for (const resource of ["access", "audit"]) {
        try {
          const response = await fetch(`${origin.origin}/api/org/${resource}`, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(20000) });
          const wanted = expected.identity.role === "SUPERADMIN" ? 200 : 403;
          report.appRoleBoundaries.push({ role: expected.identity.role, resource, status: response.status === wanted ? "PASS" : "FAIL", httpStatus: response.status });
          await response.body?.cancel();
        } catch { report.appRoleBoundaries.push({ role: expected.identity.role, resource, status: "NOT VERIFIED" }); }
      }
    }
  }
} else {
  report.checks = ["Members", "Projects", "Tasks", "Hours", "Attendance", "Calendar"].map((area) => ({ area, check: "Organization-wide authenticated snapshot", status: "NOT VERIFIED", actual: "No ADMIN/SUPERADMIN snapshot available" }));
}
report.summary = Object.fromEntries(["Members", "Projects", "Tasks", "Hours", "Attendance", "Calendar"].map((area) => {
  const checks = report.checks.filter((c) => c.area === area);
  return [area, checks.some((c) => c.status === "FAIL") ? "FAIL" : checks.some((c) => c.status === "NOT VERIFIED") ? "NOT VERIFIED" : "PASS"];
}));
const output = JSON.stringify(report, null, 2) + "\n";
if (values.output) await writeFile(values.output, output, { mode: 0o600 });
console.log(output);
process.exitCode = Object.values(report.summary).some((s) => s !== "PASS") || errors.length || Object.values(roles).some((r) => r.status !== "PASS") || report.memberScope?.some((scope) => Object.values(scope).some((v) => !v)) || report.appSnapshots?.some((r) => r.status !== "PASS") || report.appRoleBoundaries?.some((r) => r.status !== "PASS") || report.anonymous.some((r) => r.status !== "PASS") ? 1 : 0;
