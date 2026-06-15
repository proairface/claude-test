import { test } from "node:test";
import assert from "node:assert/strict";
import { runSyncCycle } from "../src/sync/engine.js";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeId } from "../src/model/records.js";

// --- A minimal in-memory "browser" device --------------------------------
// Models a local bookmark DB plus the per-device sync store, then exposes
// collect/apply that mirror the real collector/applier semantics at the data
// level (identity = url + parentPath). This isolates engine + merge logic from
// the actual browser APIs.
function makeDevice(transport, deviceId) {
  /** @type {Array<{url:string,title:string,parentPath:string[],index:number}>} */
  const db = [];
  const find = (url, parentPath) =>
    db.find((b) => b.url === url && JSON.stringify(b.parentPath) === JSON.stringify(parentPath));

  const collect = async () =>
    Promise.all(
      db.map(async (b) => ({
        id: await makeId("bookmark", { url: b.url, parentPath: b.parentPath }),
        payload: { url: b.url, title: b.title, parentPath: b.parentPath, index: b.index },
      })),
    );

  const apply = async (records) => {
    for (const rec of records) {
      const { url, title, parentPath } = rec.payload;
      const existing = find(url, parentPath);
      if (rec.deleted) {
        if (existing) db.splice(db.indexOf(existing), 1);
      } else if (!existing) {
        db.push({ url, title, parentPath, index: rec.payload.index ?? 0 });
      } else {
        existing.title = title;
      }
    }
  };

  let lamport = 0;
  let baseline = {};
  const store = {
    getDeviceId: async () => deviceId,
    getLamport: async () => lamport,
    setLamport: async (n) => { lamport = n; },
    getBaseline: async () => baseline,
    setBaseline: async (m) => { baseline = m; },
  };

  const sync = () => runSyncCycle({ transport, collect, apply, store, type: "bookmark" });
  const urls = () => db.map((b) => b.url).sort();
  const add = (url, title, parentPath = ["bar"]) => db.push({ url, title, parentPath, index: 0 });
  const del = (url, parentPath = ["bar"]) => {
    const b = find(url, parentPath);
    if (b) db.splice(db.indexOf(b), 1);
  };
  return { db, sync, urls, add, del };
}

test("a create propagates across devices", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");

  A.add("https://a.example", "Site A");
  await A.sync();
  await B.sync();

  assert.deepEqual(B.urls(), ["https://a.example"]);
});

test("re-syncing an unchanged device applies nothing", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");
  A.add("https://a.example", "Site A");
  await A.sync();
  await B.sync();

  const second = await B.sync();
  assert.equal(second.applied, 0);
});

test("a delete propagates and does not resurrect", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");

  A.add("https://gone.example", "Temp");
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), ["https://gone.example"]);

  A.del("https://gone.example");
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), []); // deleted on B

  // Passive re-syncs must not bring it back.
  await B.sync();
  await A.sync();
  await B.sync();
  assert.deepEqual(B.urls(), []);
  assert.deepEqual(A.urls(), []);
});

test("concurrent creates on two devices both converge", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");

  A.add("https://a.example", "A");
  B.add("https://b.example", "B");
  await A.sync();
  await B.sync(); // B sees A, pushes A+B
  await A.sync(); // A now sees B

  const expected = ["https://a.example", "https://b.example"];
  assert.deepEqual(A.urls(), expected);
  assert.deepEqual(B.urls(), expected);
});

test("a title edit propagates as an update, not a duplicate", async () => {
  const t = createMemoryAdapter();
  const A = makeDevice(t, "A");
  const B = makeDevice(t, "B");

  A.add("https://x.example", "Old");
  await A.sync();
  await B.sync();

  // edit title on A
  A.db[0].title = "New";
  await A.sync();
  await B.sync();

  assert.equal(B.db.length, 1);
  assert.equal(B.db[0].title, "New");
});
