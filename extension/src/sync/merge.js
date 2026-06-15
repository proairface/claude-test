// State-based CRDT merge: grow-only map of LWW-registers with tombstones.
// Converges regardless of sync order — see docs/SYNC-PROTOCOL.md.

/**
 * Decide the winner between two records with the same id.
 * Order by (lamport, deviceId); a tombstone wins ties.
 * TODO(M2): implement and unit-test thoroughly (this is correctness-critical).
 * @param {import("../model/records.js").Record} a
 * @param {import("../model/records.js").Record} b
 * @returns {import("../model/records.js").Record}
 */
export function pickWinner(a, b) {
  throw new Error("pickWinner not implemented (M2)");
}

/**
 * Merge incoming records into a sync-state map, returning the merged map plus
 * the list of records this device still needs to apply locally.
 * TODO(M2).
 */
export function mergeState(localState, remoteState, selfDeviceId, watermark) {
  throw new Error("mergeState not implemented (M2)");
}
