// Append-only sync for history visits.
//
// Unlike bookmarks/tabs, history is never deleted by sync: clearing history on
// one device must not wipe it everywhere. So this path ADDS visits and never
// tombstones. It is incremental (a watermark cursor) and loop-safe (it skips
// visits whose id is already in the shared state, so re-importing what we just
// applied can't run away — see docs for the Chromium-timestamp caveat).
import { makeRecord, stableStringify } from "../model/records.js";
import { pickWinner } from "./merge.js";
import { ConcurrencyError } from "../transport/adapter.js";
import { STATE_SCHEMA_VERSION, assertStateWritable } from "../model/version.js";
import { validateState, RollbackError } from "../model/validate.js";

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
  const { transport, collect, apply, store, type = "visit", keep = () => true, mode = "sync", dryRun = false, rollbackGuard = false } = deps;
  const doCollect = mode !== "receive";
  const doApply = mode !== "send";
  const doPush = mode !== "receive";
  const deviceId = await store.getDeviceId();
  if (typeof transport.preflight === "function") await transport.preflight();

  const baseline = await store.getBaseline();
  const storedLamport = await store.getLamport();
  const wmStored = await store.getWatermark();
  const watermark = wmStored == null ? (deps.initialWatermark ?? 0) : wmStored;

  // Visits already in the shared state — never re-collect/re-broadcast them.
  const knownIds = new Set(Object.keys(baseline));
  const cycleStart = Date.now();
  const newItems = doCollect ? await collect(watermark, knownIds, deviceId) : [];
  const localChanged = newItems.length > 0;
  const lastEtag = (await store.getLastEtag?.()) ?? null;

  for (let attempt = 0; ; attempt++) {
    // Conditional (delta) pull — skip the body when nothing changed either side.
    const conditional = !localChanged && lastEtag != null && !dryRun;
    const pulled = await transport.pull(conditional ? { etag: lastEtag } : {});
    if (pulled.notModified) {
      await store.setWatermark(cycleStart);
      return { applied: 0, total: Object.keys(baseline).length, skipped: true };
    }
    validateState(pulled.state);
    assertStateWritable(pulled.state);
    const all = pulled.state?.records ?? {};

    const seq = Number(pulled.state?.seq ?? 0);
    const emptyState = Object.keys(all).length === 0;
    const maxSeen = rollbackGuard ? await (store.getRollbackSeq?.() ?? 0) : 0;
    if (rollbackGuard && !emptyState && seq < maxSeen) throw new RollbackError(seq, maxSeen);

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

    if (dryRun) return { applied: 0, total: Object.keys(merged).length, changes: toApply };

    await apply(doApply ? toApply : []);

    const fileRecords = { ...other, ...merged };
    const changed = stableStringify(fileRecords) !== stableStringify(all);
    const nextSeq = seq + 1;
    let newEtag = pulled.etag ?? null;
    let pushed = false;
    if (doPush && changed) {
      try {
        const r = await transport.push(
          { version: STATE_SCHEMA_VERSION, records: fileRecords, updatedAt: Date.now(), seq: nextSeq },
          pulled.etag,
        );
        newEtag = r?.etag ?? null;
        pushed = true;
      } catch (err) {
        if (err instanceof ConcurrencyError && attempt < 3) continue;
        throw err;
      }
    }

    await store.setLamport(tick);
    await store.setBaseline(merged);
    await store.setWatermark(cycleStart); // next cycle collects visits from here on
    await store.setLastEtag?.(newEtag);
    if (rollbackGuard) {
      const finalSeq = pushed ? nextSeq : seq;
      await store.setRollbackSeq?.(emptyState ? finalSeq : Math.max(maxSeen, finalSeq));
    }
    return { applied: doApply ? toApply.length : 0, total: Object.keys(merged).length };
  }
}
