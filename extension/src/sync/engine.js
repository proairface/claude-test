// Orchestrates one sync cycle: collect -> pull -> merge -> apply -> push.
//
// Lamport clocks give each *change* a logical timestamp that strictly exceeds
// anything observed, so last-writer-wins converges. Unchanged items keep their
// previous lamport/deviceId (read from the baseline = last cycle's merged
// state) so a passive device never "wins" over a real edit elsewhere — this is
// what prevents deleted bookmarks from resurrecting.
import { makeRecord, stableStringify } from "../model/records.js";
import { mergeState } from "./merge.js";
import { ConcurrencyError } from "../transport/adapter.js";

function maxLamport(...maps) {
  let m = 0;
  for (const map of maps) {
    for (const rec of Object.values(map ?? {})) {
      if (rec.lamport > m) m = rec.lamport;
    }
  }
  return m;
}

/**
 * Run a full sync cycle for one record type (bookmarks in M2).
 *
 * @param {object} deps
 * @param {import("../transport/adapter.js").TransportAdapter} deps.transport
 * @param {() => Promise<Array<{id:string,payload:object}>>} deps.collect
 * @param {(records: import("../model/records.js").Record[]) => Promise<void>} deps.apply
 * @param {object} deps.store   persistence (see state/store.js)
 * @param {string} [deps.type]  record type, default "bookmark"
 * @returns {Promise<{applied:number,total:number}>}
 */
export async function runSyncCycle(deps) {
  const { transport, collect, apply, store, type = "bookmark" } = deps;
  const deviceId = await store.getDeviceId();
  const baseline = await store.getBaseline();
  const storedLamport = await store.getLamport();

  // 1. Snapshot current local reality.
  const items = await collect();
  /** @type {Record<string,string>} */
  const liveLocalHashes = {};
  for (const it of items) liveLocalHashes[it.id] = stableStringify(it.payload);

  // 2..5 wrapped so an optimistic-concurrency conflict can re-pull and retry.
  for (let attempt = 0; ; attempt++) {
    const pulled = await transport.pull();
    const remote = pulled.state?.records ?? {};

    const tick = Math.max(storedLamport, maxLamport(baseline, remote)) + 1;

    // Reconstruct this device's view of every item, reusing baseline lamports
    // for things that haven't changed locally since last cycle.
    /** @type {Record<string, import("../model/records.js").Record>} */
    const local = {};
    for (const it of items) {
      const base = baseline[it.id];
      const unchanged =
        base && !base.deleted && stableStringify(base.payload) === liveLocalHashes[it.id];
      local[it.id] = unchanged
        ? base
        : makeRecord({ id: it.id, type, deviceId, lamport: tick, payload: it.payload });
    }
    // Local deletes: items that were live in the baseline but are gone now.
    for (const [id, rec] of Object.entries(baseline)) {
      if (rec.deleted || liveLocalHashes[id] !== undefined) continue;
      local[id] = makeRecord({
        id,
        type: rec.type,
        deviceId,
        lamport: tick,
        deleted: true,
        payload: rec.payload,
      });
    }

    const { merged, toApply } = mergeState(remote, local, liveLocalHashes);
    await apply(toApply);

    try {
      await transport.push(
        { version: 1, records: merged, updatedAt: Date.now() },
        pulled.etag,
      );
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < 3) continue; // re-pull, retry
      throw err;
    }

    await store.setLamport(tick);
    await store.setBaseline(merged);
    return { applied: toApply.length, total: Object.keys(merged).length };
  }
}
