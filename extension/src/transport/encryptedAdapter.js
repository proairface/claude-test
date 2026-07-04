// Wraps any transport so the sync state is encrypted at rest/in transit. pull()
// decrypts; push() encrypts. Plaintext state (e.g. a brand-new or not-yet-
// migrated store) is read through transparently, and the next push encrypts it.
import { encryptJSON, decryptJSON, isEnvelope } from "./crypto.js";

/**
 * @param {import("./adapter.js").TransportAdapter} inner
 * @param {string} passphrase
 * @returns {import("./adapter.js").TransportAdapter}
 */
export function createEncryptedAdapter(inner, passphrase) {
  const wrapped = {
    async pull(opts) {
      const r = await inner.pull(opts);
      if (r.notModified) return r; // no download, no decrypt
      if (isEnvelope(r.state)) return { state: await decryptJSON(r.state, passphrase), etag: r.etag };
      return r; // plaintext (new/un-migrated) — passes through
    },
    async push(state, etag) {
      return inner.push(await encryptJSON(state, passphrase), etag);
    },
    health: () => inner.health(),
  };
  if (typeof inner.preflight === "function") wrapped.preflight = () => inner.preflight();
  return wrapped;
}
