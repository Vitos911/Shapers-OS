import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ljubljanaDate } from "../lib/organization.ts";

test("supplied ICS preserves 55 unique meetings, member emails and Ljubljana DST schedule", async () => {
  const source = (
    await readFile(
      new URL("../supabase/seed/meetings.ics", import.meta.url),
      "utf8",
    )
  ).replace(/\r?\n[ \t]/g, "");
  const events = [
    ...source.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g),
  ].map((m) =>
    Object.fromEntries(
      m[1]
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const i = line.indexOf(":");
          return [line.slice(0, i), line.slice(i + 1)];
        }),
    ),
  );
  assert.equal(events.length, 55);
  assert.equal(new Set(events.map((e) => e.UID)).size, 55);
  const before = events.find(
      (e) => e.UID === "community-20261012@sandbox.example",
    ),
    after = events.find((e) => e.UID === "community-20261026@sandbox.example");
  assert.equal(before.DTSTART, "20261012T160000Z");
  assert.equal(after.DTSTART, "20261026T170000Z");
  for (const e of events) {
    assert.ok(e.DESCRIPTION.includes("@sandbox.example"));
    assert.ok(e.DTEND > e.DTSTART);
    const d = e.DTSTART.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z",
    );
    assert.equal(
      ljubljanaDate(new Date(d)).replaceAll("-", ""),
      e.UID.match(/(\d{8})@/)[1],
    );
  }
});
