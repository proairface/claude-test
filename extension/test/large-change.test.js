// The large-change safeguard must abort a cycle (no apply, no push) when a sync
// would remove more LOCAL items than the configured limit. The trigger: this
// device holds N bookmarks (live + in baseline) and the remote has tombstones
// for them (deleted elsewhere) -> the cycle wants to remove all N locally.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSyncCycle } from "../src/sync/engine.js";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeId } from "../src/model/records.js";
import { LargeChangeError } from "../src/model/validate.js";

async function build(urls) {
  const baseline = {};       // what this device last synced (live, lamport 1)
  const remoteRecords = {};  // shared state: tombstoned elsewhere (lamport 2)
  const items = [];          // still open locally
  for (const url of urls) {
    const id = await makeId("bookmark", { url, parentPath: ["bar"] });
    const payload = { url, title: "x", parentPath: ["bar"], index: 0 };
    baseline[id] = { id, type: "bookmark", deviceId: "A", lamport: 1, updatedAt: 1, deleted: false, payload };
    remoteRecords[id] = { id, type: "bookmark", deviceId: "B", lamport: 2, updatedAt: 2, deleted: true, payload };
    items.push({ id, payload });
  }
  return { baseline, remoteRecords, items };
}

function device(transport, baseline, items, opts = {}) {
  let applied = 0;
  return {
    appliedCount: () => applied,
    sync: () => runSyncCycle({
      transport,
      collect: async () => items,
      apply: async (recs) => { applied += recs.length; },
      store: {
        getDeviceId: async () => "A", getLamport: async () => 1, setLamport: async () => {},
        getBaseline: async () => baseline, setBaseline: async () => {},
      },
      type: "bookmark",
      ...opts,
    }),
  };
}

test("a sync over the removal limit throws and does not apply or push", async () => {
  const { baseline, remoteRecords, items } = await build(["https://1.example", "https://2.example", "https://3.example"]);
  const t = createMemoryAdapter({ version: 1, records: remoteRecords, updatedAt: 2 });
  const before = t.snapshot();

  const dev = device(t, baseline, items, { maxRemovals: 1 });
  await assert.rejects(() => dev.sync(), LargeChangeError);

  assert.equal(dev.appliedCount(), 0);                    // nothing applied
  assert.deepEqual(t.snapshot().records, before.records); // nothing pushed
});

test("the same removals proceed when bypassed (allowLargeChange)", async () => {
  const { baseline, remoteRecords, items } = await build(["https://1.example", "https://2.example", "https://3.example"]);
  const t = createMemoryAdapter({ version: 1, records: remoteRecords, updatedAt: 2 });

  const dev = device(t, baseline, items, { maxRemovals: 1, allowLargeChange: true });
  await dev.sync();

  assert.equal(dev.appliedCount(), 3); // 3 removals applied locally
});
