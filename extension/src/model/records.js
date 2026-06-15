// Normalized record model shared by collectors, appliers, and the sync engine.
// See docs/SYNC-PROTOCOL.md for the authoritative spec.

/**
 * @typedef {"bookmark"|"tab"|"visit"} RecordType
 * @typedef {Object} Record
 * @property {string}  id        stable content-hash of the natural key
 * @property {RecordType} type
 * @property {string}  deviceId  origin device
 * @property {number}  lamport   logical clock for ordering
 * @property {number}  updatedAt wall-clock ms (info + tiebreak)
 * @property {boolean} deleted   tombstone flag
 * @property {object}  payload   type-specific (see SYNC-PROTOCOL.md)
 */

/**
 * Stable id from a natural key. Idempotent sync depends on this.
 * TODO(M2): real SHA-256 (SubtleCrypto). Stub returns a deterministic string.
 * @param {RecordType} type
 * @param {object} naturalKey
 * @returns {Promise<string>}
 */
export async function makeId(type, naturalKey) {
  // TODO(M2): return hex(sha256(type + JSON.stringify(sortedKeys(naturalKey))))
  throw new Error("makeId not implemented (M2)");
}
