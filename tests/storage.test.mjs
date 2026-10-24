import test from "node:test";
import assert from "node:assert/strict";
import { cloudStore } from "../lib/storage.ts";
import { emptyWorkspace } from "../lib/model.ts";

function database({ editable = true } = {}) {
  let row = { name: "Test", payload: emptyWorkspace(), revision: 1 };
  let offline = false;
  const client = {
    rpc: async () => ({ data: editable, error: null }),
    from: () => {
      let change;
      let expected;
      const query = {
        select() { return query; },
        eq(key, value) { if (key === "revision") expected = value; return query; },
        update(value) { change = value; return query; },
        async single() { return offline ? { error: new Error("offline") } : { data: structuredClone(row), error: null }; },
        async maybeSingle() {
          if (offline) return { error: new Error("offline") };
          if (expected !== row.revision) return { data: null, error: null };
          row = { ...row, ...structuredClone(change), revision: row.revision + 1 };
          return { data: structuredClone(row), error: null };
        },
      };
      return query;
    },
  };
  return { client, row: () => row, offline: value => { offline = value; } };
}

test("cloud writes require a successful load and preserve data after an acknowledged save", async () => {
  const db = database(); const store = cloudStore(db.client, "test");
  await assert.rejects(() => store.save(emptyWorkspace(), "No load"));
  await store.load();
  const result = await store.save(emptyWorkspace(), "Saved");
  assert.equal(result.name, "Saved");
  assert.equal(db.row().revision, 2);
  assert.equal((await cloudStore(db.client, "test").load()).name, "Saved");
});

test("concurrent clients cannot silently overwrite a newer revision", async () => {
  const db = database(); const first = cloudStore(db.client, "test"); const second = cloudStore(db.client, "test");
  await first.load(); await second.load();
  await first.save(emptyWorkspace(), "Newer");
  await assert.rejects(() => second.save(emptyWorkspace(), "Stale"), /spremenil drug uporabnik/);
  assert.equal(db.row().name, "Newer");
  await second.load(); await second.save(emptyWorkspace(), "After refresh");
  assert.equal(db.row().revision, 3);
});

test("network failures are reported and do not become local or cloud success", async () => {
  const db = database(); const store = cloudStore(db.client, "test"); await store.load();
  db.offline(true);
  await assert.rejects(() => store.save(emptyWorkspace(), "Offline"), /ni uspelo/);
  assert.equal(db.row().name, "Test"); assert.equal(db.row().revision, 1);
});

test("viewer cannot save and invalid payloads never reach an acknowledged write", async () => {
  const db = database({ editable: false }); const store = cloudStore(db.client, "test");
  assert.equal((await store.load()).editable, false);
  await assert.rejects(() => store.save(emptyWorkspace(), "Edit"), /samo za ogled/);
  assert.equal(db.row().revision, 1);
  const writable = database(); const editor = cloudStore(writable.client, "test"); await editor.load();
  await assert.rejects(() => editor.save({ version: 9 }, "Broken"));
  assert.equal(writable.row().revision, 1);
});
