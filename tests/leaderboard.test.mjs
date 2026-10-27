import test from "node:test";
import assert from "node:assert/strict";
import { achievementsFor, activityStreak, aggregateWeeks, comparableChange, firstFullWeek, rankScores, scoreWeek, visibleRankings } from "../lib/leaderboard.ts";
import { assembleLeaderboard, leaderboardWeek } from "../lib/leaderboard-server.ts";
import { addDays, midnightInLjubljana } from "../lib/organization.ts";

const week = "2026-10-19", now = new Date("2026-10-24T12:00:00Z");
const member = (id = "me", tier = "Impact") => ({ id, name: id, tier, weekly_hours: { "GO!": 4, Impact: 10, Core: 70 }[tier], series: "Tech" });
const work = (hours, date = week, fields = {}) => ({ id: date, member_id: "me", date, hours, deleted: false, ...fields });
const task = (id, fields = {}) => ({ id, assignee_id: "me", due_date: "2026-10-23", archived: false, status: "todo", ...fields });
const completion = (id, fields = {}) => ({ id, task_id: id, member_id: "me", old_status: "todo", new_status: "done", occurred_at: "2026-10-22T10:00:00Z", changes: { after: { due_date: "2026-10-23", archived: false } }, ...fields });
const meeting = (id, fields = {}) => ({ id, starts_at: "2026-10-21T10:00:00Z", ends_at: "2026-10-21T11:00:00Z", cancelled: false, ...fields });
const source = (fields = {}) => ({ coverageStartedAt: "2026-10-01T10:00:00Z", members: [member()], work: [], weeklyHours: [], tasks: [], history: [], meetings: [], meetingMembers: [], attendance: [], eligibility: [], ...fields });
const metrics = (fields = {}) => ({ hours: 10, target: 10, hoursPoints: 30, tasks: 1, completedTasks: 1, taskPoints: 10, meetings: 1, attended: 1, excused: 0, attendancePoints: 20, applicablePoints: 100, ...fields });
const row = (memberId, score, fields = {}) => ({ memberId, name: memberId, tier: "Impact", score, metrics: metrics(), ...fields });

test("hours award proportional 30 points with DB tier targets; only attendance normalizes away", () => {
  for (const [tier, target] of [["GO!", 4], ["Impact", 10], ["Core", 70]]) for (const fraction of [0, .5, .75, 1, 2]) {
    // More than 24h is valid as imported weekly data, never fabricated daily work.
    const s = source({ members: [member("me", tier)], weeklyHours: [{ member_id: "me", week_start: week, through_date: "2026-10-23", hours: target * fraction }] });
    const result = scoreWeek(s, week, now)[0];
    assert.equal(result.metrics.target, target);
    assert.equal(result.metrics.hoursPoints, 30 * Math.min(fraction, 1));
    assert.equal(result.metrics.taskPoints, 0);
    assert.equal(result.metrics.attendancePoints, null);
    assert.equal(result.metrics.applicablePoints, 80);
    assert.equal(result.score, Math.min(fraction, 1) * 37.5);
  }
});

test("import coverage is not double-counted; later partial-week entries count; future/deleted/foreign work does not", () => {
  const result = scoreWeek(source({ weeklyHours: [{ member_id: "me", week_start: week, through_date: "2026-10-21", hours: 5 }], work: [work(5), work(2.5, "2026-10-23"), work(20, "2026-10-25"), work(20, week, { deleted: true }), work(24, week, { member_id: "foreign" })] }), week, now)[0];
  assert.equal(result.metrics.hours, 7.5);
  assert.equal(result.metrics.hoursPoints, 22.5);
});

test("assigned non-archived tasks need completion evidence, never a particular deadline", () => {
  const s = source({ tasks: [task("done", { status: "done" }), task("open"), task("archived", { archived: true }), task("no-deadline", { due_date: null }), task("past", { due_date: "2026-10-18" }), task("next", { due_date: "2026-10-26" }), task("foreign", { assignee_id: "other" })], history: [completion("done")] });
  const result = scoreWeek(s, week, now)[0];
  assert.equal(result.metrics.tasks, 5);
  assert.equal(result.metrics.completedTasks, 1);
  assert.equal(result.metrics.taskPoints, 10);
});

