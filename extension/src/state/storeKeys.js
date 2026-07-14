// Pure storage-key helpers (browser-free, testable). Baseline/watermark/lamport
// are namespaced per profile; the "default" profile uses the original
// un-prefixed keys so existing installs keep their bookkeeping.
const sfx = (profileId) => (profileId && profileId !== "default" ? `:${profileId}` : "");

export const keyLamport = (p) => `browsersync:lamport${sfx(p)}`;
export const keyBaseline = (type, p) => `browsersync:baseline${sfx(p)}:${type}`;
export const keyWatermark = (type, p) => `browsersync:watermark${sfx(p)}:${type}`;
// ETag is per-file (per profile), shared across record types.
export const keyEtag = (p) => `browsersync:etag${sfx(p)}`;
// Highest sync-state sequence number seen (per profile) for rollback detection.
export const keyRollbackSeq = (p) => `browsersync:seq${sfx(p)}`;
