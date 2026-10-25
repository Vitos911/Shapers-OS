import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("release migrations preserve task ownership, historical imports, immutable history and leaderboard on fresh and upgraded databases", { timeout: 120000 }, () => {
  const result = JSON.parse(execFileSync(process.execPath, ["scripts/check-release-db.mjs"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 110000,
  }).trim());
  for (const key of ["history", "taskPermissions", "attendanceImport", "leaderboard", "schemaParity"]) assert.equal(result[key], "PASS");
  assert.equal(result.rolledBack, true);
});
