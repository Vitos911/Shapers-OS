import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("SQL migration logs changes atomically and enforces immutable history and all role boundaries", { timeout: 60000 }, () => {
  const output = execFileSync(process.execPath, ["scripts/check-history-db.mjs"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 55000,
  });
  const result = JSON.parse(output.trim());
  assert.equal(result.migration, "PASS");
  assert.equal(result.taskWrites, "PASS");
  assert.equal(result.immutableLogs, "PASS");
  assert.equal(result.rolledBack, true);
});
