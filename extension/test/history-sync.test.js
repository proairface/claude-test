import { test } from "node:test";
import assert from "node:assert/strict";
import { runHistorySync } from "../src/sync/history.js";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeId } from "../src/model/records.js";

// In-memory "browser" whose local history is `visits`. apply() inserts imported
// visits into local history (as Firefox would, with the original visitTime),
// which exercises the loop-safety (knownIds) path.
function historyDevice(transport, deviceId) {
  const visits = []; // {url, visitTime}
  const applied = [];
  let baseline = {};
  let lamport = 0;
  let watermark = null;

  const collect = async (since, knownIds, dev) => {
    const out = [];
    for (const v of visits) {
      if (v.visitTime < since) continue;
      const id = await makeId("visit", { url: v.url, visitTime: v.visitTime });
      if (knownIds.has(id)) continue;
      out.push({ id, payload: { url: v.url, title: "", visitTime: v.visitTime, ownerDevice: dev } });
    }
    return out;
  };
  const apply = async (recs) => {
    for (const r of recs) {
      applied.push(r);
      visits.push({ url: r.payload.url, visitTime: r.payload.visitTime });
    }
  };
  const store = {
    getDeviceId: async () => deviceId,
    getLamport: async () => lamport, setLamport: async (n) => { lamport = n; },
    getBaseline: async () => baseline, setBaseline: async (m) => { baseline = m; },
    getWatermark: async () => watermark, setWatermark: async (ms) => { watermark = ms; },
  };
  return {
    visit: (url, visitTime) => visits.push({ url, visitTime }),
    clear: () => { visits.length = 0; },
    appliedUrls: () => applied.map((r) => r.payload.url).sort(),
    sync: () => runHistorySync({ transport, collect, apply, store, type: "visit", initialWatermark: 0 }),
  };
}

const liveVisitUrls = (adapter) =>
  Object.values(adapter.snapshot().records)
    .filter((r) => !r.deleted && r.type === "visit")
    .map((r) => r.payload.url).sort();

test("visits propagate to other devices and re-sync is idempotent", async () => {
  const t = createMemoryAdapter();
  const A = historyDevice(t, "A");
  const B = historyDevice(t, "B");

  A.visit("https://a.example", 1000);
  await A.sync();
  await B.sync();
  assert.deepEqual(B.appliedUrls(), ["https://a.example"]);

  const again = await B.sync();
  assert.equal(again.applied, 0); // nothing new to import
});

test("history is append-only: clearing one device does not delete it elsewhere", async () => {
  const t = createMemoryAdapter();
  const A = historyDevice(t, "A");
  const B = historyDevice(t, "B");

  A.visit("https://keep.example", 1000);
  await A.sync();
  await B.sync();
  assert.deepEqual(liveVisitUrls(t), ["https://keep.example"]);

  A.clear();            // user clears local history on A
  await A.sync();       // must NOT tombstone the shared visit

  assert.deepEqual(liveVisitUrls(t), ["https://keep.example"]);
  // B still has it; a re-sync imports nothing new and removes nothing.
  const r = await B.sync();
  assert.equal(r.applied, 0);
  assert.deepEqual(liveVisitUrls(t), ["https://keep.example"]);
});

test("a device does not re-import or duplicate its own applied visits", async () => {
  const t = createMemoryAdapter();
  const A = historyDevice(t, "A");
  const B = historyDevice(t, "B");
  A.visit("https://x.example", 5000);
  await A.sync();
  await B.sync();              // B imports it
  await B.sync();              // and again
  await B.sync();
  // Still exactly one record for that visit — no runaway duplication.
  assert.equal(liveVisitUrls(t).filter((u) => u === "https://x.example").length, 1);
});
