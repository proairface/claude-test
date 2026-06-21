// Append-only sync for history visits.
//
// Unlike bookmarks/tabs, history is never deleted by sync: clearing history on
// one device must not wipe it everywhere. So this path ADDS visits and never
// tombstones. It is incremental (a watermark cursor) and loop-safe (it skips
// visits whose id is already in the shared state, so re-importing what we just
// applied can't run away — see docs for the Chromium-timestamp caveat).
import { makeRecord } from "../model/records.js";
import { pickWinner } from "./merge.js";
import { ConcurrencyError } from "../transport/adapter.js";
import { STATE_SCHEMA_VERSION, assertStateWritable } from "../model/version.js";
import { validateState } from "../model/validate.js";

function maxLamport(...maps) {
  let m = 0;
  for (const map of maps) for (const r of Object.values(map ?? {})) if (r.lamport > m) m = r.lamport;
  return m;
}

/**
 * @param {object} deps
 * @param {import("../transport/adapter.js").TransportAdapter} deps.transport
 * @param {(since:number, knownIds:Set<string>, deviceId:string) => Promise<Array<{id:string,payload:object}>>} deps.collect
 * @param {(records: import("../model/records.js").Record[]) => Promise<void>} deps.apply
 * @param {object} deps.store
 * @param {number} [deps.initialWatermark] starting cursor when none is stored
 * @param {string} [deps.type]
 * @returns {Promise<{applied:number,total:number}>}
 */
export async function runHistorySync(deps) {
  const { transport, collect, apply, store, type = "visit", keep = () => true } = deps;
  const deviceId = await store.getDeviceId();
  if (typeof transport.preflight === "function") await transport.preflight();

  const baseline = await store.getBaseline();
  const storedLamport = await store.getLamport();
  const wmStored = await store.getWatermark();
  const watermark = wmStored == null ? (deps.initialWatermark ?? 0) : wmStored;

  // Visits already in the shared state — never re-collect/re-broadcast them.
  const knownIds = new Set(Object.keys(baseline));
  const cycleStart = Date.now();
  const newItems = await collect(watermark, knownIds, deviceId);

  for (let attempt = 0; ; attempt++) {
    const pulled = await transport.pull();
    validateState(pulled.state);
    assertStateWritable(pulled.state);
    const all = pulled.state?.records ?? {};

    const remote = {};
    const other = {};
    for (const [id, rec] of Object.entries(all)) {
      if ((rec.type ?? "bookmark") === type) remote[id] = rec;
      else other[id] = rec;
    }

    const tick = Math.max(storedLamport, maxLamport(baseline, all)) + 1;

    // Records for this device's new visits (reuse an existing record if present).
    const local = {};
    for (const it of newItems) {
      local[it.id] =
        remote[it.id] ?? baseline[it.id] ??
        makeRecord({ id: it.id, type, deviceId, lamport: tick, payload: it.payload });
    }

    // Additive union — no tombstoning.
    const merged = { ...remote };
    for (const [id, rec] of Object.entries(local)) merged[id] = pickWinner(remote[id], rec);

    // Apply visits that are NEW to us (not seen last cycle) and not our own.
    const toApply = [];
    for (const [id, rec] of Object.entries(merged)) {
      if (rec.deleted) continue;
      if (baseline[id]) continue;
      if (rec.payload?.ownerDevice === deviceId) continue;
      if (!keep(rec)) continue; // excluded by user filters
      toApply.push(rec);
    }

    await apply(toApply);

    try {
      await transport.push(
        { version: STATE_SCHEMA_VERSION, records: { ...other, ...merged }, updatedAt: Date.now() },
        pulled.etag,
      );
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < 3) continue;
      throw err;
    }

    await store.setLamport(tick);
    await store.setBaseline(merged);
    await store.setWatermark(cycleStart); // next cycle collects visits from here on
    return { applied: toApply.length, total: Object.keys(merged).length };
  }
}
