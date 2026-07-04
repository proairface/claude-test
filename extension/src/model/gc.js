// Tombstone garbage collection: drop delete-markers older than a retention
// window so the sync blob doesn't grow forever. Any device that syncs within
// the window has already seen the deletion; older-than-window tombstones are
// safe to forget. Pure + unit-tested.

export const DEFAULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Return a copy of `records` with tombstones older than `retentionMs` removed.
 * Live records are always kept.
 * @param {Record<string, import("./records.js").Record>} records
 * @param {number} nowMs
 * @param {number} [retentionMs]
 * @returns {{ records: Record<string, object>, removed: number }}
 */
export function gcTombstones(records, nowMs, retentionMs = DEFAULT_RETENTION_MS) {
  const out = {};
  let removed = 0;
  for (const [id, rec] of Object.entries(records)) {
    if (rec.deleted && nowMs - (rec.updatedAt ?? 0) > retentionMs) {
      removed += 1;
      continue;
    }
    out[id] = rec;
  }
  return { records: out, removed };
}