test("first completion prevents repeated awards, moving deadlines, reassignment and timestamp-only fabricated credit", () => {
  const s = source({ tasks: [task("done", { status: "done" }), task("moved", { status: "done" }), task("reassigned", { status: "done" }), task("unknown", { status: "done", completed_at: now.toISOString() })], history: [completion("done"), completion("again", { task_id: "done", occurred_at: "2026-10-23T10:00:00Z" }), completion("moved", { occurred_at: "2026-10-15T10:00:00Z", changes: { after: { due_date: "2026-10-16", archived: false } } }), completion("reassigned", { member_id: "other" })] });
  const result = scoreWeek(s, week, now)[0];
  assert.equal(result.metrics.completedTasks, 1);
  assert.equal(result.metrics.taskPoints, 10);
  assert.equal(achievementsFor(s, "me", [], now).achievements.find((a) => a.id === "task-master").progress, 2);
});

test("completions after cutoff or reopened before cutoff do not earn weekly points", () => {
  const result = scoreWeek(source({ tasks: [task("future", { status: "done" }), task("reopened")], history: [completion("future", { occurred_at: "2026-10-25T10:00:00Z" }), completion("reopened")] }), week, now)[0];
  assert.equal(result.metrics.completedTasks, 0);
});

test("meetings count present/remote, exclude excused/cancelled/future/nonrequired, and count missing attendance as absence", () => {
  const ids = ["present", "remote", "excused", "unexcused", "missing", "cancelled", "future"];
  const s = source({ meetings: [...ids.map((id) => meeting(id, id === "cancelled" ? { cancelled: true } : id === "future" ? { ends_at: "2026-10-25T10:00:00Z" } : {})), meeting("optional")], eligibility: ids.map((meeting_id) => ({ meeting_id, member_id: "me", observed: true })), attendance: ids.map((id) => ({ meeting_id: id, member_id: "me", status: id })) });
  const result = scoreWeek(s, week, now)[0];
  assert.equal(result.metrics.excused, 1);
  assert.equal(result.metrics.meetings, 4);
  assert.equal(result.metrics.attended, 2);
  assert.equal(result.metrics.attendancePoints, 10);
  assert.equal(result.metrics.applicablePoints, 100);
});

test("all excused meetings are N/A, and unrelated members' attendance never counts", () => {
  const s = source({ meetings: [meeting("one")], eligibility: [{ meeting_id: "one", member_id: "me", observed: true }], attendance: [{ meeting_id: "one", member_id: "me", status: "excused" }, { meeting_id: "one", member_id: "other", status: "present" }] });
  assert.equal(scoreWeek(s, week, now)[0].metrics.attendancePoints, null);
});

test("fully applicable weights produce the exact earned total and exclude future meetings in partial weeks", () => {
  const s = source({ work: [work(5)], tasks: [task("done", { status: "done" }), task("open")], history: [completion("done")], meetings: [meeting("one"), meeting("two")], eligibility: ["one", "two"].map((meeting_id) => ({ meeting_id, member_id: "me", observed: true })), attendance: [{ meeting_id: "one", member_id: "me", status: "remote" }] });
  const result = scoreWeek(s, week, now)[0];
  assert.equal(result.score, 35);
  assert.equal(result.metrics.applicablePoints, 100);
});

test("Ljubljana Monday and DST/year boundaries select the correct week, never host timezone", () => {
  for (const [instant, expected] of [["2026-03-29T21:59:59Z", "2026-03-23"], ["2026-03-29T22:00:00Z", "2026-03-30"], ["2026-10-25T22:59:59Z", "2026-10-19"], ["2026-10-25T23:00:00Z", "2026-10-26"], ["2025-12-31T23:30:00Z", "2025-12-29"]]) assert.equal(leaderboardWeek(null, new Date(instant)), expected);
  assert.equal(firstFullWeek("2026-10-24T12:00:00Z"), "2026-10-26");
  assert.equal(firstFullWeek(midnightInLjubljana("2026-10-26")), "2026-10-26");
  assert.equal(firstFullWeek("2026-10-26T00:00:00.000123+01:00"), "2026-11-02");
});

