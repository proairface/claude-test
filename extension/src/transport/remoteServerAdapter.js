// Talks to a remote self-hosted server. Identical protocol to the local agent
// (GET/PUT /state, ETag concurrency, bearer token) — only the base URL and TLS
// differ. The server itself is a separate download; this adapter ships in the
// extension because it's just fetch() calls.
import { createLocalAgentAdapter } from "./localAgentAdapter.js";

/**
 * @param {{ baseUrl: string, token?: string }} opts
 * @returns {import("./adapter.js").TransportAdapter}
 */
export function createRemoteServerAdapter({ baseUrl, token } = {}) {
  if (!baseUrl) throw new Error("Self-hosted server transport requires a baseUrl");
  // Same wire protocol as the local agent; reuse its implementation verbatim.
  return createLocalAgentAdapter({ baseUrl, token });
}
