import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { parseCsv, planImport } from "../lib/imports.ts";
const args = process.argv.slice(2),
  option = (k) => args[args.indexOf(k) + 1];
if (!args.includes("--type") || !args.includes("--file"))
  throw new Error(
    "Usage: node --env-file=.env.local scripts/import-sandbox.mjs --type projects|work|weekly-hours|attendance --file PATH [--apply]",
  );
const key = process.env.SUPABASE_SECRET_KEY;
if (!key) throw new Error("SUPABASE_SECRET_KEY is required (server only).");
const db = createClient(process.env.SUPABASE_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function all(table) {
  const out = [];
  for (let start = 0; start < 50000; start += 500) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order("id")
      .range(start, start + 499);
    if (error) throw new Error(`Cannot read ${table}`);
    out.push(...data);
    if (data.length < 500) return out;
  }
  throw new Error("Import input exceeds safe limit");
}
const text = await readFile(option("--file"), "utf8"),
  rows = option("--file").endsWith(".json") ? JSON.parse(text) : parseCsv(text);
if (!Array.isArray(rows) || rows.length > 10000)
  throw new Error("Expected up to 10,000 rows");
const kind = option("--type"),
  plan = planImport(
    kind,
    rows,
    await all("members"),
    kind === "attendance" ? await all("org_meetings") : [],
  );
console.log(
  JSON.stringify(
    {
      dryRun: !args.includes("--apply"),
      planned: plan.rows.length,
      conflicts: plan.conflicts,
    },
    null,
    2,
  ),
);
if (plan.conflicts.length)
  throw new Error("Resolve all conflicts before importing; no writes made");
if (args.includes("--apply")) {
  const table = {
    projects: "org_projects",
    work: "org_work_entries",
    "weekly-hours": "org_weekly_hours",
    attendance: "org_attendance",
  }[kind];
  if (!table) throw new Error("Invalid import type");
  // Conflict targets avoid overwriting edits or attendance from an earlier import.
  for (const row of plan.rows) {
    const { error } = await db
      .from(table)
      .upsert(row, {
        onConflict:
          kind === "attendance"
            ? "meeting_id,member_id"
            : kind === "weekly-hours"
              ? "member_id,week_start"
              : "import_key",
        ignoreDuplicates: true,
      });
    if (error)
      throw new Error(
        `Import stopped: ${error.code}. Already imported rows are safe to rerun.`,
      );
  }
  console.log("Import completed; existing rows and attendance preserved.");
}
