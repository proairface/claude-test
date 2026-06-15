// Talks to the local sync agent over http://127.0.0.1 (see agent/).
// This is the adapter that enables file/NFS/SMB/cloud-folder transports: the
// agent owns the filesystem; the extension just calls HTTP.
// TODO(M3): implement pull/push/health against agent's /state and /health,
// sending the shared auth token; map 412 -> ConcurrencyError.
import { ConcurrencyError } from "./adapter.js";

/** @returns {import("./adapter.js").TransportAdapter} */
export function createLocalAgentAdapter({ baseUrl = "http://127.0.0.1:8787", token } = {}) {
  return {
    async pull() { throw new Error("localAgent.pull not implemented (M3)"); },
    async push(_state, _etag) { throw new Error("localAgent.push not implemented (M3)"); },
    async health() { throw new Error("localAgent.health not implemented (M3)"); },
  };
}
