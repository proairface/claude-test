// State-based CRDT merge: a grow-only map of last-writer-wins registers with
// tombstones. Converges regardless of sync order — see docs/SYNC-PROTOCOL.md.
import { stableStringify } from "../model/records.js";

/**
 * Decide the winner between two records with the same id.
 * Order by (lamport, deviceId); a tombstone wins an exact tie so deletes
 * converge. Either argument may be undefined (one side doesn't have it).
 * @param {import("../model/records.js").Record} [a]
 * @param {import("../model/records.js").Record} [b]
 * @returns {import("../model/records.js").Record}
 */
export function pickWinner(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.lamport !== b.lamport) return a.lamport > b.lamport ? a : b;
  if (a.deviceId !== b.deviceId) return a.deviceId > b.deviceId ? a : b;
  // Same (lamport, deviceId): prefer a tombstone, else either (they're equal).
  if (a.deleted !== b.deleted) return a.deleted ? a : b;
  return a;
}

/**
 * Merge remote + local record maps and compute what must be applied locally.
 *
 * @param {Record<string, import("../model/records.js").Record>} remote
 * @param {Record<string, import("../model/records.js").Record>} local
 * @param {Record<string, string>} liveLocalHashes
 *   id -> stableStringify(payload) for items currently present in the browser.
 *   Used to decide whether the winning record differs from on-disk reality.
 * @returns {{merged: Record<string, import("../model/records.js").Record>,
 *            toApply: import("../model/records.js").Record[]}}
 */
export function mergeState(remote, local, liveLocalHashes) {
  /** @type {Record<string, import("../model/records.js").Record>} */
  const merged = {};
  const ids = new Set([...Object.keys(remote), ...Object.keys(local)]);
  const toApply = [];

  for (const id of ids) {
    const winner = pickWinner(remote[id], local[id]);
    merged[id] = winner;

    const isLive = Object.prototype.hasOwnProperty.call(liveLocalHashes, id);
    if (winner.deleted) {
      if (isLive) toApply.push(winner); // delete it locally
    } else if (!isLive || liveLocalHashes[id] !== stableStringify(winner.payload)) {
      toApply.push(winner); // create or update locally
    }
  }
  return { merged, toApply };
}

/** Subset of `records` that are not tombstones. */
export function liveRecords(records) {
  /** @type {Record<string, import("../model/records.js").Record>} */
  const out = {};
  for (const [id, rec] of Object.entries(records)) {
    if (!rec.deleted) out[id] = rec;
  }
  return out;
}
