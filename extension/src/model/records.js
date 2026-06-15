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
 * Deterministic JSON: object keys are sorted recursively so two structurally
 * equal values always stringify identically. This underpins both id hashing
 * and change detection.
 * @param {*} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

/**
 * SHA-256 hex digest of a string, using the platform SubtleCrypto (available in
 * extension service workers and in Node 20+ via globalThis.crypto).
 * @param {string} str
 * @returns {Promise<string>}
 */
export async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stable id from a natural key. Idempotent sync depends on this: the same
 * logical item always hashes to the same id across devices and browsers.
 * @param {RecordType} type
 * @param {object} naturalKey
 * @returns {Promise<string>}
 */
export async function makeId(type, naturalKey) {
  return sha256Hex(`${type}:${stableStringify(naturalKey)}`);
}

/**
 * Construct a normalized Record.
 * @param {Partial<Record> & {id:string,type:RecordType,deviceId:string,lamport:number,payload:object}} r
 * @returns {Record}
 */
export function makeRecord(r) {
  return {
    id: r.id,
    type: r.type,
    deviceId: r.deviceId,
    lamport: r.lamport,
    updatedAt: r.updatedAt ?? Date.now(),
    deleted: r.deleted ?? false,
    payload: r.payload ?? {},
  };
}
