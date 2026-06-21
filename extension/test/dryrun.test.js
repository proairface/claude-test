import { test } from "node:test";
import assert from "node:assert/strict";
import { runSyncCycle } from "../src/sync/engine.js";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeDevice } from "../test-utils/device.js";
import { makeId } from "../src/model/records.js";

test("dry run reports changes but applies and pushes nothing", async () => {
  const t = createMemoryAdapter();
  const S = makeDevice(t, "S");
  S.add("https://incoming.example", "I");
  await S.sync();
  const before = JSON.stringify(t.snapshot().records);

  let applied = 0;
  let baseline = {}, lamport = 0;
  const res = await runSyncCycle({
    transport: t,
    collect: async () => [],
    apply: async (recs) => { applied += recs.length; },
    store: {
      getDeviceId: async () => "R", getLamport: async () => lamport, setLamport: async (n) => { lamport = n; },
      getBaseline: async () => baseline, setBaseline: async (m) => { baseline = m; },
    },
    type: "bookmark",
    dryRun: true,
  });

  assert.equal(applied, 0);                         // nothing applied
  assert.equal(JSON.stringify(t.snapshot().records), before); // nothing pushed
  assert.equal(baseline && Object.keys(baseline).length, 0);   // baseline not persisted
  assert.equal(res.changes.length, 1);              // but the incoming change is reported
  assert.equal(res.changes[0].payload.url, "https://incoming.example");
});

test("dry run shows a pending removal without performing it", async () => {
  const url = "https://gone.example";
  const id = await makeId("bookmark", { url, parentPath: ["bar"] });
  const baselineRec = { id, type: "bookmark", deviceId: "A", lamport: 1, updatedAt: 1, deleted: false,
    payload: { url, title: "g", parentPath: ["bar"], index: 0 } };
  const tomb = { ...baselineRec, deviceId: "B", lamport: 2, deleted: true };
  const t = createMemoryAdapter({ version: 1, records: { [id]: tomb }, updatedAt: 2 });

  const res = await runSyncCycle({
    transport: t,
    collect: async () => [{ id, payload: baselineRec.payload }], // still present locally
    apply: async () => {},
    store: {
      getDeviceId: async () => "A", getLamport: async () => 1, setLamport: async () => {},
      getBaseline: async () => ({ [id]: baselineRec }), setBaseline: async () => {},
    },
    type: "bookmark",
    dryRun: true,
  });

  assert.equal(res.changes.length, 1);
  assert.equal(res.changes[0].deleted, true); // would remove locally
});
