// In-memory transport adapter. Used by unit tests and as a local stand-in
// before the agent (M3) exists. Implements optimistic concurrency via a simple
// version counter exposed as the ETag, so the engine's retry path is exercised.
import { ConcurrencyError } from "./adapter.js";

/**
 * @param {object} [initial] initial sync state
 * @returns {import("./adapter.js").TransportAdapter & {snapshot: () => object}}
 */
export function createMemoryAdapter(initial = { version: 1, records: {}, updatedAt: 0 }) {
  let state = structuredClone(initial);
  let version = 0;

  return {
    async pull(opts = {}) {
      const etag = String(version);
      if (opts.etag !== undefined && opts.etag === etag) return { notModified: true, etag };
      return { state: structuredClone(state), etag };
    },
    async push(next, etag) {
      if (etag !== undefined && etag !== String(version)) {
        throw new ConcurrencyError(`stale etag ${etag} (current ${version})`);
      }
      state = structuredClone(next);
      version += 1;
      return { etag: String(version) };
    },
    async health() {
      return true;
    },
    snapshot() {
      return structuredClone(state);
    },
    getVersion() {
      return version; // bumps only on push — lets tests assert a push was skipped
    },
  };
}