test("invalid, future and non-Monday period requests fail closed", () => {
  for (const value of ["", "2026-02-30", "2026-10-20", "2026-10-26", "bad", "1999-12-27"]) assert.throws(() => leaderboardWeek(value, now), (e) => e.status === 400);
});

test("stable ranking uses full-precision score then member ID, without mutating input", () => {
  const rows = [row("z", 50), row("a", 50), row("b", 50.01)];
  const before = structuredClone(rows);
  assert.deepEqual(rankScores(rows).map((r) => [r.memberId, r.rank]), [["b", 1], ["a", 2], ["z", 3]]);
  assert.deepEqual(rows, before);
});

test("members receive only their own breakdown; admin and superadmin receive all; public rows omit raw fields", () => {
  const rows = [row("me", 80), { ...row("other", 70), secret: "never expose", work: [work(10)] }];
  for (const role of ["MEMBER", "ADMIN", "SUPERADMIN"]) {
    const result = visibleRankings(rows, { role, member_id: "me" });
    assert.ok(result[0].metrics);
    assert.equal(!!result[1].metrics, role !== "MEMBER");
    assert.equal("secret" in result[1], false);
    assert.equal("work" in result[1], false);
    assert.deepEqual(Object.keys(result[1]).sort(), ["memberId", "name", "rank", "score", "tier", "summary", ...(role === "MEMBER" ? [] : ["metrics"])].sort());
    assert.deepEqual(Object.keys(result[1].summary).sort(), ["tasks", "hours", "target", "attendance", "streak", "rankChange"].sort());
  }
  assert.ok(visibleRankings(rows, { role: "MEMBER", member_id: null }).every((r) => !r.metrics));
});

test("score change requires the same target, tier and applicability mask; a missing prior week is never zero", () => {
  const current = row("me", 80), previous = row("me", 70);
  assert.equal(comparableChange(current, previous), 10);
  assert.equal(comparableChange(current, undefined), null);
  assert.equal(comparableChange(current, { ...previous, tier: "GO!" }), null);
  assert.equal(comparableChange(current, { ...previous, metrics: metrics({ taskPoints: null }) }), null);
  assert.equal(comparableChange(current, { ...previous, metrics: metrics({ target: 4 }) }), null);
});

test("On Fire, Unstoppable and Consistency Champion require verified successful closed weeks", () => {
  const s = source({ weeklyHours: Array.from({ length: 8 }, (_, i) => ({ member_id: "me", week_start: addDays(week, -(i + 1) * 7), through_date: addDays(week, -(i + 1) * 7 + 6), hours: 10 })) });
  const completed = new Map(Array.from({ length: 8 }, (_, i) => [addDays(week, -(i + 1) * 7), [row("me", 100)]]));
  const result = achievementsFor(s, "me", [...completed.values()], now, activityStreak(completed, "me", week));
  assert.equal(result.hoursStreak, 8);
  assert.equal(result.achievements.find((a) => a.id === "on-fire").achieved, true);
  assert.equal(result.achievements.find((a) => a.id === "consistency-champion").achieved, true);
  assert.equal(result.achievements.find((a) => a.id === "unstoppable").achieved, true);
  assert.equal(new Set(result.achievements.map((a) => a.id)).size, 9);
});

test("Task Master counts distinct first-completed tasks, never ten completions of the same task", () => {
  const repeated = source({ history: Array.from({ length: 10 }, (_, i) => completion(String(i), { task_id: "same" })) });
  assert.equal(achievementsFor(repeated, "me", [], now).achievements.find((a) => a.id === "task-master").achieved, false);
  const distinct = source({ history: Array.from({ length: 10 }, (_, i) => completion(String(i))) });
  assert.equal(achievementsFor(distinct, "me", [], now).achievements.find((a) => a.id === "task-master").achieved, true);
});

