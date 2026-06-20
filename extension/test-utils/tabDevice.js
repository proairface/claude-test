// Test harness: an in-memory device that syncs its OPEN TABS (a per-device set).
// Mirrors the real tab collector/applier semantics (list-only: apply is a no-op)
// so tests can drive several devices against one shared transport.
// Lives outside test/ so the runner doesn't treat it as a test file.
import { runSyncCycle } from "../src/sync/engine.js";
import { makeId } from "../src/model/records.js";

export function makeTabDevice(transport, deviceId, deviceName = "") {
  /** @type {Array<{url:string,title:string,windowId:number}>} */
  const tabs = [];

  const collect = async () =>
    Promise.all(
      tabs.map(async (t) => ({
        id: await makeId("tab", { ownerDevice: deviceId, windowId: t.windowId, url: t.url }),
        payload: {
          url: t.url, title: t.title ?? "", ownerDevice: deviceId, deviceName,
          windowId: t.windowId, index: 0, pinned: false,
        },
      })),
    );

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
    open: (url, title = "", windowId = 1) => tabs.push({ url, title, windowId }),
    close: (url, windowId = 1) => {
      const i = tabs.findIndex((t) => t.url === url && t.windowId === windowId);
      if (i >= 0) tabs.splice(i, 1);
    },
    sync: () =>
      runSyncCycle({
        transport,
        collect,
        apply: async () => {}, // list-only
        store,
        type: "tab",
        owns: (rec, self) => rec.payload?.ownerDevice === self,
      }),
  };
}

/** Live (non-tombstone) tab records in a memory adapter, as {owner,url}. */
export function liveTabs(adapter) {
  return Object.values(adapter.snapshot().records)
    .filter((r) => !r.deleted && r.type === "tab")
    .map((r) => ({ owner: r.payload.ownerDevice, url: r.payload.url }));
}
