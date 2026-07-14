import { test } from "node:test";
import assert from "node:assert/strict";
import { runSyncCycle } from "../src/sync/engine.js";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeId } from "../src/model/records.js";
import { RollbackError } from "../src/model/validate.js";

// A device whose store reports a fixed "highest seq seen" for rollback checks.
function device(transport, { maxSeen = 0, rollbackGuard = false, items = [] } = {}) {
  let seq = maxSeen, baseline = {}, lamport = 0, etag = null;
  const store = {
    getDeviceId: async () => "A",
    getLamport: async () => lamport, setLamport: async (n) => { lamport = n; },
    getBaseline: async () => baseline, setBaseline: async (m) => { baseline = m; },
    getLastEtag: async () => etag, setLastEtag: async (e) => { etag = e; },
    getRollbackSeq: async () => seq, setRollbackSeq: async (n) => { seq = n; },
  };
  return {
    seenSeq: () => seq,
    sync: () => runSyncCycle({
      transport, collect: async () => items, apply: async () => {},
      store, type: "bookmark", rollbackGuard,
    }),
  };
}

function nonEmptyState(seq) {
  return { version: 1, seq, updatedAt: 1, records: {
    x: { id: "x", type: "bookmark", deviceId: "Z", lamport: 1, updatedAt: 1, deleted: false,
      payload: { url: "https://x.example/", title: "X", parentPath: ["bar"], index: 0 } },
  } };
}

test("rollback guard rejects a state whose seq went backwards", async () => {
  const t = createMemoryAdapter(nonEmptyState(2));         // transport serves seq 2
  const A = device(t, { maxSeen: 5, rollbackGuard: true }); // but we've seen seq 5
  await assert.rejects(() => A.sync(), RollbackError);
});

test("without the guard, an older seq is accepted", async () => {
  const t = createMemoryAdapter(nonEmptyState(2));
  const A = device(t, { maxSeen: 5, rollbackGuard: false });
  await assert.doesNotReject(() => A.sync());
});

test("an EMPTY state is exempt (legitimate reset), even below maxSeen", async () => {
  const t = createMemoryAdapter({ version: 1, seq: 0, updatedAt: 1, records: {} });
  const A = device(t, { maxSeen: 5, rollbackGuard: true });
  await assert.doesNotReject(() => A.sync());
});

test("a normal push increments seq and advances the tracked max", async () => {
  const id = await makeId("bookmark", { url: "https://new.example/", parentPath: ["bar"] });
  const t = createMemoryAdapter(); // empty, seq undefined -> 0
  const A = device(t, {
    maxSeen: 0, rollbackGuard: true,
    items: [{ id, payload: { url: "https://new.example/", title: "N", parentPath: ["bar"], index: 0 } }],
  });
  await A.sync();
  assert.equal(t.snapshot().seq, 1);   // file seq bumped
  assert.equal(A.seenSeq(), 1);        // tracked max advanced
});
