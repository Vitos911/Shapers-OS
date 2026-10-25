import test from "node:test";
import assert from "node:assert/strict";
import { weeklyStreak } from "../lib/weekly-streak.ts";
import { addDays } from "../lib/organization.ts";

const now = new Date("2026-10-24T10:00:00Z");
const entry = (date, hours, fields = {}) => ({ id: date, member_id: "me", date, hours, deleted: false, ...fields });
const history = (week_start, hours, through_date = addDays(week_start, 6)) => ({ member_id: "me", week_start, through_date, hours });
const snapshot = (fields = {}) => ({ identity: { member_id: "me" }, members: [{ id: "me", tier: "Impact", weekly_hours: 10 }], work: [], weeklyHours: [], ...fields });

test("tier targets are GO! 4h, Impact 10h, Core 70h, independent of a stale weekly_hours value", () => {
  for (const [tier, target] of [["GO!", 4], ["Impact", 10], ["Core", 70]]) {
    const s = snapshot({ members: [{ id: "me", tier, weekly_hours: 1 }], work: [entry("2026-10-20", target - .25)] });
    assert.equal(weeklyStreak(s, now).target, target);
    assert.equal(weeklyStreak(s, now).current, 0);
    assert.equal(weeklyStreak(s, now).remaining, .25);
    s.work.push(entry("2026-10-21", .25));
    assert.equal(weeklyStreak(s, now).current, 1);
  }
});

test("unfinished current week preserves the preceding streak; reaching target counts it immediately", () => {
  const s = snapshot({ weeklyHours: [history("2026-10-05", 10), history("2026-10-12", 11)], work: [entry("2026-10-19", 2.5)] });
  const result = weeklyStreak(s, now);
  assert.equal(result.current, 2);
  assert.equal(result.best, 2);
  assert.equal(result.remaining, 7.5);
  assert.equal(result.weeks.at(-1).status, "pending");
  s.work.push(entry("2026-10-20", 7.5));
  const completed = weeklyStreak(s, now);
  assert.equal(completed.current, 3);
  assert.equal(completed.best, 3);
  assert.equal(completed.weeks.at(-1).status, "complete");
});

test("the streak survives all of Sunday and resets exactly on Ljubljana Monday after DST changes", () => {
  for (const [monday, boundary] of [["2026-03-23", "2026-03-29T22:00:00Z"], ["2026-10-19", "2026-10-25T23:00:00Z"]]) {
    const s = snapshot({ weeklyHours: [history(addDays(monday, -7), 10)] });
    const before = weeklyStreak(s, new Date(Date.parse(boundary) - 1));
    assert.equal(before.currentWeek, monday);
    assert.equal(before.current, 1);
    assert.equal(before.weeks.at(-1).status, "pending");
    const after = weeklyStreak(s, new Date(boundary));
    assert.equal(after.currentWeek, addDays(monday, 7));
    assert.equal(after.current, 0);
    assert.equal(after.weeks.at(-2).status, "incomplete");
  }
});

test("Sunday work counts in its week even when UTC is still Sunday at Ljubljana Monday", () => {
  const s = snapshot({ work: [entry("2026-10-25", 10)] });
  assert.equal(weeklyStreak(s, new Date("2026-10-25T22:59:59Z")).current, 1);
  const after = weeklyStreak(s, new Date("2026-10-25T23:00:00Z"));
  assert.equal(after.current, 1);
  assert.equal(after.hours, 0);
  assert.equal(after.remaining, 10);
  assert.equal(after.weeks.at(-2).hours, 10);
});

test("a missing or insufficient closed week breaks the run but preserves the personal best", () => {
  const s = snapshot({ weeklyHours: [history("2026-09-21", 10), history("2026-09-28", 10), history("2026-10-12", 9.75)] });
  const result = weeklyStreak(s, now);
  assert.equal(result.current, 0);
  assert.equal(result.best, 2);
  assert.equal(result.weeks.find((w) => w.start === "2026-10-05").status, "incomplete");
  assert.deepEqual(result.milestones.map((m) => m.achieved), [true, false, false, false]);
});

test("imported coverage replaces overlapping entries and allows later work in a partially imported week", () => {
  const s = snapshot({ weeklyHours: [history("2026-10-19", "6.25", "2026-10-21")], work: [
    entry("2026-10-19", 6), entry("2026-10-21", 2), entry("2026-10-22", "3.75"),
    entry("2026-10-23", 50, { deleted: true }), entry("2026-10-24", 70, { member_id: "other" }), entry("2026-10-25", 10),
  ] });
  const original = structuredClone(s);
  const result = weeklyStreak(s, now);
  assert.equal(result.hours, 10);
  assert.equal(result.current, 1);
  assert.equal(result.remaining, 0);
  assert.deepEqual(s, original);
});

test("full-week imports are counted once, and imports from the future never grant achievements", () => {
  const s = snapshot({ weeklyHours: [history("2026-10-12", 10), history("2026-10-26", 70)], work: [entry("2026-10-18", 70)] });
  const result = weeklyStreak(s, now);
  assert.equal(result.weeks.at(-2).hours, 10);
  assert.equal(result.current, 1);
  assert.equal(result.best, 1);
  assert.equal(weeklyStreak(snapshot({ weeklyHours: [history("2026-10-19", 70)] }), now).best, null);
});

test("empty history shows six calendar weeks, zero progress, pending current week and no invented best", () => {
  const result = weeklyStreak(snapshot(), now);
  assert.equal(result.current, 0);
  assert.equal(result.best, null);
  assert.equal(result.remaining, 10);
  assert.deepEqual(result.weeks.map((w) => w.start), ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
  assert.deepEqual(result.weeks.map((w) => w.status), ["incomplete", "incomplete", "incomplete", "incomplete", "incomplete", "pending"]);
  assert.ok(result.milestones.every((m) => !m.achieved));
});

test("milestones 2, 4, 8 and 12 use the entire available history beyond the six-week display", () => {
  for (const length of [2, 4, 8, 12]) {
    const s = snapshot({ weeklyHours: Array.from({ length }, (_, i) => history(addDays("2026-10-12", -i * 7), 10)) });
    const result = weeklyStreak(s, now);
    assert.equal(result.current, length);
    assert.equal(result.best, length);
    assert.deepEqual(result.milestones.filter((m) => m.achieved).map((m) => m.weeks), [2, 4, 8, 12].filter((n) => n <= length));
    assert.equal(result.weeks.length, 6);
  }
});

test("year boundaries do not break adjacent successful weeks", () => {
  const s = snapshot({ weeklyHours: [history("2025-12-22", 10), history("2025-12-29", 10)] });
  assert.equal(weeklyStreak(s, new Date("2026-01-05T00:00:00+01:00")).current, 2);
});

test("unlinked accounts and unknown tiers do not receive fabricated personal streaks", () => {
  assert.equal(weeklyStreak(snapshot({ identity: { member_id: null } }), now), null);
  assert.equal(weeklyStreak(snapshot({ members: [{ id: "me", tier: "unknown" }] }), now), null);
  assert.equal(weeklyStreak(snapshot({ members: [] }), now), null);
});
