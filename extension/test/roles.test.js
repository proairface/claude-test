import { test } from "node:test";
import assert from "node:assert/strict";
import { runSyncCycle } from "../src/sync/engine.js";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeDevice } from "../test-utils/device.js";

test("receive-only applies remote but never uploads", async () => {
  const t = createMemoryAdapter();
  // Seed shared state with one bookmark from device "S".
  const S = makeDevice(t, "S");
  S.add("https://from-s.example", "S");
  await S.sync();
  const afterSeed = JSON.stringify(t.snapshot().records);

  // Receive-only device R: imports S's bookmark, adds its own locally, but must
  // NOT push its own to the shared state.
  const db = [{ url: "https://r-local.example", title: "R", parentPath: ["bar"], index: 0 }];
  let baseline = {}, lamport = 0;
  const { makeId } = await import("../src/model/records.js");
  let importedUrls = [];
  await runSyncCycle({
    transport: t,
    collect: async () => Promise.all(db.map(async (b) => ({
      id: await makeId("bookmark", { url: b.url, parentPath: b.parentPath }),
      payload: { url: b.url, title: b.title, parentPath: b.parentPath, index: 0 },
    }))),
    apply: async (recs) => { importedUrls = importedUrls.concat(recs.map((r) => r.payload.url)); },
    store: {
      getDeviceId: async () => "R", getLamport: async () => lamport, setLamport: async (n) => { lamport = n; },
      getBaseline: async () => baseline, setBaseline: async (m) => { baseline = m; },
    },
    type: "bookmark",
    mode: "receive",
  });

  assert.deepEqual(importedUrls, ["https://from-s.example"]); // imported remote
  assert.equal(JSON.stringify(t.snapshot().records), afterSeed); // shared state unchanged (no upload)
});

test("send-only uploads local but never applies remote", async () => {
  const t = createMemoryAdapter();
  const S = makeDevice(t, "S");
  S.add("https://from-s.example", "S");
  await S.sync();

  const db = [{ url: "https://master.example", title: "M", parentPath: ["bar"], index: 0 }];
  let baseline = {}, lamport = 0;
  const { makeId } = await import("../src/model/records.js");
  let importedCount = 0;
  await runSyncCycle({
    transport: t,
    collect: async () => Promise.all(db.map(async (b) => ({
      id: await makeId("bookmark", { url: b.url, parentPath: b.parentPath }),
      payload: { url: b.url, title: b.title, parentPath: b.parentPath, index: 0 },
    }))),
    apply: async (recs) => { importedCount += recs.length; },
    store: {
      getDeviceId: async () => "M", getLamport: async () => lamport, setLamport: async (n) => { lamport = n; },
      getBaseline: async () => baseline, setBaseline: async (m) => { baseline = m; },
    },
    type: "bookmark",
    mode: "send",
  });

  assert.equal(importedCount, 0); // never applied remote
  const urls = Object.values(t.snapshot().records).map((r) => r.payload.url).sort();
  assert.deepEqual(urls, ["https://from-s.example", "https://master.example"]); // pushed local
});
