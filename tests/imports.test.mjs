import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  planImport,
  importKey,
  resolveMember,
} from "../lib/imports.ts";
const members = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "one@sandbox.example",
    name: "One",
  },
];
test("CSV preserves quoted descriptions, BOM and line endings; malformed CSV is rejected", () => {
  const rows = parseCsv(
    '\uFEFFemail,date,hours,description\r\none@sandbox.example,2026-10-20,1.25,"A, B"\r\n',
  );
  assert.equal(rows[0].description, "A, B");
  assert.throws(() => parseCsv('a,b\n"open'));
  assert.throws(() => parseCsv("a,b\n1"));
});
test("normalized member matching preserves UUID and rejects ambiguity", () => {
  assert.equal(
    resolveMember({ email: " ONE@SANDBOX.EXAMPLE " }, members),
    members[0].id,
  );
  assert.throws(() => resolveMember({ member_name: "Missing" }, members));
  assert.throws(() =>
    resolveMember({ member_name: "One" }, [...members, ...members]),
  );
});
test("historical work import is deterministic, validates hours and reports duplicate rows", () => {
  const rows = [{ email: members[0].email, date: "2026-10-20", hours: "1.25" }];
  const a = planImport("work", rows, members),
    b = planImport("work", rows, members);
  assert.equal(a.conflicts.length, 0);
  assert.equal(a.rows[0].import_key, b.rows[0].import_key);
  assert.equal(
    planImport("work", [...rows, ...rows], members).conflicts.length,
    1,
  );
  assert.equal(
    planImport("work", [{ ...rows[0], hours: "0.1" }], members).conflicts
      .length,
    1,
  );
  assert.equal(
    importKey("work", { a: 1, b: 2 }),
    importKey("work", { b: 2, a: 1 }),
  );
});
test("attendance import uses stable event IDs and fails closed for ambiguous series/date", () => {
  const meetings = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      calendar_id: "cal",
      google_event_id: "g1",
      series: "Community",
      starts_at: "2026-10-20T12:00:00Z",
    },
  ];
  const row = {
    email: members[0].email,
    date: "2026-10-20",
    series: "Community",
    status: "present",
  };
  assert.equal(
    planImport("attendance", [row], members, meetings).rows.length,
    1,
  );
  assert.equal(
    planImport(
      "attendance",
      [row, { ...row, status: "remote" }],
      members,
      meetings,
    ).conflicts.length,
    1,
  );
  assert.equal(
    planImport("attendance", [row], members, [
      ...meetings,
      {
        ...meetings[0],
        id: "33333333-3333-4333-8333-333333333333",
        google_event_id: "g2",
      },
    ]).conflicts.length,
    1,
  );
  assert.equal(
    planImport(
      "attendance",
      [{ ...row, google_event_id: "g1" }],
      members,
      meetings,
    ).rows[0].meeting_id,
    meetings[0].id,
  );
});
test("weekly aggregates preserve 70+ hours without inventing daily entries", () => {
  const plan = planImport(
    "weekly-hours",
    [
      {
        email: members[0].email,
        week_start: "2026-10-19",
        through_date: "2026-10-23",
        hours: 73,
      },
    ],
    members,
  );
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.rows[0].hours, 73);
  assert.equal(plan.rows[0].week_start, "2026-10-19");
  assert.equal(
    planImport(
      "weekly-hours",
      [
        {
          email: members[0].email,
          week_start: "2026-10-20",
          through_date: "2026-10-23",
          hours: 73,
        },
      ],
      members,
    ).conflicts.length,
    1,
  );
});

test("destination preflight skips exact repeats and blocks changed weekly totals/corrected attendance", async () => {
  const { preflightImport } = await import("../lib/imports.ts");
  const weekly = planImport("weekly-hours", [{ email: members[0].email, week_start: "2026-10-19", through_date: "2026-10-23", hours: 73 }], members).rows;
  const repeat = preflightImport("weekly-hours", weekly, [{ ...weekly[0], hours: "73.00" }]);
  assert.equal(repeat.unchanged, 1);
  assert.equal(repeat.rows.length, 0);
  assert.equal(repeat.conflicts.length, 0);
  assert.equal(preflightImport("weekly-hours", weekly, [{ ...weekly[0], hours: 70 }]).conflicts.length, 1);
  const attendance = { meeting_id: "meeting", member_id: members[0].id, status: "present", note: "", import_key: "key" };
  const corrected = preflightImport("attendance", [attendance], [{ ...attendance, status: "excused" }]);
  assert.equal(corrected.conflicts.length, 1);
  assert.equal(corrected.rows.length, 0);
});

test("destination preflight blocks both overlap directions, unknown projects and unkeyed daily duplicates", async () => {
  const { preflightImport } = await import("../lib/imports.ts");
  const weekly = { member_id: members[0].id, week_start: "2026-10-19", through_date: "2026-10-23", hours: 73 };
  const work = { member_id: members[0].id, date: "2026-10-20", hours: 1, project_id: null, description: "", import_key: "work" };
  assert.equal(preflightImport("work", [work], [], { weeklyHours: [weekly] }).conflicts.length, 1);
  assert.equal(preflightImport("weekly-hours", [weekly], [], { work: [work] }).conflicts.length, 1);
  assert.equal(preflightImport("weekly-hours", [weekly], [], { work: [{ ...work, deleted: true }] }).rows.length, 1);
  assert.equal(preflightImport("work", [{ ...work, project_id: "missing" }], [], { projects: [] }).conflicts.length, 1);
  assert.equal(preflightImport("work", [work], [{ ...work, import_key: null }]).unchanged, 1);
  assert.equal(preflightImport("work", [work], [{ ...work, deleted: true }]).conflicts.length, 1);
});

test("destination preflight preserves projects with the same normalized name and flags ambiguity", async () => {
  const { preflightImport } = await import("../lib/imports.ts");
  const row = { name: "Source project", description: "Original", status: "active", import_key: "project" };
  assert.equal(preflightImport("projects", [row], [{ ...row, description: "Corrected" }]).conflicts.length, 1);
  assert.equal(preflightImport("projects", [row], [{ ...row }, { ...row, import_key: "other" }]).conflicts.length, 1);
  assert.equal(preflightImport("projects", [row], [{ ...row, name: " source PROJECT " }]).conflicts.length, 1);
  const duplicateNames = planImport("projects", [row, { ...row, name: "source PROJECT", description: "Different source" }], members);
  assert.equal(duplicateNames.conflicts.length, 1);
});
