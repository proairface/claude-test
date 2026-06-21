// Transport adapter interface. Concrete adapters: localAgent, remoteServer,
// browserStorage. All speak the same pull/push contract so the engine is
// transport-agnostic. See docs/SYNC-PROTOCOL.md for the HTTP shape.

/**
 * @typedef {Object} TransportAdapter
 * @property {() => Promise<{state: object, etag?: string}>} pull
 *   Fetch the current shared sync state.
 * @property {(state: object, etag?: string) => Promise<{etag?: string}>} push
 *   Store the merged state. Should use optimistic concurrency (If-Match) when
 *   the backend supports it and throw a ConcurrencyError on conflict.
 * @property {() => Promise<boolean>} health
 * @property {() => Promise<void>} [preflight]
 *   Optional. Called once at the start of a sync cycle to fail fast on an
 *   unreachable/unauthorized/protocol-incompatible backend. Omit when the
 *   transport has no such concept (e.g. WebDAV, browser storage).
 */

export class ConcurrencyError extends Error {}
