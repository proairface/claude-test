// Shared test harness: a minimal in-memory "browser" device.
//
// Models a local bookmark DB plus the per-device sync store, then exposes
// collect/apply that mirror the real collector/applier semantics at the data
// level (identity = url + parentPath). This isolates engine/merge/transport
// behavior from the actual browser APIs and lets a test drive several devices
// against one shared transport.
//
// Lives outside test/ so the test runner doesn't treat it as a test file.
import { runSyncCycle } from "../src/sync/engine.js";
import { makeId } from "../src/model/records.js";

export function makeDevice(transport, deviceId) {
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

  return {
    db,
    sync: () => runSyncCycle({ transport, collect, apply, store, type: "bookmark" }),
    urls: () => db.map((b) => b.url).sort(),
    add: (url, title, parentPath = ["bar"]) => db.push({ url, title, parentPath, index: 0 }),
    del: (url, parentPath = ["bar"]) => {
      const b = find(url, parentPath);
      if (b) db.splice(db.indexOf(b), 1);
    },
  };
}
