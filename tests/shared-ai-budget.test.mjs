import test from "node:test";
import assert from "node:assert/strict";
import { reserveSharedBudget } from "../lib/ask-shaper.ts";

test("shared quota reserves with the authenticated client and rejects exhaustion or missing migrations before AI work", async () => {
  const calls = [];
  await reserveSharedBudget({ rpc: async (...args) => { calls.push(args); return { data: true, error: null }; } });
  assert.deepEqual(calls, [["org_reserve_ai_budget"]]);
  await assert.rejects(reserveSharedBudget({ rpc: async () => ({ data: false, error: null }) }), error => error.status === 429);
  for (const result of [{ data: null, error: { message: "private database failure" } }, { data: "true", error: null }]) {
    await assert.rejects(reserveSharedBudget({ rpc: async () => result }), error => error.status === 503 && !error.message.includes("private database failure"));
  }
});
