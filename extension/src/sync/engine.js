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
import { STATE_SCHEMA_VERSION, assertStateWritable } from "../model/version.js";
import { validateState, LargeChangeError, RollbackError } from "../model/validate.js";
import { gcTombstones, DEFAULT_RETENTION_MS } from "../model/gc.js";

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
 * Run a full sync cycle for ONE record type. The shared sync state may hold
 * several types (bookmarks, tabs, …); this cycle only touches records of its
 * own `type` and passes the rest through untouched.
 *
 * @param {object} deps
 * @param {import("../transport/adapter.js").TransportAdapter} deps.transport
 * @param {() => Promise<Array<{id:string,payload:object}>>} deps.collect
 * @param {(records: import("../model/records.js").Record[]) => Promise<void>} deps.apply
 * @param {object} deps.store   persistence (see state/store.js)
 * @param {string} [deps.type]  record type, default "bookmark"
 * @param {(rec: import("../model/records.js").Record, deviceId: string) => boolean} [deps.owns]
 *   Whether a baseline record's local presence is THIS device's responsibility.
 *   Defaults to true (shared sets like bookmarks). For per-device sets like
 *   tabs, only the owning device may tombstone its own entries — so a device
 *   never deletes another device's tabs just because it doesn't have them open.
 * @returns {Promise<{applied:number,total:number}>}
 */
export async function runSyncCycle(deps) {
  const {
    transport, collect, apply, store, type = "bookmark", owns = () => true,
    maxRemovals = null, allowLargeChange = false, keep = () => true, mode = "sync",
    dryRun = false, retentionMs = DEFAULT_RETENTION_MS, rollbackGuard = false,
  } = deps;
  // Role modes: "sync" = two-way; "receive" = pull/apply only, never upload;
  // "send" = upload local only, never apply remote.
  const doCollect = mode !== "receive";
  const doApply = mode !== "send";
  const doPush = mode !== "receive";
  const deviceId = await store.getDeviceId();
  const baseline = await store.getBaseline();
  const storedLamport = await store.getLamport();

  // Optional transport preflight (e.g. agent/server protocol-compatibility check).
  if (typeof transport.preflight === "function") await transport.preflight();

  // 1. Snapshot current local reality (skipped entirely in receive-only mode).
  const items = doCollect ? await collect() : [];
  /** @type {Record<string,string>} */
  const liveLocalHashes = {};
  for (const it of items) liveLocalHashes[it.id] = stableStringify(it.payload);

  // Did anything change locally since last cycle? (drives conditional pull)
  let localChanged = false;
  for (const it of items) {
    const b = baseline[it.id];
    if (!b || b.deleted || stableStringify(b.payload) !== liveLocalHashes[it.id]) localChanged = true;
  }
  if (doCollect) {
    for (const [id, rec] of Object.entries(baseline)) {
      if (!rec.deleted && liveLocalHashes[id] === undefined && owns(rec, deviceId) && keep(rec)) {
        localChanged = true;
      }
    }
  }
  const lastEtag = (await store.getLastEtag?.()) ?? null;

  // 2..5 wrapped so an optimistic-concurrency conflict can re-pull and retry.
  for (let attempt = 0; ; attempt++) {
    // Conditional (delta) pull: when nothing changed locally, ask the server to
    // skip the body if the file is unchanged. A 304 means there's nothing to do.
    const conditional = !localChanged && lastEtag != null && !dryRun;
    const pulled = await transport.pull(conditional ? { etag: lastEtag } : {});
    if (pulled.notModified) {
      return { applied: 0, total: Object.keys(baseline).length, skipped: true };
    }
    // Corruption guard: refuse to act on state that isn't plausibly valid.
    validateState(pulled.state);
    // Cross-version safety: never overwrite state from a newer schema major.
    assertStateWritable(pulled.state);
    const allRemote = pulled.state?.records ?? {};

    // Rollback guard: refuse a state whose seq went backwards (possible replay).
    const seq = Number(pulled.state?.seq ?? 0);
    const emptyState = Object.keys(allRemote).length === 0;
    const maxSeen = rollbackGuard ? await (store.getRollbackSeq?.() ?? 0) : 0;
    if (rollbackGuard && !emptyState && seq < maxSeen) throw new RollbackError(seq, maxSeen);

    // Split the shared state into our type (to merge) and everything else
    // (to preserve verbatim on push).
    /** @type {Record<string, import("../model/records.js").Record>} */
    const remote = {};
    /** @type {Record<string, import("../model/records.js").Record>} */
    const otherTypes = {};
    for (const [id, rec] of Object.entries(allRemote)) {
      if ((rec.type ?? "bookmark") === type) remote[id] = rec;
      else otherTypes[id] = rec;
    }

    const tick = Math.max(storedLamport, maxLamport(baseline, allRemote)) + 1;

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
    // Local deletes: items that were live in the baseline but are gone now —
    // restricted to records this device owns (see `owns`). Skipped in
    // receive-only mode (we don't author changes there).
    for (const [id, rec] of Object.entries(doCollect ? baseline : {})) {
      if (rec.deleted || liveLocalHashes[id] !== undefined) continue;
      if (!owns(rec, deviceId)) continue;
      if (!keep(rec)) continue; // excluded items aren't ours to delete
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
    // don't import excluded items; import nothing at all in send-only mode
    const applyList = doApply ? toApply.filter((r) => keep(r)) : [];

    // Dry run: report what would change locally; touch nothing.
    if (dryRun) return { applied: 0, total: Object.keys(merged).length, changes: applyList };

    // Large-change safeguard: pause before applying a lot of removals.
    if (maxRemovals != null && !allowLargeChange) {
      const removals = applyList.reduce((n, r) => n + (r.deleted ? 1 : 0), 0);
      if (removals > maxRemovals) throw new LargeChangeError(removals, maxRemovals, type);
    }

    await apply(applyList);

    // Tombstone GC: forget delete-markers older than the retention window.
    const { records: gcMerged } = gcTombstones(merged, Date.now(), retentionMs);
    const fileRecords = { ...otherTypes, ...gcMerged };
    // Only upload when we actually changed the file — saves bandwidth (and, on
    // the encrypted path, an expensive re-encrypt) on no-op cycles.
    const changed = stableStringify(fileRecords) !== stableStringify(allRemote);

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
        if (err instanceof ConcurrencyError && attempt < 3) continue; // re-pull, retry
        throw err;
      }
    }

    await store.setLamport(tick);
    await store.setBaseline(gcMerged); // baseline holds only this type's records
    await store.setLastEtag?.(newEtag);
    if (rollbackGuard) {
      const finalSeq = pushed ? nextSeq : seq;
      await store.setRollbackSeq?.(emptyState ? finalSeq : Math.max(maxSeen, finalSeq));
    }
    return { applied: applyList.length, total: Object.keys(gcMerged).length };
  }
}