test("Always There skips excused/cancelled meetings, breaks on missing/unexcused and excludes unobserved historic eligibility", () => {
  const s = source({ meetings: Array.from({ length: 7 }, (_, i) => meeting(String(i), { ends_at: `2026-10-${10 + i}T11:00:00Z` })), eligibility: Array.from({ length: 7 }, (_, i) => ({ meeting_id: String(i), member_id: "me", observed: true })), attendance: Array.from({ length: 7 }, (_, i) => ({ meeting_id: String(i), member_id: "me", status: i === 0 ? "unexcused" : i === 2 ? "excused" : i % 2 ? "present" : "remote" })) });
  const badge = () => achievementsFor(s, "me", [], now).achievements.find((a) => a.id === "always-there");
  assert.equal(badge().achieved, true);
  s.eligibility[6].observed = false;
  assert.equal(badge().achieved, false);
  s.eligibility[6].observed = true;
  s.attendance = s.attendance.filter((a) => a.meeting_id !== "4");
  assert.equal(badge().achieved, false);
});

test("Perfect Week needs a finalized 100 with all categories applicable; provisional/normalized 100 is not enough", () => {
  const s = source({ work: [work(10)] });
  const badge = (completed) => achievementsFor(s, "me", completed, now).achievements.find((a) => a.id === "perfect-week").achieved;
  assert.equal(badge([]), false);
  assert.equal(badge([[row("me", 100, { metrics: metrics({ applicablePoints: 40 }) })]]), false);
  assert.equal(badge([[row("other", 100)]]), false);
  assert.equal(badge([[row("me", 99.999)]]), false);
  assert.equal(badge([[row("me", 100)]]), true);
  assert.deepEqual(achievementsFor(s, null, [], now), { achievements: [], hoursStreak: null });
});

test("final-week cutoff counts Sunday hours and excludes Monday events", () => {
  const s = source({ work: [work(10, "2026-10-25"), work(24, "2026-10-26")], tasks: [task("done", { status: "done" })], history: [completion("done", { occurred_at: "2026-10-25T23:00:00Z" })] });
  const result = scoreWeek(s, week, new Date("2026-10-25T23:00:00Z"))[0];
  assert.equal(result.metrics.hours, 10);
  assert.equal(result.metrics.completedTasks, 0);
});

test("automatic finalization reconstructs fully observed weeks at local Monday and preserves canonical scores after edits", async () => {
  const tracked = "2026-10-04T22:00:00Z"; // Monday midnight before autumn DST.
  const frozen = new Map(), cutoffs = [];
  let altered = false;
  const repository = {
    sourceAt: async (at) => {
      cutoffs.push(at.toISOString());
      const isCurrent = at.getTime() === now.getTime();
      const start = isCurrent ? week : at.toISOString().startsWith("2026-10-11") ? "2026-10-05" : "2026-10-12";
      return source({ coverageStartedAt: tracked, members: [member("me", altered && isCurrent ? "Core" : "Impact")], work: [work(isCurrent ? 5 : 10, start)] });
    },
    readFinalized: async () => new Map(frozen),
    finalize: async (start, rows) => { if (!frozen.has(start)) frozen.set(start, structuredClone(rows)); return frozen.get(start); },
  };
  const actor = { role: "MEMBER", member_id: "me" };
  const result = await assembleLeaderboard(actor, "2026-10-12", now, repository);
  assert.equal(result.status, "final");
  assert.equal(result.rows[0].score, 37.5);
  assert.equal(result.rows[0].tier, "Impact");
  assert.deepEqual(cutoffs, [now.toISOString(), "2026-10-11T22:00:00.000Z", "2026-10-18T22:00:00.000Z"]);
  assert.equal(frozen.size, 2);
  altered = true; cutoffs.length = 0;
  const after = await assembleLeaderboard(actor, "2026-10-12", now, repository);
  assert.deepEqual(after.rows, result.rows);
  assert.deepEqual(cutoffs, [now.toISOString()], "cached closed weeks do not reread today's sources");
  assert.equal(after.change, null, "changed tier is not compared to the old tier");
});

