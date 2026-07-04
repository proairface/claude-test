// Talks to the local sync agent over http://127.0.0.1 (see agent/).
// This is the adapter that enables file/NFS/SMB/cloud-folder transports: the
// agent owns the filesystem; the extension just calls HTTP. The remote
// self-hosted server (M6) speaks the same protocol, so it reuses this logic.
import { ConcurrencyError } from "./adapter.js";
import { isProtocolCompatible, ProtocolMismatchError, PROTOCOL_VERSION } from "../model/version.js";

/**
 * @param {{ baseUrl?: string, token?: string }} [opts]
 * @returns {import("./adapter.js").TransportAdapter}
 */
export function createLocalAgentAdapter({ baseUrl = "http://127.0.0.1:8787", token } = {}) {
  const base = baseUrl.replace(/\/$/, "");
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  return {
    // Verify the agent is reachable, authorized, and protocol-compatible before
    // syncing — so a stale agent/extension fails with a clear message instead of
    // misbehaving mid-cycle.
    async preflight() {
      let res;
      try {
        res = await fetch(`${base}/health`, { headers: authHeaders });
      } catch {
        throw new Error(`Sync agent/server not reachable at ${base}`);
      }
      if (res.status === 401) throw new Error("Sync agent/server rejected the token (401)");
      if (!res.ok) throw new Error(`Sync agent/server health check failed: ${res.status}`);
      const info = await res.json().catch(() => ({}));
      if (!isProtocolCompatible(info.protocol)) {
        throw new ProtocolMismatchError(info.protocol, PROTOCOL_VERSION, base);
      }
    },

    async pull(opts = {}) {
      const headers = { ...authHeaders };
      if (opts.etag) headers["If-None-Match"] = opts.etag;
      const res = await fetch(`${base}/state`, { headers });
      if (res.status === 304) return { notModified: true, etag: opts.etag };
      if (!res.ok) throw new Error(`agent pull failed: ${res.status}`);
      const state = await res.json();
      return { state, etag: res.headers.get("etag") ?? undefined };
    },

    async push(state, etag) {
      const res = await fetch(`${base}/state`, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          ...(etag !== undefined ? { "If-Match": etag } : {}),
        },
        body: JSON.stringify(state),
      });
      if (res.status === 412) throw new ConcurrencyError("agent etag conflict");
      if (!res.ok) throw new Error(`agent push failed: ${res.status}`);
      const out = await res.json();
      return { etag: out.etag };
    },

    async health() {
      try {
        const res = await fetch(`${base}/health`, { headers: authHeaders });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
