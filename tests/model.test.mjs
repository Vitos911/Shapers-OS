import test from "node:test";
import assert from "node:assert/strict";
import { emptyWorkspace, isDate, parseWorkspace, summarize, toCsv, validateHours } from "../lib/model.ts";

function fixture() {
  const data = emptyWorkspace();
  data.projects.push({ id: "p1", name: "Testni projekt", description: "", category: "Skupnost", status: "V teku", due: "2026-11-01", createdAt: "2026-10-24T10:00:00Z" });
  data.members.push({ id: "m1", name: "Testni član", role: "Član", createdAt: "2026-10-24T10:00:00Z" });
  return data;
}

test("a new workspace starts empty and can round trip through a backup", () => {
  const data = emptyWorkspace();
  assert.deepEqual(parseWorkspace(JSON.stringify(data)), data);
  assert.equal(summarize(data, "2026-10-24").totalHours, 0);
});

test("calendar validation rejects impossible dates", () => {
  assert.equal(isDate("2026-02-29"), false);
  assert.equal(isDate("2028-02-29"), true);
  assert.equal(isDate("2026-13-01"), false);
  assert.equal(isDate("2026-10-24"), true);
});

test("hours must be finite quarter-hour increments between 0.25 and 24", () => {
  for (const value of ["", 0, -1, "bad", Infinity, 24.25, 0.3, true]) assert.throws(() => validateHours(value));
  for (const value of [0.25, "2.5", 24]) assert.equal(validateHours(value), Number(value));
});

test("backup rejects broken references, duplicates and invalid dates", () => {
  const data = fixture();
  data.entries.push({ id: "e1", projectId: "missing", memberId: "m1", date: "2026-10-24", hours: 2, note: "", createdAt: "2026-10-24T10:00:00Z" });
  assert.throws(() => parseWorkspace(JSON.stringify(data)));
  data.entries[0].projectId = "p1";
  assert.deepEqual(parseWorkspace(JSON.stringify(data)), data);
  data.entries[0].hours = "2";
  assert.throws(() => parseWorkspace(JSON.stringify(data)));
  data.entries = [];
  data.projects.push({ ...data.projects[0] });
  assert.throws(() => parseWorkspace(JSON.stringify(data)));
  assert.throws(() => parseWorkspace('{"version":2}'));
});

test("summary separates current month from all-time hours and excludes past events", () => {
  const data = fixture();
  data.entries.push({ id: "e1", projectId: "p1", memberId: "m1", date: "2026-10-24", hours: 2.5, note: "", createdAt: "2026-10-24T10:00:00Z" });
  data.entries.push({ ...data.entries[0], id: "e2", date: "2026-09-24", hours: 1 });
  data.events.push({ id: "ev1", name: "Test", date: "2026-10-25", time: "17:00", location: "", attendees: [], createdAt: "2026-10-24T10:00:00Z" });
  data.events.push({ ...data.events[0], id: "ev2", date: "2026-10-23" });
  assert.deepEqual(summarize(data, "2026-10-24"), { activeProjects: 1, members: 1, upcomingEvents: 1, monthlyHours: 2.5, totalHours: 3.5 });
});

test("CSV quotes commas and quotes and neutralizes spreadsheet formulas", () => {
  const csv = toCsv([["=SUM(A1)", 'say "yes", now', "@evil", 2.5, "\n+attack"]]);
  assert.ok(csv.startsWith('\uFEFF"\'=SUM(A1)"'));
  assert.ok(csv.includes('"say ""yes"", now"'));
  assert.ok(csv.includes('"\'@evil"'));
  assert.ok(csv.includes('"\'\n+attack"'));
});
