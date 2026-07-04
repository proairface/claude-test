import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeDevice } from "../test-utils/device.js";
import { gcTombstones } from "../src/model/gc.js";

test("gcTombstones drops only old tombstones, keeps live + recent", () => {
  const now = 1_000_000_000_000;
  const day = 86_400_000;
  const recs = {
    a: { deleted: false, updatedAt: now },
    b: { deleted: true, updatedAt: now - 1000 },        // recent tombstone
    c: { deleted: true, updatedAt: now - 100 * day },   // old tombstone
  };
  const { records, removed } = gcTombstones(recs, now, 90 * day);
  assert.equal(removed, 1);
  assert.ok(records.a && records.b);
  assert.equal(records.c, undefined);
});

test("a no-op re-sync is skipped (conditional pull, no push)", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  A.add("https://x.example", "X");
  await A.sync();
  const versionAfterFirst = t.getVersion();

  const res = await A.sync(); // nothing changed
  assert.equal(res.skipped, true);
  assert.equal(t.getVersion(), versionAfterFirst); // no second push
});

test("importing remote changes doesn't trigger an unnecessary push", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  A.add("https://shared.example", "S");
  await A.sync();
  const v = t.getVersion();

  const B = makeDevice(t, "B");
  await B.sync(); // B only imports; it contributes nothing new
  assert.deepEqual(B.urls(), ["https://shared.example"]);
  assert.equal(t.getVersion(), v); // B did not re-upload
});

test("tombstone GC prunes an old delete-marker when the file is next written", async () => {
  const day = 86_400_000;
  const oldTomb = {
    id: "old", type: "bookmark", deviceId: "Z", lamport: 1, updatedAt: 1, deleted: true,
    payload: { url: "https://gone.example", title: "g", parentPath: ["bar"], index: 0 },
  };
  const t = createMemoryAdapter({ version: 1, records: { old: oldTomb }, updatedAt: 1 });
  const A = makeDevice(t, "A");
  A.add("https://new.example", "N"); // a local change forces a push (and GC)
  await A.sync();

  const recs = t.snapshot().records;
  assert.equal(recs.old, undefined, "old tombstone GC'd");
  assert.ok(Object.values(recs).some((r) => r.payload.url === "https://new.example"));
});
