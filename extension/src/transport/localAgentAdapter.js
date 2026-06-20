// Talks to the local sync agent over http://127.0.0.1 (see agent/).
// This is the adapter that enables file/NFS/SMB/cloud-folder transports: the
// agent owns the filesystem; the extension just calls HTTP. The remote
// self-hosted server (M6) speaks the same protocol, so it reuses this logic.
import { ConcurrencyError } from "./adapter.js";

/**
 * @param {{ baseUrl?: string, token?: string }} [opts]
 * @returns {import("./adapter.js").TransportAdapter}
 */
export function createLocalAgentAdapter({ baseUrl = "http://127.0.0.1:8787", token } = {}) {
  const base = baseUrl.replace(/\/$/, "");
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  return {
    async pull() {
      const res = await fetch(`${base}/state`, { headers: authHeaders });
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