test("pre-tracking historical weeks remain unavailable, with no manufactured zero rankings", async () => {
  let writes = 0;
  const result = await assembleLeaderboard({ role: "MEMBER", member_id: "me" }, "2026-10-12", now, {
    sourceAt: async () => source({ coverageStartedAt: now.toISOString() }),
    readFinalized: async () => new Map(),
    finalize: async () => { writes++; return []; },
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.firstFullWeek, "2026-10-26");
  assert.deepEqual(result.rows, []);
  assert.equal(result.change, null);
  assert.equal(writes, 0);
});

test("failed evidence reads or finalization fail the response rather than publishing guessed scores", async () => {
  const repository = {
    sourceAt: async () => source({ coverageStartedAt: "2026-10-04T22:00:00Z" }),
    readFinalized: async () => new Map(),
    finalize: async () => { throw new Error("write failed"); },
  };
  await assert.rejects(assembleLeaderboard({ role: "MEMBER", member_id: "me" }, week, now, repository), /write failed/);
  repository.sourceAt = async () => { throw new Error("read failed"); };
  await assert.rejects(assembleLeaderboard({ role: "MEMBER", member_id: "me" }, week, now, repository), /read failed/);
});

test("a meeting crossing Sunday midnight belongs to its completion week and is never counted twice", () => {
  const s = source({ meetings: [meeting("overnight", { starts_at: "2026-10-25T22:30:00Z", ends_at: "2026-10-25T23:30:00Z" })], eligibility: [{ meeting_id: "overnight", member_id: "me", observed: true }], attendance: [{ meeting_id: "overnight", member_id: "me", status: "present" }] });
  assert.equal(scoreWeek(s, "2026-10-19", new Date("2026-10-26T01:00:00Z"))[0].metrics.meetings, 0);
  assert.equal(scoreWeek(s, "2026-10-26", new Date("2026-10-26T01:00:00Z"))[0].metrics.attended, 1);
});

test("five completions cap tasks at 50; no deadline, late deadlines and duplicate events cannot change 50/30/20", () => {
  const tasks = Array.from({ length: 8 }, (_, i) => task(String(i), { status: "done", due_date: i % 2 ? null : "2027-01-01" }));
  const events = tasks.map((t) => completion(t.id));
  const s = source({ tasks: [...tasks, tasks[0]], history: [...events, events[0]], work: [work(10)], meetings: [meeting("one")], eligibility: [{ meeting_id: "one", member_id: "me" }], attendance: [{ meeting_id: "one", member_id: "me", status: "remote" }] });
  const result = scoreWeek(s, week, now)[0];
  assert.equal(result.metrics.completedTasks, 8);
  assert.equal(result.metrics.taskPoints, 50);
  assert.equal(result.metrics.hoursPoints, 30);
  assert.equal(result.metrics.attendancePoints, 20);
  assert.equal(result.score, 100);
});

test("custom database target overrides tier default and invalid targets fail closed", () => {
  const s = source({ members: [{ ...member(), weekly_hours: 20 }], work: [work(10)] });
  assert.equal(scoreWeek(s, week, now)[0].metrics.target, 20);
  assert.equal(scoreWeek(s, week, now)[0].metrics.hoursPoints, 15);
  for (const weekly_hours of [-1, null, "bad", Infinity]) assert.throws(() => scoreWeek(source({ members: [{ ...member(), weekly_hours }] }), week, now), /tedenski cilj/);
  const disabled=scoreWeek(source({members:[{...member(),tier:"Volunteer",weekly_hours:0}]}),week,now)[0];
  assert.equal(disabled.metrics.hoursPoints,0);
  assert.equal(disabled.metrics.applicablePoints,50);
});

test("duplicate work and meeting rows do not double count; hours-only with no meetings is 37.5", () => {
  const entry = work(10);
  const s = source({ work: [entry, entry], meetings: [meeting("one"), meeting("one")], eligibility: [{ meeting_id: "one", member_id: "me" }], attendance: [{ meeting_id: "one", member_id: "me", status: "present" }] });
  assert.equal(scoreWeek(s, week, now)[0].metrics.hours, 10);
  assert.equal(scoreWeek(s, week, now)[0].metrics.meetings, 1);
  assert.equal(scoreWeek(source({ work: [entry] }), week, now)[0].score, 37.5);
});

test("activity streak ignores unfinished week and hours-only weeks, accepts tasks OR attendance, preserves longest", () => {
  const completed = new Map([
    ["2026-09-21", [row("me", 50)]], ["2026-09-28", [row("me", 50)]],
    ["2026-10-05", [row("me", 37.5, { metrics: metrics({ completedTasks: 0, attended: 0 }) })]],
    ["2026-10-12", [row("me", 50, { metrics: metrics({ completedTasks: 0, attended: 1 }) })]],
    [week, [row("me", 0, { metrics: metrics({ hours: 0 }) })]],
  ]);
  const s = activityStreak(completed, "me", week);
  assert.equal(s.current, 1);
  assert.equal(s.best, 2);
  assert.equal(s.next, 3);
  assert.equal(activityStreak(new Map(), "me", week).best, null);
  assert.equal(activityStreak(completed, "me", "2026-10-26").current, 0);
});

test("activity streak closes exactly at Ljubljana Monday across both DST boundaries", () => {
  for (const [start, boundary] of [["2026-03-23", "2026-03-29T22:00:00Z"], [week, "2026-10-25T23:00:00Z"]]) {
    const completed = new Map([[addDays(start, -7), [row("me", 100)]], [start, [row("me", 100)]]]);
    assert.equal(activityStreak(completed, "me", leaderboardWeek(null, new Date(Date.parse(boundary) - 1))).current, 1);
    assert.equal(activityStreak(completed, "me", leaderboardWeek(null, new Date(boundary))).current, 2);
  }
});

test("period averaging retains normalization per week, sums actual activity and never substitutes missing history", () => {
  const a = row("me", 37.5, { metrics: metrics({ completedTasks: 0, taskPoints: 0, attendancePoints: null, meetings: 0, attended: 0, applicablePoints: 80 }) });
  const b = row("me", 100, { metrics: metrics({ completedTasks: 5, taskPoints: 50 }) });
  const result = aggregateWeeks([[a], [], [b]])[0];
  assert.equal(result.score, 68.75);
  assert.equal(result.metrics.completedTasks, 5);
  assert.equal(result.metrics.hours, 20);
  assert.equal(result.metrics.target, 20);
  assert.deepEqual(aggregateWeeks([]), []);
});

test("rank movement is absent without history and only aggregate summaries are shared", () => {
  const rows = [row("me", 90), row("other", 80)];
  const actor = { role: "MEMBER", member_id: "me" };
  assert.equal(visibleRankings(rows, actor)[0].summary.rankChange, null);
  const projected = visibleRankings(rows, actor, new Map(), [row("me", 70), row("other", 80)]);
  assert.equal(projected[0].summary.rankChange, 1);
  assert.equal(projected[1].summary.rankChange, -1);
  assert.equal(projected[1].metrics, undefined);
});

test("period views use tracked weeks only; admin trends and private metrics never reach MEMBER", async () => {
  const repo = { sourceAt: async () => source({ coverageStartedAt: now.toISOString(), work: [work(10)] }), readFinalized: async () => new Map(), finalize: async () => { throw Error("unexpected"); } };
  for (const period of ["month", "all"]) {
    const result = await assembleLeaderboard({ role: "MEMBER", member_id: "me" }, week, now, repo, period);
    assert.equal(result.period, period);
    assert.equal(result.weeksCount, 1);
    assert.equal(result.trends, undefined);
    assert.equal(result.personal.activeMembers, 1);
    assert.equal(result.personal.streak.best, null);
    assert.equal(result.personal.rankChange, null);
    assert.equal(result.personal.previousTasks, null);
  }
  assert.equal((await assembleLeaderboard({ role: "ADMIN", member_id: null }, week, now, repo)).trends.length, 1);
});
