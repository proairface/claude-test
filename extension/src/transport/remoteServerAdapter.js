// Talks to a remote self-hosted server. Same protocol as the local agent,
// different base URL + auth (and TLS). Implemented in M6.
// TODO(M6): reuse the localAgent HTTP logic; add bearer/token auth + HTTPS.

/** @returns {import("./adapter.js").TransportAdapter} */
export function createRemoteServerAdapter({ baseUrl, token } = {}) {
  return {
    async pull() { throw new Error("remoteServer.pull not implemented (M6)"); },
    async push(_state, _etag) { throw new Error("remoteServer.push not implemented (M6)"); },
    async health() { throw new Error("remoteServer.health not implemented (M6)"); },
  };
}
