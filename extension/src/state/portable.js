// Portable snapshot (export/import) — a single self-contained .json of your data
// for offline migration to a fresh browser/OS, with no server involved.
// Pure helpers (no browser imports) so they're unit-testable.
import { STATE_SCHEMA_VERSION } from "../model/version.js";
import { makeRecord } from "../model/records.js";

const APP = "browsersync";
const KIND = "snapshot";

/**
 * Build a snapshot envelope from collected items.
 * @param {{deviceId:string, deviceName?:string,
 *          bookmarkItems?:Array<{id:string,payload:object}>,
 *          historyItems?:Array<{id:string,payload:object}>}} parts
 */
export function buildSnapshot({ deviceId, deviceName = "", bookmarkItems = [], historyItems = [] }) {
  const records = {};
  for (const it of bookmarkItems) {
    records[it.id] = makeRecord({ id: it.id, type: "bookmark", deviceId, lamport: 0, payload: it.payload });
  }
  for (const it of historyItems) {
    records[it.id] = makeRecord({ id: it.id, type: "visit", deviceId, lamport: 0, payload: it.payload });
  }
  return {
    app: APP, kind: KIND, schema: STATE_SCHEMA_VERSION, exportedAt: Date.now(),
    device: deviceName || deviceId,
    counts: { bookmark: bookmarkItems.length, visit: historyItems.length },
    records,
  };
}

/** Parse + validate a snapshot file's text. Throws on anything unexpected. */
export function parseSnapshot(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!obj || obj.app !== APP || obj.kind !== KIND || typeof obj.records !== "object" || Array.isArray(obj.records)) {
    throw new Error("That file isn't a BrowserSync snapshot.");
  }
  return obj;
}

/** Live records of a given type from a snapshot. */
export function recordsByType(snapshot, type) {
  return Object.values(snapshot.records ?? {}).filter(
    (r) => (r.type ?? "bookmark") === type && !r.deleted,
  );
}
